# Adapters

## wallet-backend [Built now]

See `walletbackend/adapter.go` and `reports/replay-matrix.md`.

## stellar-etl [Spec now; adapter and audit sweep in Milestone 3.1]

Assessed against `stellar/stellar-etl` master `2b24ec8` (shallow clone, Nov 13, 2026):

- It pins go-stellar-sdk `v0.8.1-0.20261106081502-e31e3b146d00`, so it can decode Protocol 30 ledgers without a shim.
- Ledgers come from captive core or a datastore, but `internal/utils/main.go` `CreateDatastore` hard-codes `Type: "GCS"` with `LedgersPerFile: 1, FilesPerPartition: 64000`. The corpus data lake already has that layout, but stellar-etl cannot point at a local directory.

Plan:

1. Serve `corpus/datalake/testnet` through a GCS emulator (fake-gcs-server, `STORAGE_EMULATOR_HOST`), with the bucket path `<datastore-path>/testnet` that `CreateDatastore` builds. No change to stellar-etl.
2. `Prepare(build)`: build `stellar-etl` at the pinned commit.
3. `IngestLedgers`: run `export_transactions`, `export_operations`, `export_effects`, `export_ledger_entry_changes` and `export_contract_events` for `[seq, seq]` into a temp directory. A non-zero exit with no output is `halt`.
4. `Verdict`: read the exported JSON lines (the stored state for stellar-etl), for example: the `cap73` trust() trustline must appear in `export_ledger_entry_changes` as a created trustline for the source account; the `cap84` transfer must carry the `W...` destination in `export_contract_events`; the `cap40` P signer must be the full key in the account signer change; muxed IDs in `cap27` must be exact decimal strings (no float rounding).
5. Pre-fix and fix pins come from stellar-etl issues that touch these shapes, found the same way as for wallet-backend (issue, fix commit, its parent).
