#!/usr/bin/env bash
# Start/stop a throwaway PostgreSQL + TimescaleDB for the replay harness.
#   harness/scripts/pg.sh start|stop|dsn
# Uses PG_BIN (directory with initdb/pg_ctl/postgres; TimescaleDB must be
# installed for that server). Data lives in harness/.work/pgdata and is
# deleted on start. In CI, use a timescale/timescaledb service container and
# set XCK_PG_ADMIN_DSN instead of running this script.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
data="$here/.work/pgdata"
port="${XCK_PG_PORT:-55432}"
bin="${PG_BIN:-$(dirname "$(command -v pg_ctl 2>/dev/null || echo /usr/lib/postgresql/17/bin/pg_ctl)")}"
case "${1:-}" in
start)
  rm -rf "$data"; mkdir -p "$here/.work"
  "$bin/initdb" -D "$data" -U postgres --auth=trust >/dev/null
  printf "shared_preload_libraries='timescaledb'\nport=%s\nunix_socket_directories='/tmp'\nlisten_addresses='127.0.0.1'\ntimescaledb.telemetry_level=off\n" "$port" >> "$data/postgresql.conf"
  "$bin/pg_ctl" -D "$data" -l "$here/.work/pg.log" -w start >/dev/null
  echo "postgres://postgres@127.0.0.1:$port/postgres?sslmode=disable" ;;
stop) "$bin/pg_ctl" -D "$data" -m fast stop >/dev/null && echo stopped ;;
dsn) echo "postgres://postgres@127.0.0.1:$port/postgres?sslmode=disable" ;;
*) echo "usage: $0 start|stop|dsn" >&2; exit 2 ;;
esac
