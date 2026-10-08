import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getEmbeddingModelCatalogEntry } from "../../../dist/engine/models/catalog.js";
import { GeminiEmbedding2Model } from "../../../dist/engine/models/backends/google.js";

const entry = getEmbeddingModelCatalogEntry("google/gemini-embedding-2");
const vector = Array(3072).fill(0.25);

test("Gemini Embedding 2 uses separate prefixed requests", async () => {
  const requests = [];
  const model = new GeminiEmbedding2Model(
    entry,
    { apiKey: "secret", endpoint: "https://example.test/embed" },
    {
      fetch: async (_url, init) => {
        requests.push({ headers: init.headers, body: JSON.parse(init.body) });
        return new Response(JSON.stringify({ embedding: { values: vector } }));
      },
    },
  );
  const documents = await model.embed([
    { kind: "text", text: "first" },
    { kind: "text", text: "second" },
  ]);
  const query = await model.embed([{ kind: "text", text: "find it" }], {
    purpose: "query",
  });
  assert.equal(documents.vectors.length, 2);
  assert.equal(query.vectors.length, 1);
  assert.equal(requests.length, 3);
  assert.equal(
    requests[0].body.content.parts[0].text,
    "title: none | text: first",
  );
  assert.equal(
    requests[2].body.content.parts[0].text,
    "task: code retrieval | query: find it",
  );
  assert.equal(requests[0].body.taskType, undefined);
  assert.equal(requests[0].headers["x-goog-api-key"], "secret");
});

test("Gemini Embedding 2 caches exact prefixed inputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "zg-google-cache-"));
  const previousCache = process.env.ZVEC_GREP_EMBEDDING_CACHE;
  const previousLog = process.env.ZVEC_GREP_USAGE_LOG;
  process.env.ZVEC_GREP_EMBEDDING_CACHE = join(root, "cache");
  process.env.ZVEC_GREP_USAGE_LOG = join(root, "usage.jsonl");
  let requests = 0;
  try {
    const model = new GeminiEmbedding2Model(
      entry,
      { apiKey: "secret", endpoint: "https://example.test/embed" },
      {
        fetch: async () => {
          requests += 1;
          return new Response(
            JSON.stringify({ embedding: { values: vector } }),
          );
        },
      },
    );
    await model.embed([
      { kind: "text", text: "same" },
      { kind: "text", text: "same" },
    ]);
    await model.embed([{ kind: "text", text: "same" }]);
    assert.equal(requests, 1);
    const usage = (await readFile(process.env.ZVEC_GREP_USAGE_LOG, "utf8"))
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.deepEqual(usage.map(({ cacheHit }) => cacheHit).sort(), [
      false,
      true,
      true,
    ]);
    assert.ok(usage.every(({ inputSha256 }) => inputSha256.length === 64));
  } finally {
    if (previousCache === undefined)
      delete process.env.ZVEC_GREP_EMBEDDING_CACHE;
    else process.env.ZVEC_GREP_EMBEDDING_CACHE = previousCache;
    if (previousLog === undefined) delete process.env.ZVEC_GREP_USAGE_LOG;
    else process.env.ZVEC_GREP_USAGE_LOG = previousLog;
    await rm(root, { recursive: true, force: true });
  }
});
