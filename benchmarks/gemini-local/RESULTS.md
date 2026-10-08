# Gemini versus default local model — 2026-10-08

**Gemini materially improved expected-file retrieval on this small exploratory
set. Use explicit vector search; hybrid fusion erased much of its advantage.**
This is not a benchmark of all local models, final answers, or production Acts.

Frozen apparatus: `fbb7dafccd9d412ca24d90c50f7b732f757744c6`.
Package: `@charfeng1/zgrep@0.2.2-gemini.2`, Node 22.23.1, Linux x64.
133 public source files, 2,030 indexed entities per arm, zero failed/pending or
truncated entities. Source SHA and model revisions are in README/manifest.
16 independently source-grounded, agent-authored English intents plus eight
Chinese translations; not human-validated labels or 24 independent intents.

## Quality

Both repetitions returned identical ordered file paths for all queries. Counts
below show one repetition, not inflated totals across repeats. A hit means the
labelled file appears among the first K returned chunks; not K distinct files,
nor proof that the exact answering passage or a correct final answer was found.

| Model / route | Top 1 /24 | Top 5 /24 | MRR@5 | English top 5 /16 | Chinese top 5 /8 |
|---|---:|---:|---:|---:|---:|
| Local Potion 16M / vector | 2 | 7 | 0.163 | 6 | 1 |
| Gemini Embedding 2 / vector | 12 | 20 | 0.605 | 14 | 6 |
| Local Potion 16M / hybrid | 1 | 7 | 0.128 | 6 | 1 |
| Gemini Embedding 2 / hybrid | 7 | 13 | 0.367 | 7 | 6 |

An independent reviewer reparsed all 192 raw outputs: no command failures,
timeouts, parser disagreements or score discrepancies. 134 outputs repeated a
file among the five chunks; no post-hoc deduplication improved these scores.

## Time, usage, resources

| Measure | Local | Gemini |
|---|---:|---:|
| Index wall time, one run | 14.54s | 60.32s |
| Vector CLI median, 48 calls | 2.047s | 2.031s |
| Vector CLI min–max | 1.904–3.305s | 1.895–2.822s |
| Hybrid CLI median, 48 calls | 2.018s | 2.035s |
| Index CPU seconds | 13.60 | 29.82 |
| All query CPU seconds, 96 calls | 234.76 | 215.21 |
| Allocated index storage, rounded | 12 MiB | 32 MiB |
| Remote embedding input tokens | not applicable | 501,983 indexing + 2,664 querying |

Gemini emitted 2,463 usage events, no cache hits. Local tokenizer work was not
measured; local embedding billing tokens are inapplicable, not a measured zero.
No dollar estimate is asserted. Model files took another 32 MiB locally. Cold
model download is included in local index time. Each query starts a fresh CLI
and reloads the local model; these are NOT warm daemon latency measurements.

Entire serial cohort: 8m05s wall, 497.99 CPU seconds, cgroup peak 547.1 MiB,
zero swap, about 80 MiB allocated evidence/index/model-cache storage. Scope was
2 GiB memory / 200% CPU / 512 tasks. Per-operation memory includes retained
cache and runner overhead, not isolated model RSS. Block-I/O accounting was
unavailable. Short-window sampled core peaks exceed quota due to scheduler
bursts; do not treat them as sustained demand.

## Observed retrieval failures

- Semantic confusion: local `q01-en` retrieves CLI permission installation rather
  than signed remote-consent storage; `q02-en` similarly retrieves installation
  guidance rather than disclosure planning.
- Cross-language mismatch: local `q01-zh` retrieves launcher setup and a Unicode
  helper; `q13-zh` retrieves installation code rather than shell-input parsing.
- Gemini is not perfect: `q05-en` prefers model-backend truncation over the
  token-density chunk-budget implementation; `q07-en` prefers daemon orchestration
  over the small execution-mode router. Gemini misses four expected files at K=5.
- Fusion regression: Gemini English top-5 drops from 14/16 vector to 7/16 hybrid;
  Chinese scores stay unchanged. The experiment establishes observed loss, not
  its root cause. No ranking code was changed during the cohort.

## Limits and evidence

Only one codebase and one small, non-human-labelled set; Chinese entries are
translations of eight existing intents. No confidence intervals, independent
replication, answer-quality evaluation, or comparison with larger local models.
File labels can exclude other relevant implementations. Model token limits,
dimensions and prefixes are intrinsic configurations, not controlled ablations.
Hosted Gemini alias may drift.

One local-first index build per model; OS caches uncontrolled. Although first-arm
counts were balanced overall, reversing the even-sized query list cancelled the
intended per-query arm-order reversal. Latency is descriptive, not causal. Global
`~/.zvec-grep/config.json` was verified absent on this host.

Raw evidence: `/home/charlesfengyc/.local/state/zgrep-evals/20261008-a/`.
Compressed archive (60 MiB): sibling `20261008-a.tar.gz`, SHA-256
`cd3abaaaae41c66d10a4687f15429a08dd139fbbc8683b4552991e4e6a941a47`.
Credential-value scan passed across 1,049 files; gzip integrity verified. Nothing
was deleted. Restore with `tar -xzf 20261008-a.tar.gz -C <empty-directory>`.
It contains the terminal record, frozen queries/manifest, every command output,
usage events and 50ms cgroup samples; no credentials are intentionally captured.
Recount with `node benchmarks/gemini-local/analyze.mjs <evidence-directory>`.
The fixture is reconstructible from the frozen commit. Evaluation-engineering
guided the frozen inputs, route separation, resource accounting and independent
recount. Skills remain unchanged; no skill-improvement claim is made.
