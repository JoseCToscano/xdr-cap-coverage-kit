// Submitted by this kit on Protocol 30 testnet. SAC trust(G) (CAP-73) creates
// an unlimited trustline for a G account and emits no contract event. The
// shape behind wallet-backend #731: the trustline exists only in the meta.
import { capture, submittedProvenance, accounts, TESTNET } from "./_captures.mjs";
const c = capture("cap73-sac-trust");
const ch = "$TX/tx_apply_processing/v4/operations/0/changes/0/created/data/trustline";
export default {
  id: "cap73-sac-trust-creates-trustline",
  title: "SAC trust(G) creates an unlimited trustline with no contract event",
  caps: ["CAP-0073", "CAP-0046-06"],
  protocol: { introduced_in: 26, captured_on: 30 },
  passphrase: TESTNET,
  xdrType: "TransactionEnvelope",
  base64: () => c.envelope_xdr,
  provenance: { ...submittedProvenance(c), sac_contract_id: c.contract_id },
  checks: [
    { id: "fn-trust", path: "/tx/tx/operations/0/body/invoke_host_function/host_function/invoke_contract/function_name", op: "equals", value: "trust", note: "SAC trust()." },
    { id: "trust-arg-g", path: "/tx/tx/operations/0/body/invoke_host_function/host_function/invoke_contract/args/0/address", op: "strkey", value: accounts.B, note: "Trustline holder." },
  ],
  ledger: { sequence: c.ledger },
  ledgerChecks: [
    { id: "lcm-trustline-created", path: `${ch}/account_id`, op: "strkey", value: accounts.B, note: "Trustline created for the G account. #731: no TRUSTLINE/ADD state change was recorded for this." },
    { id: "lcm-trustline-asset", path: `${ch}/asset/credit_alphanum4/issuer`, op: "strkey", value: accounts.issuer_1, note: "KIT:issuer_1." },
    { id: "lcm-trustline-unlimited", path: `${ch}/limit`, op: "equals", value: "9223372036854775807", note: "i64::MAX limit." },
    { id: "lcm-trustline-authorized", path: `${ch}/flags`, op: "equals", value: 1, note: "AUTHORIZED_FLAG set at creation." },
    { id: "lcm-no-contract-event", path: "$TX/tx_apply_processing/v4/operations/0/events", op: "length", value: 0,
      note: "No contract event. Readers that only follow events see nothing." },
  ],
  tags: ["sac", "trustline", "no-event"],
  linked_issues: [
    { url: "https://github.com/stellar/wallet-backend/issues/731", role: "reproduces", component: "state_changes for SAC-created trustlines" },
  ],
};
