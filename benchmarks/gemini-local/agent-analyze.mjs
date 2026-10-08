import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.argv[2];
assert.ok(root, 'usage: node agent-analyze.mjs EVIDENCE_DIRECTORY');
const terminal = JSON.parse(await readFile(join(root, 'terminal.json'), 'utf8'));
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
// Standard USD/M tokens, checked 2026-10-08; Flash rates expire 2026-12-31.
const rates = {
  'gemini-3.1-pro-preview': { input: 2, cached: 0.2, output: 12 },
  'gemini-3.8-flash': { input: 0.75, cached: 0.075, output: 3.75 },
}[manifest.model];
assert.ok(rates, 'Unknown model pricing; do not silently price as Pro');
assert.equal(terminal.status, 'complete', 'Partial cohorts require explicit analysis');
const cases = JSON.parse(await readFile(join(root, 'cases.json'), 'utf8'));
const rows = terminal.records;
const median = xs => {
  const ys = [...xs].sort((a, b) => a - b);
  return ys.length % 2 ? ys[(ys.length - 1) / 2] : (ys[ys.length / 2 - 1] + ys[ys.length / 2]) / 2;
};
const sum = (xs, key) => xs.reduce((s, x) => s + x[key], 0);
const usage = { A: [], B: [] };
const embeddings = { A: [], B: [] };
const versions = new Set();
for (const row of rows) {
  const dir = join(root, `${row.caseId}-${row.arm}-r${row.rep + 1}`);
  const files = await readdir(dir);
  for (const file of files.filter(f => /^turn-\d+-response.json$/.test(f))) {
    const response = JSON.parse(await readFile(join(dir, file), 'utf8'));
    if (response.data.modelVersion) versions.add(response.data.modelVersion);
    if (response.data.usageMetadata) usage[row.arm].push(response.data.usageMetadata);
  }
  if (files.includes('embedding-usage.jsonl')) {
    const text = await readFile(join(dir, 'embedding-usage.jsonl'), 'utf8');
    embeddings[row.arm].push(...text.trim().split('\n').filter(Boolean).map(JSON.parse));
  }
  const expected = cases.find(c => c.id === row.caseId).expected;
  const correct = Object.entries(expected).filter(([k, v]) => !row.failure && row.answer?.answers?.[k] === v).length;
  assert.equal(correct, row.correctFields, `Score mismatch ${row.caseId}/${row.arm}/${row.rep}`);
  assert.equal(correct === Object.keys(expected).length, row.exact);
}
const summary = { status: terminal.status, sessions: rows.length, modelVersions: [...versions], wallSeconds: terminal.wallMs / 1000, arms: {}, pairs: {} };
for (const arm of ['A', 'B']) {
  const r = rows.filter(x => x.arm === arm);
  const u = usage[arm];
  const tokens = {
    input: u.reduce((s, x) => s + (x.promptTokenCount ?? 0), 0),
    cached: u.reduce((s, x) => s + (x.cachedContentTokenCount ?? 0), 0),
    candidates: u.reduce((s, x) => s + (x.candidatesTokenCount ?? 0), 0),
    thinking: u.reduce((s, x) => s + (x.thoughtsTokenCount ?? 0), 0),
  };
  summary.arms[arm] = {
    sessions: r.length, correct: r.filter(x => x.exact).length,
    correctFields: sum(r, 'correctFields'), totalFields: sum(r, 'totalFields'),
    failures: r.filter(x => x.failure).map(x => ({ case: x.caseId, rep: x.rep, kind: x.failureKind, error: x.failure })),
    wrongAnswers: r.filter(x => !x.failure && !x.exact).map(x => ({ case: x.caseId, rep: x.rep, answers: x.answer.answers })),
    toolErrors: r.reduce((s, x) => s + x.toolErrors.length, 0),
    searches: sum(r, 'searches'), tools: sum(r, 'toolCalls'), calls: u.length,
    medianSeconds: median(r.map(x => x.wallMs / 1000)),
    minSeconds: Math.min(...r.map(x => x.wallMs / 1000)), maxSeconds: Math.max(...r.map(x => x.wallMs / 1000)),
    citedGoldRange: r.filter(x => x.evidenceOverlap).length,
    language: Object.fromEntries(['en', 'zh'].map(l => [l, { total: r.filter(x => x.language === l).length, correct: r.filter(x => x.language === l && x.exact).length }])),
    repetition: [0, 1].map(rep => ({ rep, total: r.filter(x => x.rep === rep).length, correct: r.filter(x => x.rep === rep && x.exact).length })),
    tokens, generationEstimateUSD: ((tokens.input - tokens.cached) * rates.input + tokens.cached * rates.cached + (tokens.candidates + tokens.thinking) * rates.output) / 1e6,
    embeddingEvents: embeddings[arm].length,
    embeddingInputTokens: embeddings[arm].reduce((s, x) => s + (x.usageMetadata?.promptTokenCount ?? 0), 0),
  };
}
for (const a of rows.filter(x => x.arm === 'A')) {
  const b = rows.find(x => x.arm === 'B' && x.caseId === a.caseId && x.rep === a.rep);
  assert.ok(b, 'Unpaired session');
  const name = a.exact ? b.exact ? 'bothCorrect' : 'localOnly' : b.exact ? 'geminiOnly' : 'bothWrong';
  summary.pairs[name] = (summary.pairs[name] ?? 0) + 1;
}
console.log(JSON.stringify(summary, null, 2));
