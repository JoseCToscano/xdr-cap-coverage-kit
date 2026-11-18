import { mainnet } from "./_mainnet.mjs";
const m = mainnet("7782f341e1bdd722f97bc5d9323815d35310e2f46f23f5fcab94f6fe4803796d",
  "auth trees of depth 4 occur in 871 mainnet transactions in the sample (34.5 per million); 4 is the deepest seen.");
const r = "/tx/tx/operations/0/body/invoke_host_function/auth/0/root_invocation";
export default {
  id: "mainnet-cap46-11-auth-tree-depth-4",
  title: "Mainnet Soroban authorization tree of depth 4 (the deepest seen on mainnet), 4 sub-invocations under the root",
  caps: ["CAP-0046-11"],
  protocol: { introduced_in: 20, captured_on: 29 },
  ...m,
  checks: [
    { id: "root-has-4-subs", path: `${r}/sub_invocations`, op: "not-dropped", value: 4, note: "Four sub-invocations under exec()." },
    { id: "depth-4-leaf", path: `${r}/sub_invocations/3/sub_invocations/0/sub_invocations/0/function/contract_fn/function_name`, op: "equals", value: "transfer", note: "Leaf at depth 4: exec -> mint_with... -> mint -> transfer." },
    { id: "depth-4-leaf-is-leaf", path: `${r}/sub_invocations/3/sub_invocations/0/sub_invocations/0/sub_invocations`, op: "length", value: 0, note: "Depth 4 is the bottom." },
  ],
  ledgerChecks: [
    { id: "lcm-success", path: "$TX/result/result/result/tx_success/0/op_inner/invoke_host_function/success", op: "preserved", note: "Applied." },
  ],
  tags: ["nested-auth", "recursion", "mainnet"],
  linked_issues: [{ url: "https://github.com/stellar/wallet-backend/issues/820", role: "related", component: "walkInvocation recursion (XDRL002)" }],
};
