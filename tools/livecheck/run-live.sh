#!/usr/bin/env bash
# Supervisor for the live follower: restarts it if it exits (the cursor is
# checkpointed after every ledger). Usage, detached and low priority:
#   setsid nohup nice -n 10 bash tools/livecheck/run-live.sh [pubnet] >> ~/.local/share/xck-livecheck/live.log 2>&1 < /dev/null &
cd "$(dirname "$0")/../.."
NET="${1:-pubnet}"
DIR="${XCK_LIVE_DIR:-$HOME/.local/share/xck-livecheck/$NET}"
mkdir -p "$DIR"
echo $$ > "$DIR/supervisor.pid"
trap 'kill "$child" 2>/dev/null; wait "$child"; exit 0' TERM INT
while true; do
  node --max-old-space-size=768 tools/livecheck/live.mjs --net "$NET" --dir "$DIR" &
  child=$!; echo $child > "$DIR/live.pid"
  wait "$child"; code=$?
  echo "$(date -u +%FT%TZ) live.mjs exited ($code); restarting in 15 s"
  sleep 15
done
