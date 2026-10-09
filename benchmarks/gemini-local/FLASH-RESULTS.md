# Gemini 3.8 Flash replay — completed 2026-10-09 UTC

**Flash + Gemini embeddings scored48/48; Flash + local Potion scored44/48.**
Flash + Gemini embeddings is the best observed combination on this fixture, not
an established universal winner. This replay used the same cases and tools as
[the Pro cohort](AGENT-RESULTS.md); no cases or failures were removed.

| Answer model / retrieval | Correct sessions | Median session time | Estimated answering API cost |
|---|---:|---:|---:|
| Pro3.1 / local Potion | 44/48 | 20.63s | $1.57 |
| Pro3.1 / Gemini embeddings | 44/48 | 16.95s | $1.41 |
| Flash3.8 / local Potion | 44/48 | 13.74s | $0.45 |
| Flash3.8 / Gemini embeddings | 48/48 | 12.49s | $0.37 |

Cross-model cohorts ran sequentially, not randomly interleaved. Their latency
differences can include provider/time effects. Equal `low` thinking settings do
not mean equal internal compute. These are24 source-derived questions with only
16 distinct intents (eight Chinese translations), each repeated twice per
retriever. A48/48 result is not evidence of general100% accuracy or equivalence.

## Actual execution and frozen inputs

-96 real answering sessions, **451 generateContent calls**,451 countTokens calls,
  **85 Gemini embedding API requests** and95 native local embedding searches.
  No mocked responses or LLM judge. Every returned modelVersion was
  `gemini-3.8-flash`.
-Frozen apparatus `d156a9e`: only answer-model selection changed from the Pro
  runner; the analyzer separately gained model-specific prices. Same question
  bytes, corpus, source verification, index models, system prompt, tools, low
  thinking level, eight-turn/twelve-tool limits and4,096 output-token cap.
  Temperature omitted equally (provider default). Unknown model/pricing names
  fail explicitly. See [protocol](AGENT-PROTOCOL.md).
-Corpus:133 upstreamsrc files at
  `b1a9148e26a7bc9bd4a52229ffb7532d3063793d`; existing indexes reused with refresh
  off. Vector top-five chunks, short previews, fresh direct CLI per query; not
  warm-daemon performance. Gold answers/evidence hidden from answering model.
-Two paired loops, one per index; no same-index concurrency. Reverse case order
  in pass2. No prompt tuning or mid-cohort apparatus changes.

## Flash details

| Measure | Local Potion | Gemini embeddings |
|---|---:|---:|
| Correct sessions | 44/48 | 48/48 |
| Exact primitive facts | 124/136 | 136/136 |
| English | 30/32 | 32/32 |
| Chinese | 14/16 | 16/16 |
| Pass1 / pass2 | 23/24,21/24 | 24/24,24/24 |
| Searches | 95 | 85 |
| All tool calls | 187 | 172 |
| Answer-model calls | 231 | 220 |
| Observed session range | 5.96–29.10s | 6.09–39.64s |
| Answer input tokens | 541,834 | 429,627 |
| Visible output tokens | 8,110 | 8,064 |
| Reported thinking tokens | 4,097 | 4,282 |
| Sessions citing a reference-overlapping range | 44 | 48 |

Matched pairs:44 both correct,4 Gemini-only correct,0 local-only,0 both wrong.
No statistical significance claim: repeated/translated questions are dependent.
Citation overlap is a diagnostic, **not** verified entailment or full support.

All four local failures exhausted eight turns without a final answer, rather
than returning wrong final facts. No scored API or tool failures occurred.
Inspection of their tool traces:

1. Directory exclusions, pass1: several irrelevant searches before finding the
   scanner; then repeated a read of the already-obtained exclusion list and ran
   out of turns.
2. Chinese job coalescing, pass2: retrieved the correct scheduler immediately
   and read the answer-bearing lines on turn2, but continued reading the file
   through turn8 instead of answering. This is not simply a retrieval miss.
3. Chinese progress heartbeat, pass2: repeated searches never retrieved the
   heartbeat implementation; no final answer.
4. Disclosure planning, pass2: eventually read the correct planning function on
   turn8, leaving no generation turn to answer.

All four cases passed in the other repetition with local retrieval. Extra turns
might rescue some failures; no post-hoc rescue is included in these scores.

## Usage, cost and resources

Total answering usage:971,461 input tokens,16,174 visible output,8,379 reported
thinking. Thinking counts were omitted in396 responses, but input + visible output
+ reported thinking reconciled to total tokens in every response. No cached-input
counts were reported; estimates charge all input at the uncached rate rather than
asserting measured zero caching. Gemini embedding requests
reported1,124 input tokens. Local embedding tokenizer work is unmeasured.

Estimated answering cost **$0.82067** across the96 sessions, excluding embeddings,
index construction, preflight and local compute. Uses Google's standard Flash
introductory prices checked2026-10-08: $0.75/M input, $0.075/M cached input,
$3.75/M output including thinking, effective through2026-12-31. These are
token-based estimates, not billing receipts. Sources:
[model capabilities](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash),
[pricing](https://ai.google.dev/gemini-api/docs/pricing).

The paired preflight (excluded from scores) passed both cases;9 generation calls,
18,434 input and372 output tokens. Retained separately without overwriting Pro
or previous preflights.

Wall797.408s (13m17s), dedicated cgroup CPU delta421.437s, peak memory699.75MiB.
Unit `zgrep-flash-cohort-20261008a.service`:2GiB cap, zero swap allowance,
200%CPU quota,512tasks. Counters include child CLIs, not attributable per arm;
I/O accounting unavailable. Ignore the much smaller final systemd memory summary;
the saved live cgroup counter is authoritative here. Runner exits1 because four
sessions failed; terminal `complete` means all96 were attempted, not all passed.

## Preservation and reproducibility

Raw evidence (~13MiB): `~/.local/state/zgrep-evals/20261008-flash-a/`;
preflight: `20261008-flash-preflight-a/`. The nominal directory date is the launch
date; completion crossed into2026-10-09 UTC. Includes raw model requests,
responses, token counts, tool results, transcripts, scores and cgroup counters.

Archive `~/.local/state/zgrep-evals/20261008-flash-evidence.tar.gz` contains both.
SHA256 `9f34466bf4cd99cb77cf2dc167b1ca9551e1fd5c39d7943824885af372dc0136`.
Gzip integrity passed; managed-key value absent in all2,195 artifact files.
Nothing deleted; same-disk archive is not off-machine backup. Restore using
`tar -xzf ARCHIVE -C NEW_DIRECTORY`; key managed separately, never archived.

Recount: `node benchmarks/gemini-local/agent-analyze.mjs EVIDENCE_DIRECTORY`.
Independent reviewer reconstructed final answers directly from raw response parts:
all96 scores matched, zero discrepancies. All451 API statuses and model versions
passed; initial prompts matched the frozen questions with no gold-label leakage.
Replay: set `ZG_AGENT_MODEL=gemini-3.8-flash`, then use agent-run.mjs with a new
output directory (default24cases ×2repeats ×2retrievers). Keep dedicated cgroup
limits and existing corpus/index requirements from the protocol.

Evaluation skill unchanged. Its frozen-input and independent-recount procedure
was reused; no skill improvement or causal skill claim is made.
