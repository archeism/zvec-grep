# Gemini package fork

This is a small Apache-2.0 fork of zvec-ai/zvec-grep, pinned to upstream
`b1a9148e26a7bc9bd4a52229ffb7532d3063793d` (0.2.2).
Publish as `@charfeng1/zgrep`, never under the upstream package name.
Keep upstream history and license. Scope changes to Gemini support and packaging.

Run `bun install --frozen-lockfile`, `bun run build`, and the Gemini, factory,
config and authorization tests before packaging. Test the packed tarball in an
isolated installation, not just the checkout. Real embedding checks use only
synthetic fixtures, explicit `--allow-remote`, and a credential-file pointer.
Never commit or print credentials. Keep raw runs outside Git.

Upstream source documentation follows below the fork notice in README.md.
Use FORK.md for fork-specific provenance, installation and verification.
