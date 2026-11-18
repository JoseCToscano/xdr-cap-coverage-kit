import { mainnet } from "./_mainnet.mjs";
const m = mainnet("3d9ee633a13c1c4b1c01b0108b171e541aa3e9dc278861ecd6ae2c4b688813d0",
  "ScAddress muxed_account (an M address inside a Soroban value) occurs in 4 mainnet transactions in the sample (0.16 per million); here a CCTP mint_and_forward event carries it.");
const ev = "$TX/tx_apply_processing/v4/operations/0/events/8/body/v0/data/map/1";
export default {
  id: "mainnet-cap67-event-data-muxed-address",
  title: "Mainnet contract event (CCTP mint_and_forward) whose data map holds an M address (forward_recipient, muxed ID 10019)",
  caps: ["CAP-0067", "CAP-0027"],
  protocol: { introduced_in: 23, captured_on: 29 },
  ...m,
  checks: [
    { id: "fn", path: "/tx/tx/operations/0/body/invoke_host_function/host_function/invoke_contract/function_name", op: "equals", value: "mint_and_forward", note: "CCTP forwarder." },
  ],
  ledgerChecks: [
    { id: "lcm-event-key", path: `${ev}/key/symbol`, op: "equals", value: "forward_recipient", note: "Event data key." },
    { id: "lcm-event-muxed", path: `${ev}/val/address`, op: "strkey", value: "MB3KJTXPZR5PH2OYWJ2EY5AH2O5WIJI6OFUXS4PMHI7X53EKRNSSEAAAAAAAAABHEOSDW",
      note: "ScAddress::MuxedAccount in contract event data. Indexers that assume event addresses are G or C (wallet-backend #716 producer 2 is the topic variant) meet this on mainnet." },
    { id: "lcm-success", path: "$TX/result/result/result/tx_success/0/op_inner/invoke_host_function/success", op: "preserved", note: "Applied." },
  ],
  tags: ["muxed", "events", "mainnet"],
  linked_issues: [{ url: "https://github.com/stellar/wallet-backend/issues/716", role: "related", component: "muxed address in contract events" }],
};
