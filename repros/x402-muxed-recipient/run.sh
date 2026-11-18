#!/usr/bin/env bash
# Reproduces the stellar-x402-policies merchant-allowlist bug (a SAC transfer
# to an M... address of an allowlisted merchant was rejected with NotAllowed)
# using the `to` argument captured on testnet in corpus entry
# cap67-sac-transfer-to-muxed-account, on the commit before the fix and on the fix.
#   buggy a1c5a03^   fixed a1c5a03 "fix(allowlist): accept muxed recipient addresses (p30)"
# Also records whether that soroban-sdk (28) can decode the CAP-84 W argument.
# Needs: git, cargo (Rust stable). Network only for the first clone + crates.
set -u
here="$(cd "$(dirname "$0")" && pwd)"
root="$here/../.."
src="${X402_SRC:-$here/.stellar-x402-policies}"
[ -d "$src/.git" ] || git clone -q https://github.com/JoseCToscano/stellar-x402-policies "$src"
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$here/.target}"
arg() { node -e '
  const e=require(process.argv[1]);
  console.log(JSON.stringify(e.expected.json.tx.tx.operations[0].body.invoke_host_function.host_function.invoke_contract.args[1]));' "$1"; }
enc() { stellar xdr encode --type ScVal --input json --output single-base64; }
export ZZ_TO_SCVAL_M="$(arg "$root/corpus/entries/cap67-sac-transfer-to-muxed-account.json" | enc)"
export ZZ_TO_SCVAL_W="$(arg "$root/corpus/entries/cap84-sac-transfer-to-muxed-contract.json" | enc)"
export ZZ_MERCHANT_G="$(node -e 'console.log(require(process.argv[1]).expected.ledger_checks.find(c=>c.id==="lcm-event-to-plain-g").value)' "$root/corpus/entries/cap67-sac-transfer-to-muxed-account.json")"
echo "to (M, from corpus): $ZZ_TO_SCVAL_M"
echo "to (W, from corpus): $ZZ_TO_SCVAL_W"
echo "allowlisted merchant (base G of the M): $ZZ_MERCHANT_G"
bad=0
run() { # label sha expect_m(0 pass|1 fail)
  local wt="$here/.wt-$1"
  rm -rf "$wt"; git -C "$src" worktree prune
  git -C "$src" worktree add -q --detach "$wt" "$2"
  cat "$here/zz_corpus_test.rs.txt" >> "$wt/contracts/merchant-allowlist-policy/src/test.rs"
  echo "== $1 @ $(git -C "$wt" log -1 --format='%h %ad %s' --date=short)"
  # M case: pass/fail is the test's own exit status.
  if (cd "$wt/contracts" && cargo test -p merchant-allowlist-policy --lib -- --exact test::zz_corpus_cap67_muxed_to_of_allowlisted_merchant > "$here/.out" 2>&1); then got=0; else got=1; fi
  grep -E "^test test::zz_|^HostError|test result" "$here/.out" | sed 's/^/  M: /'
  # W case: observation printed by the test.
  (cd "$wt/contracts" && cargo test -p merchant-allowlist-policy --lib -- --exact test::zz_corpus_cap84_w_scval_decodes_in_this_sdk --nocapture > "$here/.out" 2>&1)
  grep -oE "ZZ W decode in this soroban-sdk: .*" "$here/.out" | sed 's/^ZZ /  W: /'
  if [ "$got" != "$3" ]; then echo "  !! unexpected M result (got $got, wanted $3)"; bad=1; fi
  rm -f "$here/.out"; git -C "$src" worktree remove --force "$wt"
}
run buggy a1c5a03^ 1
run fixed a1c5a03 0
echo; [ $bad = 0 ] && echo "x402 repro behaved as expected" || echo "x402 repro did not behave as expected"
exit $bad
