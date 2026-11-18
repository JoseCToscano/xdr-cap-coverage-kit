# Runners

Each runner reads `corpus/entries/*.json` (and the LCM files they point to) and writes one row per check to `reports/raw/<runner>.json`. `tools/divergence-matrix.mjs` merges them into `reports/divergence-matrix.md`.

| Runner | Library | Checks | Result (Nov 13, 2026) |
|---|---|---|---|
| Rust CLI (`tools/check-corpus.mjs`) | stellar CLI 30.0.1, stellar-xdr 30.0.0 | decode == expected JSON, byte-exact re-encode, checks, LCM re-encode, tx at index, ledger checks | 93 ok |
| JS (`tools/check-corpus.mjs`) | @stellar/stellar-sdk 17.4.0 | same, plus tx hash and JS JSON == Rust JSON | 102 ok |
| Go (`runners/go`) | go-stellar-sdk v0.9.0 | sha256, byte-exact re-encode, tx hash, strkey checks by walking the decoded value, LCM: zstd, batch range, sha, protocol, CAP-88 invariant, tx at index | 101 ok, 35 n/a (JSON-pointer checks: no SEP-51 encoder in Go) |
| Rust crate (`runners/rust`) | stellar-xdr =30.0.0 (serde) | sha256, byte-exact re-encode, decode == expected JSON, tx hash, checks, LCM | 121 ok |

0 failures and 0 disagreements between runners on the current corpus.

```sh
node tools/check-corpus.mjs
(cd runners/go && go run .)
(cd runners/rust && cargo run --release)
node tools/divergence-matrix.mjs
```
