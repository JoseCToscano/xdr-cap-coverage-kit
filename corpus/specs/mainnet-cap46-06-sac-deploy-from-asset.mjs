import { mainnet } from "./_mainnet.mjs";
const m = mainnet("25a864377a5005c720e3366c34bc06812a06f483e668a317d6bea8dffe5ff91e",
  "ContractIdPreimage.asset (deploying a Stellar Asset Contract) occurs in 6 mainnet transactions in the sample (0.24 per million).");
const hf = "/tx/tx/operations/0/body/invoke_host_function/host_function/create_contract";
export default {
  id: "mainnet-cap46-06-sac-deploy-from-asset",
  title: "Mainnet deployment of a Stellar Asset Contract from an asset (create_contract, preimage asset, executable stellar_asset)",
  caps: ["CAP-0046-06", "CAP-0046-02"],
  protocol: { introduced_in: 20, captured_on: 29 },
  ...m,
  checks: [
    { id: "preimage-asset", path: `${hf}/contract_id_preimage/asset/credit_alphanum4/asset_code`, op: "equals", value: "USDC", note: "Asset code (not the Circle issuer)." },
    { id: "preimage-issuer", path: `${hf}/contract_id_preimage/asset/credit_alphanum4/issuer`, op: "strkey", value: "GDC7X2KA2YOC6MDK4RDSOLF5XLMLHKXS2PHATVOUWC2UWQH7C3FBDRZN", note: "Issuer." },
    { id: "executable", path: `${hf}/executable`, op: "equals", value: "stellar_asset", note: "ContractExecutable stellar_asset." },
  ],
  ledgerChecks: [
    { id: "lcm-success", path: "$TX/result/result/result/tx_success/0/op_inner/invoke_host_function/success", op: "preserved", note: "Applied." },
  ],
  tags: ["sac", "contract-deploy", "mainnet"],
  linked_issues: [],
};
