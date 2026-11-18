// Submitted by this kit on Protocol 30 testnet. Native SAC transfer whose `to`
// is a muxed contract address (W..., SC_ADDRESS_TYPE_MUXED_CONTRACT, CAP-84),
// muxed ID 2^64-1. The event carries the plain C address in topics and the
// ID as data.to_muxed_id.
import { capture, submittedProvenance, accounts, TESTNET } from "./_captures.mjs";
const c = capture("cap84-sac-transfer-to-muxed-contract");
const args = "/tx/tx/operations/0/body/invoke_host_function/host_function/invoke_contract/args";
const ev = "$TX/tx_apply_processing/v4/operations/0/events/0/body/v0";
export default {
  id: "cap84-sac-transfer-to-muxed-contract",
  title: "SAC transfer to a muxed contract address (W..., CAP-84) with muxed ID 2^64-1",
  caps: ["CAP-0084", "CAP-0067"],
  protocol: { introduced_in: 30, captured_on: 30 },
  passphrase: TESTNET,
  xdrType: "TransactionEnvelope",
  base64: () => c.envelope_xdr,
  provenance: { ...submittedProvenance(c), to: c.to, to_contract: c.to_contract, to_muxed_id: c.to_muxed_id },
  checks: [
    { id: "to-is-w", path: `${args}/1/address`, op: "strkey", value: c.to,
      note: "SCAddress arm 5 (muxed contract). Readers built before Protocol 30 fail to decode this or print it as a C address and lose the ID." },
    { id: "from-g", path: `${args}/0/address`, op: "strkey", value: accounts.A, note: "Sender." },
    { id: "amount", path: `${args}/2/i128`, op: "equals", value: "10000000", note: "1 XLM." },
  ],
  ledger: { sequence: c.ledger },
  ledgerChecks: [
    { id: "lcm-event-to-plain-c", path: `${ev}/topics/2/address`, op: "strkey", value: c.to_contract,
      note: "Event topic carries the non-muxed contract address, per CAP-84/CAP-67." },
    { id: "lcm-event-to-muxed-id", path: `${ev}/data/map/1/val/u64`, op: "equals", value: "18446744073709551615",
      note: "data.to_muxed_id is the full uint64. A JS number or int64 column gets it wrong." },
    { id: "lcm-event-amount", path: `${ev}/data/map/0/val/i128`, op: "equals", value: "10000000", note: "Amount in the map form of transfer data." },
    { id: "lcm-protocol-30", path: "$LCM/ledger_header/header/ledger_version", op: "equals", value: 30, note: "Protocol 30." },
  ],
  tags: ["muxed", "muxed-contract", "muxed-max-id", "sac", "protocol-30"],
  linked_issues: [],
};
