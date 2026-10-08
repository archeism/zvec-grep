import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
test(
  "installed Gemini package requires consent and retrieves real embeddings",
  {
    skip: process.env.ZG_GEMINI_LIVE !== "1",
    timeout: 180_000,
  },
  async (t) => {
    assert.ok(
      process.env.ZG_GEMINI_CLI,
      "provide the installed package CLI path",
    );
    assert.ok(
      process.env.GEMINI_API_KEY_FILE,
      "provide a credential file, never its value",
    );
    const root = await mkdtemp(join(tmpdir(), "zg-gemini-live-"));
    t.after(() =>
      process.env.ZG_KEEP_FIXTURE === "1"
        ? t.diagnostic(`fixture=${root}`)
        : rm(root, { recursive: true, force: true }),
    );
    const repo = join(root, "fixture");
    await mkdir(repo);
    await writeFile(
      join(repo, "auth.ts"),
      "export function validateSessionToken(token: string) { return token === 'synthetic-valid-token'; }\n",
    );
    await writeFile(
      join(repo, "weather.ts"),
      "export function celsiusToFahrenheit(celsius: number) { return celsius * 9 / 5 + 32; }\n",
    );
    const usagePath = join(root, "usage.jsonl");
    const env = {
      ...process.env,
      ZVEC_GREP_HOME: join(root, "state"),
      ZVEC_GREP_MODE: "direct",
      ZVEC_GREP_USAGE_LOG: usagePath,
    };
    for (const key of [
      "ZVEC_GREP_API_KEY",
      "GEMINI_API_KEY",
      "ZVEC_GREP_ENDPOINT",
      "ZVEC_GREP_EMBEDDING",
      "ZVEC_GREP_EMBEDDING_CACHE",
      "ZVEC_GREP_SERVER_URL",
    ])
      delete env[key];
    const run = (args) =>
      exec(process.env.ZG_GEMINI_CLI, args, {
        cwd: repo,
        env,
        timeout: 90_000,
      });
    const start = Date.now();
    await assert.rejects(
      run([
        "index",
        "--embedding",
        "google/gemini-embedding-2",
        "--mode",
        "direct",
      ]),
      (error) => {
        assert.match(error.stderr, /authorization|allow-remote/i);
        return true;
      },
    );
    await assert.rejects(readFile(usagePath), { code: "ENOENT" });
    const indexed = await run([
      "index",
      "--embedding",
      "google/gemini-embedding-2",
      "--mode",
      "direct",
      "--allow-remote",
    ]);
    t.diagnostic(`index=${indexed.stdout}`);
    const beforeQuery = await readFile(usagePath, "utf8");
    await assert.rejects(
      run([
        "query",
        "where are session tokens validated",
        "--mode",
        "direct",
        "--refresh",
        "off",
      ]),
      (error) => {
        assert.match(error.stderr, /authorization|allow-remote/i);
        return true;
      },
    );
    assert.equal(await readFile(usagePath, "utf8"), beforeQuery);
    const result = await run([
      "query",
      "--vector",
      "where are session tokens validated",
      "--mode",
      "direct",
      "--refresh",
      "off",
      "--allow-remote",
      "--limit",
      "1",
      "--preview",
      "short",
    ]);
    if (!result.stdout.includes("auth.ts")) {
      const debug = await run([
        "query",
        "--vector",
        "where are session tokens validated",
        "--mode",
        "direct",
        "--refresh",
        "off",
        "--allow-remote",
        "--limit",
        "5",
        "--preview",
        "short",
      ]);
      t.diagnostic(`vector=${debug.stdout}`);
      t.diagnostic(`status=${(await run(["status"])).stdout}`);
    }
    assert.match(result.stdout, /auth\.ts/);
    const events = (await readFile(usagePath, "utf8"))
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.ok(
      events.some((event) => event.purpose === "document" && !event.cacheHit),
    );
    assert.ok(
      events.some((event) => event.purpose === "query" && !event.cacheHit),
    );
    assert.ok(events.every((event) => event.dimension === 3072));
    t.diagnostic(
      JSON.stringify({
        wallMs: Date.now() - start,
        requests: events.length,
        usage: events.map(({ purpose, usageMetadata }) => ({
          purpose,
          usageMetadata,
        })),
      }),
    );
  },
);
