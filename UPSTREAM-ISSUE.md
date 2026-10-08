# Feature: native Gemini Embedding 2 backend

Would maintainers welcome first-class `google/gemini-embedding-2` support?

We use zg across machines and want hosted embeddings without repeatedly patching installed files. The current catalog/factory supports local and Qwen backends, but no native Google backend. A custom endpoint alone cannot express Gemini's request shape and model identity.

We have an existing experimental TypeScript adapter and are packaging it in a separately named, pinned fork for immediate use. This issue is to gauge interest and agree on the upstream shape, not ask upstream to adopt the fork's packaging or experimental cache/log features.

Proposed minimal scope:
- Text-only Gemini Embedding 2 via the official `embedContent` REST endpoint, 3072 dimensions.
- Separate document/query prefixes per Google's code-retrieval guidance; one content per request (multiple inputs aggregate into one vector).
- Runtime API-key configuration; no credentials in repository files.
- Preserve remote-content authorization for CLI and MCP, with provider/model/endpoint-bound grants, cancellation and vector validation.
- Tests and documentation; no new model SDK dependency required.

Reference: https://ai.google.dev/gemini-api/docs/embeddings

Related: #120 (generic OpenAI-compatible endpoints), #126 (Rust migration). Gemini's native API differs from the OpenAI embeddings transport. TypeScript remains the default per the Rust roadmap update: should a contribution target TypeScript first, Rust, or both? Would a provider registration interface be preferred instead of another built-in backend?

The existing adapter has prior live indexing/retrieval evidence; packaging hardening and fresh validation are in progress. We will link the independently installable artifact and results here when ready.
