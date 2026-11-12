#!/usr/bin/env bash
# Runs each repro on the pinned buggy and fixed versions.
# Expected: buggy -> FAIL (exit 1), fixed -> PASS (exit 0).
set -u
cd "$(dirname "$0")"
[ -d node_modules ] || npm ci --no-audit --no-fund >/dev/null
bad=0
run() { # script version expected_exit
  node "$1" "$2"; code=$?
  if [ "$code" != "$3" ]; then echo "  !! unexpected exit $code (wanted $3)"; bad=1; fi
}
run 1789-scval-map-collision.mjs sdk-17-2-1 1
run 1789-scval-map-collision.mjs sdk-17-3-0 0
run 1785-muxed-and-offer-ids.mjs sdk-17-2-1 1
run 1785-muxed-and-offer-ids.mjs sdk-17-3-0 0
run 1766-asset-issuer-order.mjs  sdk-17-2-0 1
run 1766-asset-issuer-order.mjs  sdk-17-2-1 0
echo; [ $bad = 0 ] && echo "all repros behaved as expected" || echo "some repros did not behave as expected"
exit $bad
