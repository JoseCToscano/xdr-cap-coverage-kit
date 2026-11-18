#!/usr/bin/env bash
# Runs every job of .github/workflows/ci.yml on this machine, in order, and
# prints PASS/FAIL per step. Needs node 24, Go, Rust, the stellar CLI and git.
# For the replay job set XCK_PG_ADMIN_DSN, or PG_BIN for a local
# PostgreSQL + TimescaleDB (harness/scripts/pg.sh). WALLET_BACKEND_REPO
# reuses an existing wallet-backend clone.
set -u
cd "$(dirname "$0")/.."
fails=0
step() { local name="$1"; shift; local t0=$SECONDS
  if ( "$@" ) > "/tmp/ci-local-$$.log" 2>&1; then echo "PASS  $name ($((SECONDS - t0))s)"
  else echo "FAIL  $name ($((SECONDS - t0))s)"; tail -20 "/tmp/ci-local-$$.log" | sed 's/^/      /'; fails=$((fails + 1)); fi; }
step "npm ci"                                  npm ci --no-audit --no-fund
step "corpus: check-corpus --check-lcm --check" node tools/check-corpus.mjs --check-lcm --check
step "corpus: coverage report fresh"           node tools/coverage-report.mjs --check
step "frequency: report matches raw data"      node tools/frequency/run.mjs --check
step "livecheck: three-reader fixture tests"   node tools/livecheck/test.mjs
step "site: npm ci"                           bash -c "cd site && npm ci --no-audit --no-fund"
step "site: build-time data fresh"            bash -c "cd site && node scripts/build-data.mjs --check"
step "site: static build"                     bash -c "cd site && npm run build"
step "corpus: Go runner"                       bash -c "cd runners/go && go run ."
step "corpus: Rust runner"                     bash -c "cd runners/rust && cargo run --release --locked"
step "corpus: runner outputs committed"        git diff --exit-code reports/raw/rust-cli.json reports/raw/js.json reports/raw/go.json reports/raw/rust.json
step "corpus: divergence matrix fresh"         node tools/divergence-matrix.mjs --check
step "repros-js"                               bash repros/js-stellar-sdk/run.sh
step "repros-x402"                             bash repros/x402-muxed-recipient/run.sh
step "wallet-backend: harness unit tests"      bash -c "cd harness && go vet ./... && go test ./..."
step "wallet-backend: column-type repros"      env WB_SRC="${WALLET_BACKEND_REPO:-}" bash -c '[ -n "$WB_SRC" ] || unset WB_SRC; bash repros/wallet-backend/run.sh'
step "wallet-backend: replay matrix"           bash harness/run.sh
step "wallet-backend: replay matrix committed" git diff --exit-code reports/replay-matrix.md reports/raw/replay.json
step "wallet-backend: mainnet replay probe"     bash harness/run.sh --mainnet -check
step "linter: vet + analysistest"              bash -c "cd linter && go vet ./... && go test ./..."
step "linter: wallet-backend scan matches"     bash linter/scan-wallet-backend.sh --check
rm -f "/tmp/ci-local-$$.log"
echo; [ $fails = 0 ] && echo "ALL CI STEPS PASS" || echo "$fails step(s) failed"
exit $fails
