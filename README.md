# xdr-cap-coverage-kit

A shared test kit for code that reads the Stellar ledger. Draft, built for the SCF #46 RFP "XDR/CAP-Coverage Audit Tool and Indexer-Hardening Guide".

The idea: keep a corpus of rare but valid XDR, one entry per shape, tagged with the CAP that introduced it. Every entry carries the values a reader must decode. Then run that corpus through indexers (wallet-backend first) and through the JS, Go and Rust SDKs, and report where they get it wrong. A bug fixed in one SDK becomes a test for all of them.

## What is here today

| Path | What it is | Status |
|---|---|---|
| `schema/corpus-entry.schema.json` | Draft schema for one corpus entry | Draft v0 |
| `corpus/entries/` | 3 sample entries: 2 captured from testnet history, 1 synthetic | All pass checks |
| `corpus/specs/`, `tools/make-entry.mjs` | How each entry is built. Refuses to write an entry that does not re-encode to the same bytes | Works |
| `tools/check-corpus.mjs` | Schema, sha256, Rust and JS round-trip, JS vs Rust JSON, tx hash, semantic checks | Works |
| `runners/go/` | Go round-trip with go-stellar-sdk (starter) | Works |
| `repros/js-stellar-sdk/` | js-stellar-sdk #1789, #1785, #1766 on pinned buggy and fixed versions | Reproduced |
| `repros/wallet-backend/` | wallet-backend #716 and #729 on pinned pre-fix and fix commits | Reproduced (unit level) |
| `ARCHITECTURE.md` | Proposed design, milestones, upgrade process | Draft |

Not built yet: the replay harness, the indexer adapter, the linter, the guide. Those are the grant work. See ARCHITECTURE.md.

## Run it

Needs Node 22+, Go 1.25+, and the `stellar` CLI (used as the rs-stellar-xdr reference decoder).

```sh
npm ci
node tools/check-corpus.mjs          # corpus checks, JS + Rust
(cd runners/go && go run .)          # corpus checks, Go
bash repros/js-stellar-sdk/run.sh    # 3 SDK bugs, buggy vs fixed
bash repros/wallet-backend/run.sh    # 2 indexer bugs, pre-fix vs fix (clones wallet-backend)
```

Everything runs offline after the first install. No keys, no funds.

## License

Apache-2.0.
