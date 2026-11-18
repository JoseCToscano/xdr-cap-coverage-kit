// Submitted by this kit on Protocol 30 testnet. A pool-share trustline and a
// deposit for a pool of KIT:I1 / KIT:I2 where I1 sorts first by XDR bytes but
// second by strkey text ("GBY..." vs "GB6...": in base32 '6' is a higher value
// than 'Y', in ASCII it is lower). Core requires byte order.
import { capture, submittedProvenance, accounts, TESTNET } from "./_captures.mjs";
const c = capture("cap38-pool-issuer-order");
const lp = "/tx/tx/operations/0/body/change_trust/line/pool_share/liquidity_pool_constant_product";
export default {
  id: "cap38-pool-issuers-strkey-vs-bytes-order",
  title: "Liquidity pool whose two issuers sort one way by strkey text and the other by XDR bytes",
  caps: ["CAP-0038"],
  protocol: { introduced_in: 18, captured_on: 30 },
  passphrase: TESTNET,
  xdrType: "TransactionEnvelope",
  base64: () => c.envelope_xdr,
  provenance: { ...submittedProvenance(c), pool_id_hex: c.pool_id },
  checks: [
    { id: "asset-a-issuer-byte-first", path: `${lp}/asset_a/credit_alphanum4/issuer`, op: "strkey", value: accounts.issuer_1,
      note: "asset_a is the issuer that is smaller by XDR bytes. Sorting strkeys as text puts it second (js-stellar-sdk #1766)." },
    { id: "asset-b-issuer-text-first", path: `${lp}/asset_b/credit_alphanum4/issuer`, op: "strkey", value: accounts.issuer_2,
      note: "asset_b sorts first as text." },
    { id: "pool-fee", path: `${lp}/fee`, op: "equals", value: 30, note: "30 bps constant-product pool." },
  ],
  ledger: { sequence: c.ledger },
  ledgerChecks: [
    { id: "lcm-pool-created", path: "$TX/tx_apply_processing/v4/operations/0/changes/7/created/data/liquidity_pool/liquidity_pool_id", op: "strkey",
      value: "LB4JJ7LZOS5HN3WYYH3EACWLAB7N727L35YRSP4JYUM7XTONHQTEA4QZ", note: "Pool entry created in this tx; its ID is derived from the byte-ordered pair." },
    { id: "lcm-deposit-success", path: "$TX/result/result/result/tx_success/1/op_inner/liquidity_pool_deposit", op: "equals", value: "success", note: "Deposit applied." },
  ],
  tags: ["issuer-sort", "liquidity-pool"],
  linked_issues: [
    { url: "https://github.com/stellar/js-stellar-sdk/issues/1766", role: "reproduces", component: "LiquidityPoolAsset asset ordering" },
  ],
};
