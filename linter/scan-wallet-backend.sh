#!/usr/bin/env bash
# Runs xdrlint on a clean wallet-backend checkout at a pinned commit and
# writes the findings to SCAN-wallet-backend.txt (paths relative to the checkout).
#   WALLET_BACKEND_REPO   existing clone to make a worktree from (cloned if unset)
#   WB_COMMIT             commit to scan (default below)
# Exit status is 0 whether or not there are findings; --check fails if the
# result differs from the committed SCAN-wallet-backend.txt.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
commit="${WB_COMMIT:-3e22515a}"
repo="${WALLET_BACKEND_REPO:-$here/.work/wallet-backend}"
[ -d "$repo/.git" ] || git clone -q https://github.com/stellar/wallet-backend "$repo"
wt="$here/.work/wb-scan-$commit"
git -C "$repo" worktree remove --force "$wt" 2>/dev/null || true
git -C "$repo" worktree add -q --detach "$wt" "$commit"
(cd "$here" && go build -o "$here/.work/xdrlint" ./cmd/xdrlint)
out="$(mktemp)"
{
  echo "# xdrlint on stellar/wallet-backend $(git -C "$wt" log -1 --format='%h (%ad) %s' --date=short)"
  echo "# rules: XDRL002"
  (cd "$wt" && "$here/.work/xdrlint" ./... 2>&1 || true) | sed "s|$wt/||"
} > "$out"
git -C "$repo" worktree remove --force "$wt"
n=$(grep -cE "\.go:[0-9]+:[0-9]+: XDRL" "$out" || true)
echo "# findings: $n" >> "$out"
if [ "${1:-}" = "--check" ]; then
  diff -u "$here/SCAN-wallet-backend.txt" "$out" && echo "scan matches SCAN-wallet-backend.txt"
else
  mv "$out" "$here/SCAN-wallet-backend.txt"; cat "$here/SCAN-wallet-backend.txt"
fi
