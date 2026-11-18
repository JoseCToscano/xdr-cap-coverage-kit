import { mainnet } from "./_mainnet.mjs";
const m = mainnet("c619a0a930a8c44b457b3952ee535355a006a15e74407999ecfacd28dec3f86a",
  "353 mainnet transactions in the sample carry a muxed ID >= 2^53 (14 per million).");
export default {
  id: "mainnet-cap27-muxed-id-above-2-53",
  title: "Mainnet payment to a muxed account whose ID (8753198265147683791) is above 2^53",
  caps: ["CAP-0027"],
  protocol: { introduced_in: 13, captured_on: 29 },
  ...m,
  checks: [
    { id: "dest-muxed", path: "/tx/tx/operations/0/body/payment/destination", op: "strkey", value: "MAT52S3LSPWEYTZVGE3G7NDZALJX4KELKTO4JSZLQFNBURWLUEYGA6LZTNZBVMLTZ5S7U",
      note: "M address with ID 8753198265147683791 (> 2^53 = 9007199254740992). A reader that turns the ID into a JS number gets a different ID (js-stellar-sdk #1785 shape)." },
    { id: "base-is-source", path: "/tx/tx/source_account", op: "strkey", value: "GAT52S3LSPWEYTZVGE3G7NDZALJX4KELKTO4JSZLQFNBURWLUEYGANS3", note: "The M address wraps the source's own G key." },
  ],
  ledgerChecks: [
    { id: "lcm-success", path: "$TX/result/result/result/tx_success/0/op_inner/payment", op: "equals", value: "success", note: "Applied." },
  ],
  tags: ["muxed", "muxed-max-id", "mainnet"],
  linked_issues: [{ url: "https://github.com/stellar/js-stellar-sdk/issues/1785", role: "related", component: "muxed ID parsing" }],
};
