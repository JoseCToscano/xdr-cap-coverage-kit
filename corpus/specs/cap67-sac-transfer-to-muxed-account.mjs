// Submitted by this kit on Protocol 30 testnet. Native SAC transfer whose `to`
// is a muxed account (M..., CAP-67) with muxed ID 0: the shape a policy that
// reads `to` as a plain Address rejects (the stellar-x402-policies allowlist
// bug fixed in a1c5a03).
import { capture, submittedProvenance, accounts, TESTNET } from "./_captures.mjs";
const c = capture("cap67-sac-transfer-to-muxed-account");
const args = "/tx/tx/operations/0/body/invoke_host_function/host_function/invoke_contract/args";
const ev = "$TX/tx_apply_processing/v4/operations/0/events/0/body/v0";
export default {
  id: "cap67-sac-transfer-to-muxed-account",
  title: "SAC transfer to a muxed account (M..., CAP-67) with muxed ID 0",
  caps: ["CAP-0067", "CAP-0027"],
  protocol: { introduced_in: 23, captured_on: 30 },
  passphrase: TESTNET,
  xdrType: "TransactionEnvelope",
  base64: () => c.envelope_xdr,
  provenance: { ...submittedProvenance(c), to: c.to, to_muxed_id: c.to_muxed_id },
  checks: [
    { id: "to-is-m", path: `${args}/1/address`, op: "strkey", value: c.to, note: "SCAddress arm 2 (muxed account), ID 0." },
  ],
  ledger: { sequence: c.ledger },
  ledgerChecks: [
    { id: "lcm-event-to-plain-g", path: `${ev}/topics/2/address`, op: "strkey", value: accounts.B, note: "Event topic carries the base G address." },
    { id: "lcm-event-to-muxed-id-zero", path: `${ev}/data/map/1/val/u64`, op: "equals", value: "0",
      note: "to_muxed_id 0 is present. 'ID 0' is not 'no ID'." },
  ],
  tags: ["muxed", "sac", "x402"],
  linked_issues: [],
};
