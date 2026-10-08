import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.argv[2];
assert.ok(root, "usage: node analyze.mjs EVIDENCE_DIRECTORY");
const terminal = JSON.parse(
  await readFile(join(root, "terminal.json"), "utf8"),
);
assert.equal(terminal.status, "complete");
const queries = JSON.parse(await readFile(join(root, "queries.json"), "utf8"));
const records = terminal.records.filter((r) => r.queryId);
assert.equal(records.length, queries.length * 8);
for (const r of terminal.records) {
  assert.equal(r.exitCode, 0, `${r.arm}/${r.id} failed`);
  assert.equal(r.timedOut, false);
}
for (const r of records) {
  const text = await readFile(join(root, r.arm, `${r.id}.stdout`), "utf8");
  const paths = [...text.matchAll(/^#\d+ .*? (src\/[^\r\n]+?):\d+/gm)].map(
    (m) => m[1],
  );
  assert.deepEqual(paths, r.paths);
  const expected = queries.find((q) => q.id === r.queryId).expectedPaths;
  const rank = paths.findIndex((p) => expected.includes(p));
  assert.equal(r.hit1, rank === 0);
  assert.equal(r.hit5, rank >= 0 && rank < 5);
  assert.equal(r.rr5, rank >= 0 && rank < 5 ? 1 / (rank + 1) : 0);
  if (r.rep === 0) {
    const repeat = records.find(
      (s) =>
        s.arm === r.arm &&
        s.route === r.route &&
        s.queryId === r.queryId &&
        s.rep === 1,
    );
    assert.deepEqual(
      paths,
      repeat.paths,
      "repetitions differ; do not collapse counts",
    );
  }
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[half]
    : (sorted[half - 1] + sorted[half]) / 2;
}
const rows = [];
for (const arm of ["local", "gemini"])
  for (const route of ["vector", "hybrid"])
    for (const language of ["all", "en", "zh"]) {
      const all = records.filter(
        (r) =>
          r.arm === arm &&
          r.route === route &&
          (language === "all" || r.language === language),
      );
      const first = all.filter((r) => r.rep === 0);
      rows.push({
        arm,
        route,
        language,
        queries: first.length,
        hit1: first.filter((r) => r.hit1).length,
        hit5: first.filter((r) => r.hit5).length,
        mrr5: first.reduce((s, r) => s + r.rr5, 0) / first.length,
        medianWallMs: median(all.map((r) => r.wallMs)),
        rangeWallMs: [
          Math.min(...all.map((r) => r.wallMs)),
          Math.max(...all.map((r) => r.wallMs)),
        ],
      });
    }
console.log(
  JSON.stringify(
    { rawQueriesVerified: records.length, repetitionsIdentical: true, rows },
    null,
    2,
  ),
);
