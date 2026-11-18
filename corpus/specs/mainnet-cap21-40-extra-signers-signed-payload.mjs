import { mainnet } from "./_mainnet.mjs";
const m = mainnet("fab818c3d8c1c5bba4ffb8468c9e97913bd1c571da9d2c34897f4916c7a606e0",
  "P keys in preconditions extra_signers first appear at ledger 65,300,015 (this transaction is in that ledger) and reach 20,670 transactions in the sample.");
const c = "/tx/tx/cond/v2";
export default {
  id: "mainnet-cap21-40-extra-signers-signed-payload",
  title: "Mainnet PRECOND_V2 with 2 signed-payload (P) extra signers; from the first sampled ledger with this pattern (failed: over_sendmax)",
  caps: ["CAP-0021", "CAP-0040"],
  protocol: { introduced_in: 19, captured_on: 29 },
  ...m,
  checks: [
    { id: "two-extra-signers", path: `${c}/extra_signers`, op: "length", value: 2, note: "Maximum of 2 extra signers." },
    { id: "extra-signer-0-P", path: `${c}/extra_signers/0`, op: "strkey", value: "PABSQ37P6FNTA4VKJIO54BR4BKXXMRKU6EFO7RVQD6Y4ACKBH2ZBUAAAAAOHG5DFNRWGC4RNMVXHMZLMN5YGKLLTMVQXEY3IFV3DCLYAALMA",
      note: "Signed-payload signer key (P...). The key type behind wallet-backend #729 / #716 producer 3, here in preconditions rather than SetOptions." },
    { id: "extra-signer-1-P", path: `${c}/extra_signers/1`, op: "strkey", value: "PANKAXT5ZIGT35PS2POIKXW35GYJNMRYTYOPW3ZESGL6RWR5WJ2JGAAAAAOHG5DFNRWGC4RNMVXHMZLMN5YGKLLTMVQXEY3IFV3DCLYBX2CA", note: "Second P key." },
    { id: "ledger-bounds", path: `${c}/ledger_bounds/max_ledger`, op: "equals", value: 65300016, note: "Valid for two ledgers." },
  ],
  ledgerChecks: [
    { id: "lcm-failed", path: "$TX/result/result/result/tx_failed/0/op_inner/path_payment_strict_receive", op: "equals", value: "over_sendmax", note: "Failed transaction: still charged a fee and still ingested by indexers." },
  ],
  tags: ["preconditions", "signed-payload", "max-length", "mainnet"],
  linked_issues: [
    { url: "https://github.com/stellar/wallet-backend/pull/729", role: "related", component: "signed-payload signer keys" },
    { url: "https://github.com/stellar/wallet-backend/issues/716", role: "related", component: "AddressBytea length" },
  ],
};
