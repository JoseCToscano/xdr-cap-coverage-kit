// Mined from existing testnet history (not submitted by this kit) by
// tools/mine-testnet.mjs: a Soroban auth tree of depth 3 with 3 sub-invocations
// under the root (compose -> swap_exact_tokens_for_tokens -> transfer).
import { readFileSync } from "node:fs";
const m = JSON.parse(readFileSync(new URL("../raw/cap46-nested-auth.json", import.meta.url)));
const b = m.best;
const root = "/tx/tx/operations/0/body/invoke_host_function/auth/0/root_invocation";
export default {
  id: "cap46-11-nested-auth-depth-3",
  title: "Soroban authorization tree of depth 3 (root with 3 sub-invocations, each with 1 child)",
  caps: ["CAP-0046-11"],
  protocol: { introduced_in: 20, captured_on: 30 },
  passphrase: "Test SDF Network ; September 2015",
  xdrType: "TransactionEnvelope",
  base64: () => b.envelope_xdr,
  provenance: {
    kind: "testnet",
    origin: "mined_from_testnet_history",
    origin_note: `Found by tools/mine-testnet.mjs scanning ${m.scanned_txs} testnet transactions via RPC getTransactions. Not submitted by this kit.`,
    ledger: b.ledger,
    tx_hash: b.tx_hash,
    source_url: `https://horizon-testnet.stellar.org/transactions/${b.tx_hash}`,
    tx_created_at: b.created_at,
    retrieved_at: m.mined_at,
  },
  checks: [
    { id: "root-has-3-subs", path: `${root}/sub_invocations`, op: "not-dropped", value: 3, note: "Three sub-invocations under the root." },
    { id: "depth-3", path: `${root}/sub_invocations/2/sub_invocations/0/sub_invocations`, op: "length", value: 0, note: "Leaf at depth 3. Walkers without a depth cap recurse here; walkers that only read the root miss the transfers." },
    { id: "leaf-fn", path: `${root}/sub_invocations/2/sub_invocations/0/function/contract_fn/function_name`, op: "equals", value: "transfer", note: "Leaf is a token transfer." },
  ],
  ledger: { sequence: b.ledger },
  ledgerChecks: [
    { id: "lcm-success", path: "$TX/result/result/result/tx_success/0/op_inner/invoke_host_function/success", op: "preserved", note: "Applied." },
  ],
  tags: ["nested-auth", "recursion"],
  linked_issues: [],
};
