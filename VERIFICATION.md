# Release verification: 0.2.2-gemini.2

2026-10-08, Linux x64, Node 22.23.1, Bun 1.3.14.

- Build, TypeScript typecheck and full ESLint passed.
- Model/config/authorization suite: 145 passed, 0 failed (5.86 seconds).
- Upstream packed-package consumer test, updated for the scoped name: passed
  (46.86 seconds); installs the tarball and verifies CLI and SDK surfaces.
- Independent review identified missing pre-abort handling, premature cache
  writes and unsanitized usage metadata. Fixes and 7 additional regression tests
  passed. Consent tests cover Google planning, denial, one-shot grants,
  endpoint mismatch and workspace revocation.
- Installed-tarball live Gemini smoke: passed (14.54 seconds), two synthetic
  files indexed, zero failed; top vector result was `auth.ts` for a session-token
  validation query. Three real requests, 120 reported input tokens in this run.
  Indexing and querying without consent failed before a provider request.
- Live smoke ran with a 1536 MiB memory cap, zero swap, one CPU quota and
  512-task ceiling. Native memory peak telemetry was not reliable; no peak-memory
  performance claim is made. This is a functionality check, not a retrieval eval.

Observed failures retained as limitations/evidence:
- The broader root suite on candidate gemini.1 had 244 passes and one custom
  offline-model HTTP test failure. Independent baseline reproduction passed.
  gemini.2 narrows consent gates to Google/Qwen rather than treating every custom
  provider as remote; the existing HTTP regression test covers this boundary.
  Corrected HTTP + Google/Qwen authorization rerun: 8/8 passed (15.78 seconds).
  The full root suite was not rerun after this correction; no full-suite green
  claim is made.
  gemini.1 was not published to npm; its GitHub candidate remains for history.
- Post-build `npm audit --omit=dev` on the pinned source lockfile reports
  11 inherited advisories: 3 critical, 3 high, 5 moderate. Critical chains are
  optional node-llama-cpp/simple-git; high findings include MCP client OAuth and
  transformers/sharp. No clean security-audit claim is made. The release page and
  current fork docs carry this notice; dependency remediation is not included.
- A first supervised run used the service's Node 18 PATH instead of Node 22;
  explicitly passing the invoking PATH fixed the test runner.
- A 64-task ceiling caused a native abort; the 512-task ceiling completed.
- Hybrid top-1 ranking selected the unrelated file in the same fixture; explicit
  vector ranking selected the correct file first. Hybrid ranking is not fixed.
  The failed hybrid fixture remains locally at `/tmp/zg-gemini-live-BWmyO3`;
  successful vector fixture at `/tmp/zg-gemini-live-bySTWI`. Both are synthetic,
  not durable test dependencies; the smoke test regenerates them.

Reproduce the live test after installing the packed package:

```sh
ZG_GEMINI_LIVE=1 ZG_GEMINI_CLI=/absolute/path/to/installed/zg \
  GEMINI_API_KEY_FILE=/absolute/path/to/protected-key-file \
  node --test test/smoke/gemini-package.test.mjs
```

The live test is opt-in and never uses product source as a fixture. Native
dependencies retain upstream platform constraints; macOS/Windows were not
retested for this release. Skill instructions are unchanged; no skill-performance
improvement is claimed.
