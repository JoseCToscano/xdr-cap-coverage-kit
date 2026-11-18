import { mainnet } from "./_mainnet.mjs";
const m = mainnet("887916c00e68177b83ae713a111908416d5a4ee026b09e5d4ac6d95ac43ca577",
  "InnerTransactionResultResult.tx_bad_auth occurs in 1 mainnet transaction in the sample (0.04 per million): this one.");
const FB = "/tx_fee_bump/tx";
export default {
  id: "mainnet-cap15-fee-bump-inner-bad-auth",
  title: "Mainnet fee bump around a Soroban transfer whose inner transaction failed with tx_bad_auth",
  caps: ["CAP-0015", "CAP-0046-11"],
  protocol: { introduced_in: 13, captured_on: 29 },
  ...m,
  checks: [
    { id: "fee-source", path: `${FB}/fee_source`, op: "strkey", value: "GBVVWAJ7BQOQW3R3NL4HXRRZ5VR2BVTMRIF57SK3UYN6RNW3S2S5GT34", note: "Fee payer." },
    { id: "inner-source", path: `${FB}/inner_tx/tx/tx/source_account`, op: "strkey", value: "GCPGYZXEF5XPOMN5PTP3MMOXCN63XQ3ANAD35PTZ2X32X33FCISAVLHJ", note: "Inner source differs from fee source." },
  ],
  ledgerChecks: [
    { id: "lcm-inner-bad-auth", path: "$TX/result/result/result/tx_fee_bump_inner_failed/result/result", op: "equals", value: "tx_bad_auth", note: "InnerTransactionResultResult arm tx_bad_auth." },
    { id: "lcm-inner-hash", path: "$TX/result/result/result/tx_fee_bump_inner_failed/transaction_hash", op: "equals", value: "f989daec7959cce7160ba5b7f1c978a8bd4280c1e8fb00242bd085ec5c78f773", note: "Inner transaction hash (differs from the fee-bump hash)." },
  ],
  tags: ["fee-bump", "mainnet"],
  linked_issues: [],
};
