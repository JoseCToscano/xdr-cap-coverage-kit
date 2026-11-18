# Replay harness

Feeds corpus `LedgerCloseMeta` to a real indexer and decides from what it stored.

- `adapter.go`: the `Adapter` interface, `Build`, `Case`, `Source`, and the four verdicts (`pass`, `mishandled`, `dropped`, `halt`).
- `mockrpc/`: a Stellar RPC `getLedgers` / `getHealth` / `getLatestLedger` / `getNetwork` server over a Galexie data-lake directory. `go test ./mockrpc` checks it serves exactly the bytes recorded in `corpus/datalake/SOURCES.json`.
- `walletbackend/`: the wallet-backend adapter and `zz_xck_ingest_test.go.txt`, the driver copied into each worktree.
- `cmd/replay`: the matrix (#716, #729, #731 on pre-fix, fix and HEAD; HEAD again through the mock RPC). Writes `reports/replay-matrix.md` and `reports/raw/replay.json`; exits 1 on any unexpected verdict.
- `scripts/pg.sh`: throwaway PostgreSQL + TimescaleDB from `PG_BIN`. In CI a `timescale/timescaledb:2.28.2-pg17` service is used instead.

```sh
XCK_PG_ADMIN_DSN=postgres://postgres:postgres@127.0.0.1:5432/postgres?sslmode=disable bash harness/run.sh
# or: PG_BIN=/usr/lib/postgresql/17/bin bash harness/run.sh
```

Each build gets a fresh database (`xck_wb_<label>_<commit>[_shim]`). The driver commits one transaction per ledger, exactly as wallet-backend's ingest loop does, so a `halt` row means the ledger left nothing behind.

Second adapter: see [ADAPTERS.md](ADAPTERS.md).
