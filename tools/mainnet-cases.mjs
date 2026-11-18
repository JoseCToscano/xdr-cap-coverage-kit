// Builds harness/mainnet-cases.json for the mainnet replay probe
// (harness/cmd/mainnet) from a list of real mainnet transactions. Every
// expectation is derived from the ledger itself with the reference decoder
// (stellar CLI): the transaction's apply index, its source / fee source (base
// G of any M), and the accounts whose trustline the transaction created.
// Usage: node tools/mainnet-cases.mjs   (reads harness/mainnet-picks.json)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { zstdDecompressSync } from "node:zlib";
import { StrKey } from "@stellar/stellar-sdk";
import { fetchLedger, objectKey, lcmOfBatch, rustDecodeLcm, sha256 } from "./galexie.mjs";
import { innerTx } from "./frequency/shapes.mjs";

const root = new URL("..", import.meta.url).pathname;
const picks = JSON.parse(readFileSync(join(root, "harness/mainnet-picks.json"), "utf8"));
const base = (a) => (a[0] === "M" ? StrKey.encodeEd25519PublicKey(StrKey.decodeMed25519PublicKey(a).subarray(0, 32)) : a);
const cache = join(process.env.XCK_LCM_CACHE ?? join(homedir(), ".cache/xck-lcm"), "pubnet");
async function ledger(seq) {
  const p = join(cache, objectKey(seq));
  const compressed = existsSync(p) ? readFileSync(p) : (await fetchLedger(seq, { net: "pubnet" })).compressed;
  return { compressed, json: rustDecodeLcm(lcmOfBatch(zstdDecompressSync(compressed))) };
}
function envelopes(v) {
  const out = [];
  for (const ph of v.tx_set.v1.phases) {
    if (ph.v0) for (const c of ph.v0) out.push(...c.txset_comp_txs_maybe_discounted_fee.txs);
    if (ph.v1) for (const st of ph.v1.execution_stages) for (const cl of st) out.push(...cl);
  }
  return out;
}
const cases = [];
for (const pk of picks) {
  const { compressed, json } = await ledger(pk.ledger);
  const v = json.v2;
  const txIndex = v.tx_processing.findIndex((t) => t.result.transaction_hash === pk.tx);
  if (txIndex < 0) throw new Error(`${pk.tx} not in ledger ${pk.ledger}`);
  const meta = v.tx_processing[txIndex];
  const res = meta.result.result.result;
  const ok = Boolean(res.tx_success || res.tx_fee_bump_inner_success);
  // Find the envelope: the one whose source/seq matches is ambiguous, so use the order-matched hash list
  // from the frequency tooling's Go hasher.
  const { execFileSync } = await import("node:child_process");
  const hashes = JSON.parse(execFileSync(join(root, "tools/frequency/.bin/txhash"), ["Public Global Stellar Network ; September 2015"],
    { input: lcmOfBatch(zstdDecompressSync(compressed)) }).toString());
  const env = envelopes(v)[hashes.indexOf(pk.tx)];
  const tx = innerTx(env);
  const accts = new Set([base(tx.source_account)]);
  if (env.tx_fee_bump) accts.add(base(env.tx_fee_bump.tx.fee_source));
  const common = { group: pk.group, ledger: pk.ledger, tx: pk.tx, tx_index: txIndex, ledger_txs: v.tx_processing.length,
    object_key: objectKey(pk.ledger), sha256_zst: sha256(compressed) };
  if (pk.group === "p-extra-signers") {
    const xs = tx.cond?.v2?.extra_signers ?? [];
    cases.push({ id: pk.id, ...common, note: `${xs.length} P keys in preconditions extra_signers; tx ${ok ? "succeeded" : "failed"}. Expect: tx row with this hash, participants include ${[...accts].join(", ")}, no malformed address in any row for the tx.`,
      expect: { kind: "tx", hash: pk.tx, accounts: [...accts].join(",") } });
  } else if (pk.group === "soroban-trustline") {
    const created = [];
    JSON.stringify(meta.tx_apply_processing, (k, val) => { if (val && val.created?.data?.trustline) created.push(val.created.data.trustline); return val; });
    const tls = created.map((t) => `${t.account_id} ${t.asset.credit_alphanum4?.asset_code ?? t.asset.credit_alphanum12?.asset_code ?? JSON.stringify(t.asset)}`);
    const fns = (tx.operations ?? []).map((o) => o.body?.invoke_host_function?.host_function?.invoke_contract?.function_name).filter(Boolean);
    const acct = created[0].account_id;
    // How was the trustline created? Look for a contract function named trust anywhere in the auth trees.
    const authFns = [];
    const walk = (inv, d) => { const f = inv.function?.contract_fn; if (f) authFns.push(`${"  ".repeat(d)}${f.function_name}@${f.contract_address.slice(0, 8)}`); (inv.sub_invocations ?? []).forEach((s) => walk(s, d + 1)); };
    for (const o of tx.operations ?? []) for (const a of o.body?.invoke_host_function?.auth ?? []) walk(a.root_invocation, 0);
    const trustAt = fns.includes("trust") ? "top-level trust()" : authFns.some((f) => f.trim().startsWith("trust@")) ? "nested trust() in the auth tree" : "no trust() call in the auth tree";
    cases.push({ id: `${pk.id}-trustline`, ...common, note: `Soroban call ${fns.join(", ")} creates trustline(s): ${tls.join("; ")}; path: ${trustAt}; tx ${ok ? "succeeded" : "failed"}. Expect: TRUSTLINE/ADD state change for ${acct}.`,
      path: trustAt, auth_fns: authFns, expect: { kind: "trustline", account: acct } });
    cases.push({ id: `${pk.id}-tx`, ...common, note: `Same tx. Expect: participants include ${[...new Set([...accts, ...created.map((t) => t.account_id)])].join(", ")}, no malformed address.`,
      expect: { kind: "tx", hash: pk.tx, accounts: [...new Set([...accts, ...created.map((t) => t.account_id)])].join(",") } });
  } else throw new Error(`unknown group ${pk.group}`);
}
writeFileSync(join(root, "harness/mainnet-cases.json"), JSON.stringify({ generated_by: "tools/mainnet-cases.mjs", network: "pubnet", cases }, null, 2) + "\n");
console.log(`wrote ${cases.length} cases`);
