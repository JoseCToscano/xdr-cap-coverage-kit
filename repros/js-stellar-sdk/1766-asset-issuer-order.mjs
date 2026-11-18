// js-stellar-sdk #1766: Asset.compare() ordered issuers by G... strkey text,
// not by key bytes like stellar-core. A valid liquidity pool asset pair was
// rejected as out of order.
// https://github.com/stellar/js-stellar-sdk/pull/1766
// Buggy: 17.2.0. Fixed: 17.2.1.
// Input: the corpus entry cap38-pool-issuers-strkey-vs-bytes-order, a pool that
// stellar-core accepted on testnet (ledger 5718666) with exactly this asset order.
// Usage: node 1766-asset-issuer-order.mjs <sdk-17-2-0|sdk-17-2-1>
import { readFileSync } from "node:fs";
const pkg = process.argv[2];
const { Asset, LiquidityPoolAsset, getLiquidityPoolId, StrKey } = await import(pkg);

const e = JSON.parse(readFileSync(new URL("../../corpus/entries/cap38-pool-issuers-strkey-vs-bytes-order.json", import.meta.url)));
const lp = e.expected.json.tx.tx.operations[0].body.change_trust.line.pool_share.liquidity_pool_constant_product;
const A = new Asset(lp.asset_a.credit_alphanum4.asset_code, lp.asset_a.credit_alphanum4.issuer);
const B = new Asset(lp.asset_b.credit_alphanum4.asset_code, lp.asset_b.credit_alphanum4.issuer);
const poolOnLedger = e.expected.ledger_checks.find((c) => c.id === "lcm-pool-created").value;
console.log(`[#1766] core-accepted order (testnet ledger ${e.ledger.sequence}): ${A.getIssuer()} then ${B.getIssuer()}; text order says the opposite`);
try {
  const pool = new LiquidityPoolAsset(A, B, lp.fee);
  const id = Buffer.from(getLiquidityPoolId("constant_product", pool.getLiquidityPoolParameters())).toString("hex");
  const onLedger = Buffer.from(StrKey.decodeLiquidityPool(poolOnLedger)).toString("hex");
  if (id !== onLedger) throw new Error(`pool id ${id} != on-ledger ${onLedger}`);
  console.log(`[#1766] ${pkg}: PASS - pool asset accepted in network (byte) order; pool id matches the ledger (${poolOnLedger})`);
} catch (err) {
  console.log(`[#1766] ${pkg}: FAIL - valid pair rejected: ${err.message}`);
  process.exitCode = 1;
}
