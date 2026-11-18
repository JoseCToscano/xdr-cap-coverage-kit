#!/usr/bin/env bash
# Runs the live follower (with its own restart loop), rewrites status.json every
# XCK_STATUS_EVERY_S seconds, and serves it on $PORT. If any of the three exits,
# the container exits so the platform restarts it; the cursor is checkpointed
# after every ledger, so a restart resumes at the next one.
set -u
cd /app
NET="${XCK_NET:-pubnet}"
export XCK_LIVE_DIR="${XCK_DATA:-/data}/$NET"
export XCK_PUBLIC_DIR="${XCK_DATA:-/data}/public"
mkdir -p "$XCK_LIVE_DIR" "$XCK_PUBLIC_DIR"

bash tools/livecheck/run-live.sh "$NET" >> "$XCK_LIVE_DIR/live.log" 2>&1 &
live=$!
# status.json needs a state.json; the follower writes it after its first ledger
until [ -s "$XCK_LIVE_DIR/state.json" ]; do sleep 5; kill -0 "$live" 2>/dev/null || exit 1; done
node tools/status/status.mjs --net "$NET" --dir "$XCK_LIVE_DIR" --out "$XCK_PUBLIC_DIR/status.json" --tip --watch "${XCK_STATUS_EVERY_S:-60}" &
status=$!
node tools/status/serve.mjs &
serve=$!
trap 'kill $live $status $serve 2>/dev/null; wait; exit 0' TERM INT
wait -n $live $status $serve
code=$?
echo "a checker process exited ($code); stopping so the container restarts"
kill $live $status $serve 2>/dev/null
wait
exit 1
