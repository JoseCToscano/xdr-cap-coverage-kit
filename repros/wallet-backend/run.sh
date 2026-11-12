#!/usr/bin/env bash
# Runs repro_test.go against pinned wallet-backend commits.
#   #716 buggy 6e5a5910^ (before #693)   fixed 6e5a5910 (#693, reduce muxed to base account)
#   #729 buggy 2c873353^                 fixed 2c873353 (#729 merge)
# Needs: git, Go (go.mod asks for 1.25.9 or newer). No database, no network
# after the module download.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
src="${WB_SRC:-$here/.wallet-backend}"
[ -d "$src/.git" ] || git clone -q https://github.com/stellar/wallet-backend "$src"

bad=0
run() { # label sha test-regex expected-exit
  local wt="$here/.wt-$1"
  rm -rf "$wt"; git -C "$src" worktree prune
  git -C "$src" worktree add -q --detach "$wt" "$2"
  cp "$here/repro_test.go.txt" "$wt/internal/indexer/types/zz_repro_test.go"
  echo "== $1 @ $(git -C "$wt" log -1 --format='%h %ad %s' --date=short)"
  (cd "$wt" && go test -count=1 -run "$3" -v ./internal/indexer/types/ > "$here/.out" 2>&1); code=$?
  grep -E "^(=== RUN|--- |\s+zz_repro_test.go|ok|FAIL)" "$here/.out"; rm -f "$here/.out"
  [ "$code" = 0 ] && got=0 || got=1
  if [ "$got" != "$4" ]; then echo "  !! unexpected result (go test exit $code, wanted $4)"; bad=1; fi
  git -C "$src" worktree remove --force "$wt"
}
run 716-buggy 6e5a5910^ TestRepro716 1
run 716-fixed 6e5a5910  TestRepro716 0
run 729-buggy 2c873353^ TestRepro729 1
run 729-fixed 2c873353  TestRepro729 0
run head      origin/HEAD 'TestRepro(716|729)' 0
echo; [ $bad = 0 ] && echo "all repros behaved as expected" || echo "some repros did not behave as expected"
exit $bad
