import { mainnet } from "./_mainnet.mjs";
const m = mainnet("88fc68606825a421a6d5652c8022df69c8a0c618b47b6e13e3c29bd0e7777432",
  "RevokeSponsorshipOp.signer occurs in 5 mainnet transactions in the sample (0.20 per million).");
const FB = "/tx_fee_bump/tx/inner_tx/tx/tx";
export default {
  id: "mainnet-cap33-revoke-sponsorship-signer",
  title: "Mainnet fee-bumped transaction revoking sponsorship of an account, a signer and four trustlines (7 ops)",
  caps: ["CAP-0033", "CAP-0015"],
  protocol: { introduced_in: 15, captured_on: 29 },
  ...m,
  checks: [
    { id: "revoke-signer-account", path: `${FB}/operations/1/body/revoke_sponsorship/signer/account_id`, op: "strkey", value: "GCRMX33DZJ4J4PSM5OOI75SMKW7VSQXJYH4EABNYENKURNLOFJOCWZPM", note: "RevokeSponsorshipOp arm signer." },
    { id: "revoke-signer-key", path: `${FB}/operations/1/body/revoke_sponsorship/signer/signer_key`, op: "strkey", value: "GAYMTOTEZZZAA5LVQP53OICEH7V2UJB6FPQSCIZ3MFAKP6RBKUBQCGEG", note: "Signer whose sponsorship is revoked." },
    { id: "seven-ops", path: `${FB}/operations`, op: "length", value: 7, note: "Account, signer, 4 trustlines, payment." },
  ],
  ledgerChecks: [
    { id: "lcm-result", path: "$TX/result/result/result", op: "preserved", note: "Result present." },
  ],
  tags: ["sponsorship", "fee-bump", "mainnet"],
  linked_issues: [],
};
