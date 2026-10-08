import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveEmbeddingRuntimeOptions } from "../../../dist/engine/config.js";
import { getEmbeddingModelCatalogEntry } from "../../../dist/engine/models/catalog.js";
import { GeminiEmbedding2Model } from "../../../dist/engine/models/backends/google.js";

const reference = "google/gemini-embedding-2";
const entry = getEmbeddingModelCatalogEntry(reference);
const vector = Array(3072).fill(0.25);
const input = [{ kind: "text", text: "private source text" }];
const response = (values = vector, extra = {}) =>
  new Response(JSON.stringify({ embedding: { values }, ...extra }));
const model = (fetch, endpoint = "https://example.test/embed") =>
  new GeminiEmbedding2Model(
    entry,
    { apiKey: "private-key", endpoint },
    { fetch },
  );

async function withStorage(run) {
  const root = await mkdtemp(join(tmpdir(), "zg-google-hardening-"));
  const names = ["ZVEC_GREP_EMBEDDING_CACHE", "ZVEC_GREP_USAGE_LOG"];
  const previous = names.map((name) => process.env[name]);
  process.env[names[0]] = join(root, "cache");
  process.env[names[1]] = join(root, "usage.jsonl");
  try {
    await run(root);
  } finally {
    names.forEach((name, i) => {
      if (previous[i] === undefined) delete process.env[name];
      else process.env[name] = previous[i];
    });
    await rm(root, { recursive: true, force: true });
  }
}

test("Gemini pre-abort makes no request and preserves cancellation", async () => {
  const controller = new AbortController();
  const reason = new Error("cancelled before request");
  controller.abort(reason);
  let calls = 0;
  await assert.rejects(
    model(async () => {
      calls++;
      return response();
    }).embed(input, {
      signal: controller.signal,
    }),
    (error) => error === reason,
  );
  assert.equal(calls, 0);
});

test("Gemini midflight cancellation reaches fetch and preserves reason", async () => {
  const controller = new AbortController();
  const reason = new Error("cancelled during request");
  let requestSignal;
  const pending = model(async (_url, init) => {
    requestSignal = init.signal;
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason), {
        once: true,
      });
      controller.abort(reason);
    });
  }).embed(input, { signal: controller.signal });
  await assert.rejects(pending, (error) => error === reason);
  assert.equal(requestSignal.aborted, true);
});

test("Gemini invalid vectors never poison persistent cache", async () => {
  await withStorage(async () => {
    for (const invalid of [[0.25], Array(3072).fill("not-a-number")]) {
      let calls = 0;
      const instance = model(async () =>
        response(++calls === 1 ? invalid : vector),
      );
      const content = [{ kind: "text", text: `case-${invalid.length}` }];
      await assert.rejects(instance.embed(content));
      assert.deepEqual((await instance.embed(content)).vectors, [vector]);
      await instance.embed(content);
      assert.equal(calls, 2);
    }
  });
});

test("Gemini cache is isolated by endpoint", async () => {
  await withStorage(async () => {
    let calls = 0;
    const first = model(async () => {
      calls++;
      return response();
    });
    const otherVector = Array(3072).fill(0.75);
    const second = model(async () => {
      calls++;
      return response(otherVector);
    }, "https://other.test/embed");
    await first.embed(input);
    assert.deepEqual((await second.embed(input)).vectors, [otherVector]);
    await first.embed(input);
    await second.embed(input);
    assert.equal(calls, 2);
  });
});

test("Gemini usage logs whitelist token counts, excluding arbitrary provider fields", async () => {
  await withStorage(async (root) => {
    await model(async () =>
      response(vector, {
        usageMetadata: {
          promptTokenCount: 4,
          totalTokenCount: 4,
          text: input[0].text,
          key: "private-key",
        },
      }),
    ).embed(input);
    const bytes = await readFile(join(root, "usage.jsonl"), "utf8");
    assert.deepEqual(JSON.parse(bytes).usageMetadata, {
      promptTokenCount: 4,
      totalTokenCount: 4,
    });
    assert.ok(!bytes.includes(input[0].text));
    assert.ok(!bytes.includes("private-key"));
  });
});

test("Gemini provider errors exclude echoed credentials and source text", async () => {
  await assert.rejects(
    model(
      async () =>
        new Response(
          JSON.stringify({
            error: { message: `private-key ${input[0].text}` },
          }),
          { status: 403 },
        ),
    ).embed(input),
    (error) => {
      const output = `${error.message} ${error.context} ${error.cause}`;
      assert.ok(output.includes("403"));
      assert.ok(!output.includes("private-key"));
      assert.ok(!output.includes(input[0].text));
      return true;
    },
  );
});

test("Gemini credential precedence does not eagerly read an unused key file", async () => {
  await withStorage(async (root) => {
    const missing = join(root, "missing-key");
    const resolve = (env, explicit = {}, workspace = {}, config = {}) =>
      resolveEmbeddingRuntimeOptions(
        reference,
        explicit,
        workspace,
        config,
        env,
      ).apiKey;
    assert.equal(
      resolve({
        GEMINI_API_KEY_FILE: missing,
        ZVEC_GREP_API_KEY: " generic ",
        GEMINI_API_KEY: "gemini",
      }),
      "generic",
    );
    assert.equal(
      resolve({ GEMINI_API_KEY_FILE: missing, GEMINI_API_KEY: " gemini " }),
      "gemini",
    );
    assert.equal(
      resolve({ GEMINI_API_KEY_FILE: missing }, { apiKey: "explicit" }),
      "explicit",
    );
    assert.equal(
      resolve({ GEMINI_API_KEY_FILE: missing }, {}, { apiKey: "workspace" }),
      "workspace",
    );
    assert.equal(
      resolve(
        { GEMINI_API_KEY_FILE: missing },
        {},
        {},
        { providers: { google: { apiKey: "configured" } } },
      ),
      "configured",
    );
    const path = join(root, "key");
    await writeFile(path, " file-key\n", { mode: 0o600 });
    assert.equal(
      resolve({ GEMINI_API_KEY_FILE: path, GEMINI_API_KEY: " " }),
      "file-key",
    );
  });
});
