# Gemini versus default local embeddings

Exploratory retrieval comparison, not an answer-quality benchmark. Prior discovery:
the two-file package smoke returned the wrong top hybrid hit while pure vector
retrieval succeeded. Therefore evaluate vector and hybrid separately; do not
attribute fusion behavior solely to embedding quality.

Question: does Gemini improve source-file retrieval over the native default
`local/potion-code-16m-v2`, and what latency/resource cost accompanies it?
Falsifier: paired Hit@1/Hit@5/MRR@5 do not improve on the frozen query set.

Corpus: all 133 tracked `src/` files (1,160,549 bytes) at upstream
`b1a9148e26a7bc9bd4a52229ffb7532d3063793d`, no docs/tests/labels. Two independent
indexes, same package and CPU host, no changes to real project indexes. Only
public upstream code is sent to Google. Initial model cache empty. Different
model dimensions, prefixes and token limits are intrinsic product defaults;
this compares usable configurations, not a dimension-controlled ablation.

Queries are independently agent-authored and source-grounded, not human-validated:
16 English intents plus 8 Chinese translations, reported separately. Labels fixed
before any retrieval results. A correct result means a labelled source file is
present at the returned chunk rank; this does not validate a final answer.
Two query repetitions, reversed query/route order and alternating model order;
indexing performed once per model (local first), so indexing times are descriptive,
not causal speed estimates. Report cold download-inclusive local indexing time.

Budget: 2 GiB disk, 2 GiB RAM, 2 CPU quota, 512 tasks; 10-minute index timeout per
arm, 60 seconds per query; no vector cache. Fresh scoped cgroup, raw samples every
50 ms; explicitly report unavailable I/O and local token counts. No confidence
interval or broad multilingual claim from eight translated queries.

Freeze and push apparatus + queries before launching. Run through a user systemd
service with the documented limits and explicit invoking PATH (service default
Node is older). Set `ZG_COMPARE_CLI` to the installed `zg` and
`GEMINI_API_KEY_FILE` to a managed key-file pointer. Pass a NEW evidence directory
outside Git. Never dump environment or key contents. Runner retains all outputs,
usage events and resource samples; only terminal-complete runs may be summarized.
Changing the apparatus ends a cohort; retain failed attempts under unique paths.

```sh
node benchmarks/gemini-local/run.mjs /absolute/path/to/new-evidence-directory
```

No skill changes are proposed by this comparison.
