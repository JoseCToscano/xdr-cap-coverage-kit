import { mainnet } from "./_mainnet.mjs";
const m = mainnet("c28fd856089cd9ffaa468c1f121f804ee2ddb33bbf45a95d82a497a4966f1559",
  "Soroban transactions that create a trustline occur in 7 mainnet transactions in the sample (0.28 per million); in this one SAC trust() is a sub-invocation of a batch contract, not the top-level call.");
const r = "/tx/tx/operations/0/body/invoke_host_function/auth/0/root_invocation";
const ch = "$TX/tx_apply_processing/v4/operations/0/changes/5/created/data/trustline";
export default {
  id: "mainnet-cap73-nested-sac-trust-creates-trustline",
  title: "Mainnet batch contract call whose sub-invocation SAC trust(G) creates a trustline",
  caps: ["CAP-0073", "CAP-0046-11"],
  protocol: { introduced_in: 26, captured_on: 29 },
  ...m,
  checks: [
    { id: "top-fn-batch", path: "/tx/tx/operations/0/body/invoke_host_function/host_function/invoke_contract/function_name", op: "equals", value: "batch", note: "Top-level call is not trust()." },
    { id: "sub-fn-trust", path: `${r}/sub_invocations/0/function/contract_fn/function_name`, op: "equals", value: "trust", note: "SAC trust() one level down." },
    { id: "sub-contract-is-sac", path: `${r}/sub_invocations/0/function/contract_fn/contract_address`, op: "strkey", value: "CCKCKCPHYVXQD4NECBFJTFSCU2AMSJGCNG4O6K4JVRE2BLPR7WNDBQIQ", note: "The SAC of SHX:GDSTRSHX... on mainnet (Asset.contractId)." },
    { id: "sub-trust-arg", path: `${r}/sub_invocations/0/function/contract_fn/args/0/address`, op: "strkey", value: "GAC6NBVTNHBVMYDQ7EZCA6E5VKJWZZVDZQWBCIPDDZCWOIUI3ME2PIHA", note: "Trustline holder." },
  ],
  ledgerChecks: [
    { id: "lcm-trustline-created", path: `${ch}/account_id`, op: "strkey", value: "GAC6NBVTNHBVMYDQ7EZCA6E5VKJWZZVDZQWBCIPDDZCWOIUI3ME2PIHA", note: "Trustline created in the meta (wallet-backend #731 shape, nested)." },
    { id: "lcm-success", path: "$TX/result/result/result/tx_success/0/op_inner/invoke_host_function/success", op: "preserved", note: "Applied." },
  ],
  tags: ["sac", "trustline", "nested-auth", "mainnet"],
  linked_issues: [{ url: "https://github.com/stellar/wallet-backend/issues/731", role: "related", component: "SAC trust() state change" }],
};
