# xdr-cap-coverage-kit

A test kit for code that reads the Stellar ledger.

The idea is simple. Keep a corpus of rare but valid XDR, one entry per shape, each tagged with the CAP that introduced it and the values a reader should decode. Run it through indexers (wallet-backend first) and through the JS, Go and Rust SDKs, and report where they get it wrong. A bug fixed in one SDK then becomes a test for all of them.

## What works today

- `schema/corpus-entry.schema.json`: draft schema for one corpus entry.
- `corpus/entries/`: 3 sample entries. Two are real testnet transactions (a CAP-40 signed-payload signer from ledger 4437357, and a payment from muxed ID 2^64-1 to muxed ID 0 from ledger 5699707). One is synthetic and marked as such.
- `tools/check-corpus.mjs`: checks every entry against the schema, re-encodes it in Rust (rs-stellar-xdr via the `stellar` CLI) and JS (js-stellar-sdk), compares their JSON, recomputes the tx hash and runs the per-entry checks.
- `runners/go/`: the same round-trip in Go with go-stellar-sdk.
- `repros/`: five known bugs reproduced on the version that had them and passing on the version that fixed them: js-stellar-sdk #1789, #1785, #1766 and wallet-backend #716, #729. Details and real output in `repros/README.md`.

Not built yet: the replay harness, the indexer adapter, the linter and the guide. That is the grant work. The plan is in `ARCHITECTURE.md`.

## Run it

You need Node 22+, Go 1.25+ and the `stellar` CLI (tested with 30.0.1).

```sh
npm ci
node tools/check-corpus.mjs           # corpus checks in JS and Rust
(cd runners/go && go run .)           # corpus checks in Go
bash repros/js-stellar-sdk/run.sh     # 3 SDK bugs, buggy vs fixed
bash repros/wallet-backend/run.sh     # 2 indexer bugs, pre-fix vs fix (clones wallet-backend)
```

No keys and no funds are needed. After the first install everything runs offline, except the wallet-backend repro, which clones that repo.

## License

Apache-2.0
