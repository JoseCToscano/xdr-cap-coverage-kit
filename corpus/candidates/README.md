# Corpus candidates

Transactions the live differential checker (`tools/livecheck/`) flagged on mainnet. A candidate is **not** a corpus entry: it has inferred CAP tags (`caps_inferred: true`), the flags that picked it, the tx hash, ledger, close time, source object URL and the raw XDR of the envelope and its `TransactionResultMetaV1`. It moves to `corpus/entries` only after review, with expected checks and a real `LedgerCloseMeta`.

This directory holds a curated set, not every flag:

| Directory | Source | Picked |
|---|---|---|
| `livecheck/pubnet/` | `node tools/livecheck/backfill.mjs --candidates` over ledgers 65,450,000 to 65,499,999 (`reports/livecheck/backfill.md`) | Both bug shapes (muxed ID >= 2^53, the js-stellar-sdk #1785 shape; nested SAC `trust()`, the wallet-backend #731 shape) and the rarest long-tail arms (1 or 2 txs in the window, or `ScAddress.muxed_account`) that no corpus entry covers yet |
| `livecheck/pubnet-live/` | live follower (`tools/livecheck/run-live.sh pubnet`); first-seen candidates rewritten from the archive by `node tools/livecheck/snapshot.mjs --candidates` | All 20 union arms the follower saw that the 83,500-ledger mainnet baseline never contained, one file per arm (18 transactions; one `RestoreFootprint` transaction carries 3 of the arms), listed in [reports/livecheck/live-pubnet-snapshot.md](../../reports/livecheck/live-pubnet-snapshot.md), one live muxed ID >= 2^53 transaction, and the live `sac.trust_creates_trustline` (#731 exact) shape |

Regenerate the full backfill set (one candidate per flagged arm or shape) with `node tools/livecheck/backfill.mjs --candidates`.
