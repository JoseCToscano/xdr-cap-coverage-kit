# Runners

- JS and Rust: `tools/check-corpus.mjs` decodes every entry with js-stellar-sdk and with rs-stellar-xdr (through `stellar xdr`), checks both re-encode to the same bytes, and checks the JS SEP-51 JSON equals the Rust one.
- Go: `runners/go` (owner: Alejandro Mercado). Round-trip and sha256 today. Expected-value checks next.

The plan is one small runner per SDK, all reading the same corpus and writing one row per entry into a shared divergence matrix (see ARCHITECTURE.md).
