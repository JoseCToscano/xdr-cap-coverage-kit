// js-stellar-sdk #1766: Asset.compare() ordered issuers by G... strkey text,
// not by key bytes like stellar-core. A valid liquidity pool asset pair was
// rejected as out of order.
// https://github.com/stellar/js-stellar-sdk/pull/1766
// Buggy: 17.2.0. Fixed: 17.2.1.
// Usage: node 1766-asset-issuer-order.mjs <sdk-17-2-0|sdk-17-2-1>
const pkg = process.argv[2];
const { Asset, Keypair, LiquidityPoolAsset, StrKey } = await import(pkg);

// Deterministic search: issuer seeds 1..n, find a pair whose strkey text
// order disagrees with their raw key byte order.
function issuer(i) {
  const seed = Buffer.alloc(32, 0); seed.writeUInt32BE(i, 28);
  return Keypair.fromRawEd25519Seed(seed).publicKey();
}
let pair;
for (let i = 1; i < 200 && !pair; i++) for (let j = i + 1; j < 200 && !pair; j++) {
  const a = issuer(i), b = issuer(j);
  const byText = a < b ? -1 : 1;
  const byBytes = Buffer.compare(StrKey.decodeEd25519PublicKey(a), StrKey.decodeEd25519PublicKey(b));
  if (byText !== byBytes) pair = byBytes < 0 ? [a, b] : [b, a]; // pair[0] < pair[1] by bytes
}
const [lo, hi] = pair;
const A = new Asset("USD", lo), B = new Asset("USD", hi);
console.log(`[#1766] issuers (byte order): ${lo} < ${hi}; text order says the opposite`);
try {
  new LiquidityPoolAsset(A, B, 30);
  console.log(`[#1766] ${pkg}: PASS - pool asset accepted in network (byte) order`);
} catch (e) {
  console.log(`[#1766] ${pkg}: FAIL - valid pair rejected: ${e.message}`);
  process.exitCode = 1;
}
