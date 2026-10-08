# Real answering-agent results — 2026-10-08

**Answer accuracy tied: 44/48 sessions per backend (91.7%).** Gemini retrieval
needed fewer searches and had lower observed median completion time. The earlier
single-query retrieval advantage did **not** produce higher answer accuracy in
this adaptive-agent test. This is a small diagnostic cohort, not proof of quality
equivalence or a production latency guarantee.

## What actually ran

96 sessions: 24 source-grounded questions × two repetitions × two backends.
There are only 16 distinct intents; eight questions are Chinese translations.
Both arms used actual `gemini-3.1-pro-preview` API calls with the same instructions,
low thinking level, eight-turn / twelve-tool-call limits and 4,096 output-token
cap. The model selected its own searches and source reads. Gold labels and
reference evidence were not supplied. No mocked model responses or LLM judge.

The local arm used real `local/potion-code-16m-v2` inference; the remote arm used
real `google/gemini-embedding-2` API calls. Same 133 upstream source files,
byte-verified against `b1a9148e26a7bc9bd4a52229ffb7532d3063793d`, same previously
built indexes, vector top-five chunks, direct CLI, short preview, refresh off.
Index metadata was checked before launch. Each query starts a fresh CLI process;
this is **not** a warm-daemon latency comparison.

Frozen apparatus: `f2a713f` (agent-run.mjs, agent-cases.json, AGENT-PROTOCOL.md).
All returned modelVersion values were `gemini-3.1-pro-preview`; this remains a
provider alias rather than immutable weights. Generation temperature was omitted
equally in both arms (provider default). Pairs ran concurrently, one session per
index; question order reversed for repetition two. Provider/OS caches and
cross-arm CPU contention are uncontrolled.

## Outcome and effort

| Measure | Local Potion | Gemini embeddings |
|---|---:|---:|
| All requested facts correct | 44/48 | 44/48 |
| Individual exact facts correct | 125/136 | 125/136 |
| English questions correct | 29/32 | 28/32 |
| Chinese questions correct | 15/16 | 16/16 |
| First / second pass | 21/24, 23/24 | 22/24, 22/24 |
| Search calls | 114 | 100 |
| All tool calls | 184 | 180 |
| Answer-model calls | 228 | 221 |
| Median session wall time | 20.63 s | 16.95 s |
| Observed session range | 8.55–37.10 s | 8.62–37.05 s |
| Answer-model input tokens | 534,683 | 466,770 |
| Answer-model visible output tokens | 9,231 | 9,678 |
| Answer-model thinking tokens | 32,503 | 30,018 |
| Reported cached input tokens | 0 | 0 |
| Estimated answering API cost | $1.57 | $1.41 |

Gemini used 12.3% fewer searches, 12.7% fewer answer-input tokens and had a 17.8%
lower median wall time here. Do not infer a statistically established speedup.
Of 48 matched pairs: 41 both correct, three local-only correct, three Gemini-only
correct, one both wrong. These repeated/translated cases are not 48 independent
intents, so no significance claim is made.

