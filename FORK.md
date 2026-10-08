# Gemini package

`@charfeng1/zgrep@0.2.2-gemini.1` is an unofficial, Apache-2.0 fork of
`@zvec/zvec-grep@0.2.2`, upstream commit
`b1a9148e26a7bc9bd4a52229ffb7532d3063793d`.
The original history and LICENSE are retained.
Upstream discussion: https://github.com/zvec-ai/zvec-grep/issues/233.
See [VERIFICATION.md](./VERIFICATION.md) for checks and known limitations.

The initial adapter came from archeism/air commit
`8fe966fd17c099a5a31a378e8adea1ea672c2df2`, path
`lab/review-indexed-search-2026-09-15/zg/zvec-grep-0.2.2-gemini2.patch`.
This package adds remote authorization coverage and adapter hardening.
It does not include the upstream Rust rewrite or subsequent upstream fixes.

## Use

Node.js 22+ is required. This retains upstream native dependencies and platform
restrictions. Do not install alongside another package owning the `zg` binary.
Install the release tarball:

```sh
bun install -g https://github.com/archeism/zvec-grep/releases/download/v0.2.2-gemini.1/charfeng1-zgrep-0.2.2-gemini.1.tgz
```

If Bun reports blocked lifecycle scripts, follow its trust prompt for the
reviewed native dependency `@zvec/zvec`; do not indiscriminately trust all scripts.

```sh
export GEMINI_API_KEY_FILE=/absolute/path/to/your/protected-key-file
zg index /path/to/repo --embedding google/gemini-embedding-2 --mode direct --allow-remote
cd /path/to/repo
zg query --vector "where is authentication checked?" --mode direct --refresh off --allow-remote
```

The key file contains only the API key. `ZVEC_GREP_API_KEY` takes precedence over
`GEMINI_API_KEY`, then `GEMINI_API_KEY_FILE`. Existing upstream configuration
precedence otherwise applies. Credentials are not bundled. Remote indexing sends
selected source text to Google; remote querying sends the query. Consent is
required through `--allow-remote` or upstream workspace authorization.
Existing indexes keep their model; do not reuse local/Qwen vectors as Gemini.
Back up existing indexes before any explicit rebuild or version migration.

The adapter uses 3072-dimensional text embeddings and Google's documented
code-retrieval/document prefixes. Optional `ZVEC_GREP_EMBEDDING_CACHE` stores
document vectors keyed by endpoint, model, dimension and prefixed-input hash;
query embeddings are not cached. Optional `ZVEC_GREP_USAGE_LOG` records hashes,
timing, cache hits and numeric token counts, not text or credentials.

## Build

```sh
bun install --frozen-lockfile
bun run build
node --test test/unit/models/google.test.mjs test/unit/models/factory.test.mjs test/authorization.test.mjs
bun pm pack
```

Use a bounded, isolated synthetic fixture for live verification. Known upstream
0.2.2 issues are not fixed by this fork; in particular use direct mode for the
initial release rather than enabling the background watcher on valuable indexes.
Use explicit `--vector` for Gemini semantic retrieval: the two-file live smoke
found the correct file first with vector search but the wrong file first with
upstream hybrid fusion at `--limit 1`. This fork does not claim to fix or benchmark
upstream ranking. Both paths use valid Gemini vectors; hybrid quality remains a
known limitation requiring a separate investigation.

## Changelog

### 0.2.2-gemini.1
- Added installable Gemini Embedding 2 adapter, credential-file support and tests.
- Applied existing remote authorization to all non-local providers.
- Hardened cancellation, cache identity/validation and diagnostic redaction.
