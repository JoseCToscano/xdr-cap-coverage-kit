# Corpus candidates

Transactions the live differential checker (`tools/livecheck/`) flagged on mainnet. A candidate is **not** a corpus entry: it has inferred CAP tags (`caps_inferred: true`), the flags that picked it, the tx hash, ledger, close time, source object URL and the raw XDR of the envelope and its `TransactionResultMetaV1`. It moves to `corpus/entries` only after review, with expected checks and a real `LedgerCloseMeta`.

This directory holds a curated set, not every flag:

| Directory | Source | Picked |
|---|---|---|
| `livecheck/pubnet/` | `node tools/livecheck/backfill.mjs --candidates` over ledgers 65,450,000 to 65,499,999 (`reports/livecheck/backfill.md`) | Both bug shapes (muxed ID >= 2^53, the js-stellar-sdk #1785 shape; nested SAC `trust()`, the wallet-backend #731 shape) and the rarest long-tail arms (1 or 2 txs in the window, or `ScAddress.muxed_account`) that no corpus entry covers yet |
| `livecheck/pubnet-live/` | live follower (`tools/livecheck/run-live.sh pubnet`) | The union arms the follower saw that the 83,500-ledger mainnet baseline never contained (`ClawbackResult.no_trust`, L65,516,147; `ClawbackClaimableBalanceResult.not_issuer`, L65,520,888) and one live muxed ID >= 2^53 transaction |

Regenerate the full backfill set (one candidate per flagged arm or shape) with `node tools/livecheck/backfill.mjs --candidates`.