Actual cohort API work: **449 generateContent calls**, 449 preceding countTokens
calls, and **100 remote embedding requests** (1,365 reported embedding input
tokens). Local embedding tokenization work is unmeasured, not zero. Answering
cost estimates use $2/M input and $12/M output including thinking from Google's
[standard pricing](https://ai.google.dev/gemini-api/docs/pricing), checked
2026-10-08. They exclude embeddings, earlier index construction, preflights and
local compute; these are token-based estimates, not billing receipts.

## Failures and trace checks

No failed API requests or tool executions occurred in the scored cohort. Seven
sessions used all eight model turns without a final answer; these remain failures
in the denominator. One session returned wrong facts. Every case succeeded on at
least one repetition in each arm.

- Local unfinished: disclosure planning (pass 1), authorization heartbeat
  (pass 1), Chinese endpoint precedence (pass 1), rank fusion (pass 2).
- Gemini unfinished: execution fallback (pass 1), job coalescing (pass 2),
  excluded directories (pass 2).
- Gemini wrong answer: disclosure planning (pass 1). It found the right file but
  read the index-only planning function, then answered `index` / no query-text
  disclosure instead of the search-and-refresh branch. Its citation points to
  that wrong branch. This directly demonstrates why file-hit scores alone do
  not measure answer quality.
- Local disclosure trace eventually read the correct function on turn eight,
  but had no remaining generation turn to answer. More budget might change the
  result; no post-hoc rescue is included in this score.
- On the inspected Chinese heartbeat pair, both agents searched in English
  (`progress keep-alive defaultIntervalMs`). Adaptive query translation is one
  observed way the answering model compensates for retrieval weaknesses.

44 sessions per arm cited at least one range overlapping the reference evidence.
That is only a range-overlap diagnostic, **not** a verified entailment or complete
citation-support score. Exact-fact labels were independently checked against
pinned code by the main agent; they are not human-annotated production labels.

## Execution, attempts and preservation

- Cohort wall time: 1,092.859 s (18m13s). Dedicated transient user cgroup:
  `zgrep-agent-cohort-20261008a.service`, 2 GiB memory cap, zero swap allowance,
  two-CPU quota, 512 tasks. Cgroup CPU delta 519.395 s; memory peak 723.59 MiB.
  I/O controller accounting unavailable (`null`). Child CLI work included;
  per-arm CPU attribution unavailable. Ignore the terminal systemd summary's
  much smaller memory figure; the saved live cgroup counter is the evidence.
- Raw cohort evidence: `~/.local/state/zgrep-evals/20261008-agent-a/`, about13 MiB.
  Includes every request/response, token count, tool output, transcript, result,
  journal, source integrity receipt and terminal resource counters.
- Preflight-a retained separately: two correct content answers rejected by the
  initial strict JSON parser because the model used Markdown fences. Before
  freezing, added only optional whole-response JSON-fence unwrapping and recorded
  the `fenced` flag. Preflight-b: both correct. These four sessions are excluded
  from the 96 scored sessions. Preflights consumed22 generation calls,
  50,648 input and3,413 output/thinking tokens. Initial connectivity probe was
  one further real generation call (44 input,145 output/thinking tokens), retained
  in the session tool transcript rather than the evidence archive.
- Whole cohort intentionally exits1 when any session fails; terminal status
  `complete` means all96 were attempted, not all passed.
- Archive: `~/.local/state/zgrep-evals/20261008-agent-evidence.tar.gz`, contains
  cohort and both preflights. SHA256:
  `6208d648eb33af1d9bc1fcfdaffb6fe50e25e6942c9f29fea69b57ee5320926c`.
  Gzip integrity passed. Credential-value scan passed all2,321 artifact files.
  Nothing deleted. Same-disk archive is preservation, not off-machine backup.
  Restore with `tar -xzf ARCHIVE -C NEW_DIRECTORY`; credentials remain separately
  managed at `~/.air/gemini-api-key`, never in artifacts or Git.

Recount with `node benchmarks/gemini-local/agent-analyze.mjs EVIDENCE_DIRECTORY`.
Independent reviewer reconstruction used raw final API responses, not the runner's
recorded answers: all96 scores matched, zero discrepancies; all449 response statuses
and usage records passed, and every initial user question matched the fixture.
Skills unchanged; no skill-improvement claim. The evaluation
skill influenced the frozen comparison, separation of preflight failures, usage
accounting and refusal to substitute a judge score for exact source facts.

## Decision

The remote adapter works in real multi-step use. Choose it for its observed
retrieval efficiency and multilingual retrieval strength, not a demonstrated
end-to-end accuracy win. Local Potion plus a capable answering model was equally
accurate here, with more search effort. Neither result establishes performance
on larger repositories, natural user traffic, hybrid/grep-equipped agents or
different answer models.
