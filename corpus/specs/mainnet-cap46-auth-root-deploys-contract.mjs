import { mainnet } from "./_mainnet.mjs";
const m = mainnet("d7ceec155dfc98681f9058c2b9a4ee07441f664cd65e176185f8f30597efebcf",
  "152 mainnet transactions in the sample have a contract deployment inside an authorization tree (6.0 per million).");
const FB = "/tx_fee_bump/tx/inner_tx/tx/tx";
const r = `${FB}/operations/0/body/invoke_host_function/auth/0/root_invocation`;
export default {
  id: "mainnet-cap46-auth-root-deploys-contract",
  title: "Mainnet fee-bumped deployment whose authorization tree root is create_contract_v2 with address credentials",
  caps: ["CAP-0046-11", "CAP-0058", "CAP-0015"],
  protocol: { introduced_in: 22, captured_on: 29 },
  ...m,
  checks: [
    { id: "host-fn-v2", path: `${FB}/operations/0/body/invoke_host_function/host_function/create_contract_v2/contract_id_preimage/address/address`, op: "strkey", value: "GCJOMP6DCXSM6SIGGTTVZEQAQLPY5TKCH263F66HRSR5DMBXGOY5C6GX", note: "Deployer." },
    { id: "auth-root-is-deploy", path: `${r}/function/create_contract_v2_host_fn/contract_id_preimage/address/address`, op: "strkey", value: "GCJOMP6DCXSM6SIGGTTVZEQAQLPY5TKCH263F66HRSR5DMBXGOY5C6GX",
      note: "The authorized invocation is the deployment itself: the input wallet-backend's contract_deploy.go walkInvocation recurses over (XDRL002, wallet-backend#820)." },
    { id: "address-credentials", path: `${FB}/operations/0/body/invoke_host_function/auth/0/credentials/address/address`, op: "strkey", value: "GCJOMP6DCXSM6SIGGTTVZEQAQLPY5TKCH263F66HRSR5DMBXGOY5C6GX", note: "Signed by the deployer's address credentials, not the tx source." },
  ],
  ledgerChecks: [
    { id: "lcm-success", path: "$TX/result/result/result/tx_fee_bump_inner_success/result/result/tx_success/0/op_inner/invoke_host_function/success", op: "preserved", note: "Applied inside the fee bump." },
  ],
  tags: ["nested-auth", "contract-deploy", "fee-bump", "mainnet"],
  linked_issues: [{ url: "https://github.com/stellar/wallet-backend/issues/820", role: "related", component: "contract_deploy.go walkInvocation" }],
};
