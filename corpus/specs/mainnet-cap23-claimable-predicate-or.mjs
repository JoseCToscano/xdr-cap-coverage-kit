import { mainnet } from "./_mainnet.mjs";
const m = mainnet("845ffefd29e5f1f88c00bec5c0ed771542339f2c170a8d5da9756efe4071de1a",
  "ClaimPredicate.or occurs in 1 mainnet transaction in the sample (0.04 per million): this one.");
const cl = "$TX/tx_apply_processing/v4/operations/0/changes/4/state/data/claimable_balance/claimants/1/claimant_type_v0/predicate";
export default {
  id: "mainnet-cap23-claimable-predicate-or",
  title: "Mainnet claim of a claimable balance whose claimant predicate is or(not(before_absolute_time), unconditional)",
  caps: ["CAP-0023"],
  protocol: { introduced_in: 14, captured_on: 29 },
  ...m,
  checks: [
    { id: "claim-op", path: "/tx/tx/operations/0/body/claim_claimable_balance/balance_id", op: "equals", value: "BAACHGCZYK6X7SVR6YPK7WUVZPIF2UBU6446UATBOZYPEVUXXZ34P433NA", note: "Claimed balance." },
  ],
  ledgerChecks: [
    { id: "lcm-or-arms", path: `${cl}/or`, op: "length", value: 2, note: "Predicate or with two arms (recursive ClaimPredicate, one of the XDRL002 types)." },
    { id: "lcm-or-unconditional", path: `${cl}/or/1`, op: "equals", value: "unconditional", note: "Second arm." },
    { id: "lcm-or-not-time", path: `${cl}/or/0/not/before_absolute_time`, op: "equals", value: "1794546000", note: "First arm: not(before_absolute_time)." },
  ],
  tags: ["claimable-balance", "recursion", "mainnet"],
  linked_issues: [],
};
