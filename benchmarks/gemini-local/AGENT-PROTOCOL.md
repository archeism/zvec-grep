# Real answering-agent comparison

## Flash replay (2026-10-08)

User-requested replay: set `ZG_AGENT_MODEL=gemini-3.8-flash`; default remains
`gemini-3.1-pro-preview` for baseline reproducibility. Keep all questions,
tools, indexes, low thinking, per-session and cohort limits, and two repetitions
unchanged. A separate paired live preflight passed before the full96-session
launch. Preserve it separately. Source/corpus hashes are checked again by the
runner. Cross-model results are sequential cohorts, not randomized interleaving;
latency differences may include provider/time effects. Equal named thinking
levels do not imply equal internal compute across models.

Flash standard pricing checked2026-10-08: $0.75/M input, $0.075/M cached input,
$3.75/M output including thinking through2026-12-31. The analyzer selects rates
from the recorded model and rejects unknown models instead of applying Pro prices.
Sources: https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash and
https://ai.google.dev/gemini-api/docs/pricing .

## Original Pro cohort

Question: can the same answering agent recover correct repository facts with
native Potion retrieval versus the Gemini embedding adapter?

This extends, rather than replaces, the real embedding-only run in RESULTS.md.
Both search backends execute for real; all answering turns call Google's
`gemini-3.1-pro-preview` generateContent API. No mocked model responses or
LLM-as-judge scores.

## Frozen inputs and scoring

- Reuse the two completed indexes under the recorded `20261008-a` evidence
  directory. Both contain the same 133 upstream `src/` files at
  `b1a9148e26a7bc9bd4a52229ffb7532d3063793d` (2,030 entities each).
- 24 cases: 16 English intents plus eight Chinese translations. Two repetitions
  per backend: 96 attempted sessions. Translations/repeats are not independent
  samples. Cases are source-derived diagnostics, not a held-out production sample.
- Main agent independently read every English evidence range from the pinned Git
  source and checked the expected values; translated cases retain identical keys.
  Labels are source-verified, not human-annotated or inferred from judge agreement.
- The answering model sees only the question, common instructions and its tool
  results. Expected answers, source paths/ranges and rationale stay hidden.
- Exact primitive field equality is the primary score. Full-case success requires
  every expected field to match. Missing/invalid answers fail; infrastructure
  failures are reported separately, never silently discarded.
- Citation range overlap is a diagnostic, **not** proof of entailment or complete
  citation support. Inspect unsuccessful sessions and suspicious successes.

## Equal tools and bounded execution

Both arms expose semantic `search(query)` and bounded `read(path,start,end)`.
Search uses top-five vector chunks, direct CLI mode, refresh off, short previews.
There is no grep fallback, filesystem listing, web search or access to gold labels.
This isolates the retrieval backend within an adaptive agent; it is not a complete
comparison of all possible coding-agent tool combinations.

Keep model, prompt, thinking settings, turn/tool limits and output limits equal.
Record full API response contents (including thought signatures needed for the
next turn), model version, usage/cache metadata, tool outputs and timing outside
Git. Credential values never enter evidence. Two workers maximum; avoid
simultaneous access to the same arm's index. Bound tokens, time and artifact disk
growth. Preserve preflights and failures separately from the scored cohort.

Prices checked 2026-10-08: standard Gemini 3.1 Pro Preview is $2/M input tokens
and $12/M output including thinking, for prompts up to 200k tokens. Any estimate
must distinguish cached input, embedding requests and unmeasured billing from
observed token counts. Source:
https://ai.google.dev/gemini-api/docs/pricing

API contract: https://ai.google.dev/api/generate-content

## Interpretation

This asks whether adaptive searches and source reading close the gap observed in
single-query retrieval. A strong answer model may compensate for weak retrieval
at the cost of more calls, latency and tokens. Report those costs beside quality.
Preview model aliases and provider behavior can change. OS/provider cache effects
are uncontrolled; repeated samples describe this cohort, not production SLAs.
