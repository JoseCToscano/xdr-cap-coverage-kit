#!/usr/bin/env bash
# Replay matrix: corpus ledgers -> real wallet-backend ingest -> real Postgres.
# Needs: Go, git, a wallet-backend clone (WALLET_BACKEND_REPO, cloned if
# unset), and either XCK_PG_ADMIN_DSN or PG_BIN for a local TimescaleDB.
# Writes reports/replay-matrix.md and reports/raw/replay.json.
# With --mainnet as the first argument, runs the mainnet replay probe instead
# (cmd/mainnet: harness/mainnet-cases.json -> reports/replay-mainnet.md).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="${WALLET_BACKEND_REPO:-$here/.work/wallet-backend}"
[ -d "$repo/.git" ] || git clone -q https://github.com/stellar/wallet-backend "$repo"
started=0
if [ -z "${XCK_PG_ADMIN_DSN:-}" ]; then XCK_PG_ADMIN_DSN="$("$here/scripts/pg.sh" start)"; started=1; fi
trap '[ $started = 1 ] && "$here/scripts/pg.sh" stop >/dev/null || true' EXIT
cmd=replay; if [ "${1:-}" = "--mainnet" ]; then cmd=mainnet; shift; fi
cd "$here" && go run "./cmd/$cmd" -root .. -wallet-backend "$repo" -pg "$XCK_PG_ADMIN_DSN" "$@"
