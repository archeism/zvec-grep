import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, appendFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const repo = resolve(here, "../..");
const output = resolve(process.argv[2] || "");
assert.ok(process.argv[2], "usage: node run.mjs NEW_EVIDENCE_DIRECTORY");
await mkdir(output); // Refuse to overwrite or reuse an earlier attempt.
const queriesBytes = await readFile(join(here, "queries.json"));
const queries = JSON.parse(queriesBytes);
const sha = "b1a9148e26a7bc9bd4a52229ffb7532d3063793d";
const cli = process.env.ZG_COMPARE_CLI;
assert.ok(cli && process.env.GEMINI_API_KEY_FILE);
const models = {
  local: "local/potion-code-16m-v2",
  gemini: "google/gemini-embedding-2",
};
const hash = (x) => createHash("sha256").update(x).digest("hex");
const archive = execFileSync("git", ["archive", sha, "src"], {
  cwd: repo,
  maxBuffer: 8 * 1024 * 1024,
});
assert.ok(archive.length < 4 * 1024 * 1024, "corpus budget exceeded");
const cgroupLine = (await readFile("/proc/self/cgroup", "utf8"))
  .trim()
  .split("\n")
  .find((x) => x.startsWith("0::"));
assert.ok(cgroupLine);
const cgroup = join("/sys/fs/cgroup", cgroupLine.slice(3));
const readOptional = async (path) => {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
};
async function snapshot() {
  const cpu = Object.fromEntries(
    (await readFile(join(cgroup, "cpu.stat"), "utf8"))
      .trim()
      .split("\n")
      .map((x) => x.split(" ")),
  );
  assert.ok(cpu.usage_usec);
  return {
    time: performance.now(),
    cpuUsec: Number(cpu.usage_usec),
    memory: Number(await readFile(join(cgroup, "memory.current"), "utf8")),
    io: await readOptional(join(cgroup, "io.stat")),
  };
}
const manifest = {
  sourceSha: sha,
  corpusTarSha256: hash(archive),
  corpusTarBytes: archive.length,
  apparatusSha: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repo,
    encoding: "utf8",
  }).trim(),
  queriesSha256: hash(queriesBytes),
  cliVersion: execFileSync(cli, ["--version"], { encoding: "utf8" }).trim(),
  node: process.version,
  models,
  queryCount: queries.length,
  repetitions: 2,
  routes: ["vector", "hybrid"],
  limit: 5,
  refresh: "off",
  mode: "direct",
  samplingMs: 50,
  limits: {
    memoryMiB: 2048,
    cpuQuotaPercent: 200,
    tasks: 512,
    diskBytes: 2 * 1024 ** 3,
  },
  measurement:
    "Scoped cgroup CPU delta, sampled whole-cgroup memory and peak cores; includes runner overhead. I/O null if controller unavailable. OS caches uncontrolled; model cache initially empty; each CLI query reloads its model. No LLM judge.",
  tokenAccounting:
    "Gemini provider promptTokenCount summed per emitted event; document cache disabled. Local billing tokens inapplicable; local tokenizer work unmeasured. Hosted model alias can drift.",
};
await writeFile(
  join(output, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
await writeFile(join(output, "queries.json"), queriesBytes);
const baseEnv = {
  ...process.env,
  OMP_NUM_THREADS: "2",
  ZVEC_GREP_MODE: "direct",
  NO_COLOR: "1",
};
for (const name of [
  "ZVEC_GREP_API_KEY",
  "GEMINI_API_KEY",
  "ZVEC_GREP_ENDPOINT",
  "ZVEC_GREP_EMBEDDING",
  "ZVEC_GREP_EMBEDDING_CACHE",
  "ZVEC_GREP_SERVER_URL",
  "ZVEC_GREP_DEVICE",
])
  delete baseEnv[name];
const records = [];
function rankPaths(text) {
  return [...text.matchAll(/^#\d+ .*? (src\/[^\r\n]+?):\d+/gm)].map(
    (match) => match[1],
  );
}
assert.deepEqual(
  rankPaths(
    "#1 matchedBy=vector src/a.ts:1\n#2 matchedBy=fts+vector src/b.ts:2",
  ),
  ["src/a.ts", "src/b.ts"],
);
const score = (paths, expected) => {
  const i = paths.findIndex((x) => expected.includes(x));
  return {
    hit1: i === 0,
    hit5: i >= 0 && i < 5,
    rr5: i >= 0 && i < 5 ? 1 / (i + 1) : 0,
  };
};
assert.equal(score(["wrong"], ["right"]).hit5, false); // Negative control.
assert.equal(score(["right"], ["right"]).hit1, true);
async function command(arm, id, args, timeoutMs = 60_000) {
  const dir = join(output, arm);
  const env = {
    ...baseEnv,
    ZVEC_GREP_HOME: join(dir, "home"),
    ZVEC_GREP_MODEL_CACHE: join(output, "model-cache"),
    ZVEC_GREP_USAGE_LOG: join(dir, "usage.jsonl"),
  };
  if (arm === "local") delete env.GEMINI_API_KEY_FILE;
  const before = await snapshot();
  let previous = before;
  let peakMemory = before.memory;
  let peakCores = 0;
  const samples = [];
  let sampling = false;
  const interval = setInterval(async () => {
    if (sampling) return;
    sampling = true;
    try {
      const sample = await snapshot();
      peakMemory = Math.max(peakMemory, sample.memory);
      peakCores = Math.max(
        peakCores,
        (sample.cpuUsec - previous.cpuUsec) /
          ((sample.time - previous.time) * 1000),
      );
      samples.push(sample);
      previous = sample;
    } finally {
      sampling = false;
    }
  }, 50);
  let stdout = "";
  let stderr = "";
  let timedOut = false;
  const child = spawn(cli, args, {
    cwd: join(dir, "corpus"),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (x) => {
    stdout += x;
  });
  child.stderr.on("data", (x) => {
    stderr += x;
  });
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, timeoutMs);
  const exitCode = await new Promise((done, reject) => {
    child.on("error", reject);
    child.on("close", done);
  });
  clearInterval(interval);
  clearTimeout(timeout);
  const after = await snapshot();
  const record = {
    arm,
    id,
    exitCode,
    timedOut,
    wallMs: after.time - before.time,
    cpuSeconds: (after.cpuUsec - before.cpuUsec) / 1e6,
    peakCores,
    memoryBefore: before.memory,
    memoryPeakSampled: Math.max(peakMemory, after.memory),
    memoryAfter: after.memory,
    ioBefore: before.io,
    ioAfter: after.io,
    stdoutBytes: Buffer.byteLength(stdout),
  };
  await writeFile(join(dir, `${id}.stdout`), stdout);
  await writeFile(join(dir, `${id}.stderr`), stderr);
  await writeFile(join(dir, `${id}.resources.json`), JSON.stringify(samples));
  return { record, stdout, stderr };
}
try {
  for (const arm of ["local", "gemini"]) {
    const corpus = join(output, arm, "corpus");
    await mkdir(corpus, { recursive: true });
    execFileSync("tar", ["-xf", "-", "-C", corpus], { input: archive });
    for (const query of queries)
      for (const path of query.expectedPaths) await stat(join(corpus, path));
    console.log(`Indexing ${arm}: ${models[arm]}`);
    const { record, stdout } = await command(
      arm,
      "index",
      [
        "index",
        "--embedding",
        models[arm],
        "--mode",
        "direct",
        "--embedding-concurrency",
        "1",
        ...(arm === "gemini" ? ["--allow-remote"] : ["--device", "cpu"]),
      ],
      600_000,
    );
    records.push(record);
    await appendFile(
      join(output, "journal.jsonl"),
      JSON.stringify(record) + "\n",
    );
    assert.equal(
      record.exitCode,
      0,
      `${arm} index failed; see retained stderr`,
    );
    assert.match(stdout, /0 failed/);
    const status = await command(arm, "status", ["status"]);
    assert.equal(status.record.exitCode, 0);
    assert.match(status.stdout, /0 pending.*0 failed/);
    const bytes = Number(
      execFileSync("du", ["-s", "-B1", output], { encoding: "utf8" }).split(
        /\s/,
      )[0],
    );
    assert.ok(bytes <= manifest.limits.diskBytes, "disk budget exceeded");
    console.log(
      `${arm} indexed in ${(record.wallMs / 1000).toFixed(1)}s; allocated ${bytes} bytes`,
    );
  }
  for (let rep = 0; rep < 2; rep++) {
    const list = rep === 0 ? queries : [...queries].reverse();
    for (let i = 0; i < list.length; i++) {
      const query = list[i];
      for (const route of rep === 0
        ? ["vector", "hybrid"]
        : ["hybrid", "vector"]) {
        const order =
          (rep + i) % 2 === 0 ? ["local", "gemini"] : ["gemini", "local"];
        for (const arm of order) {
          const id = `${query.id}-${route}-r${rep + 1}`;
          const { record, stdout } = await command(arm, id, [
            "query",
            `--${route}`,
            query.query,
            "--mode",
            "direct",
            "--refresh",
            "off",
            "--limit",
            "5",
            "--preview",
            "short",
            ...(arm === "gemini" ? ["--allow-remote"] : []),
          ]);
          const paths = rankPaths(stdout);
          if (record.exitCode === 0 && /hits: [1-9]/.test(stdout))
            assert.ok(paths.length > 0, "result parser lost nonempty hits");
          Object.assign(record, {
            queryId: query.id,
            language: query.language,
            intent: query.intent,
            rep,
            route,
            paths,
            ...score(paths, query.expectedPaths),
          });
          records.push(record);
          await appendFile(
            join(output, "journal.jsonl"),
            JSON.stringify(record) + "\n",
          );
        }
      }
      console.log(
        `repeat ${rep + 1}: ${i + 1}/${list.length} queries complete`,
      );
    }
  }
  await writeFile(
    join(output, "terminal.json"),
    JSON.stringify({ status: "complete", records }, null, 2),
  );
} catch (error) {
  await writeFile(
    join(output, "terminal.json"),
    JSON.stringify(
      { status: "failed", error: String(error), records },
      null,
      2,
    ),
  );
  throw error;
}
