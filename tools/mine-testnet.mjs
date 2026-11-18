// Mines existing testnet history (RPC getTransactions) for shapes we do not
// submit ourselves: Soroban auth trees with nested sub-invocations (CAP-46-11).
// Prints the deepest one found as JSON. Usage: node tools/mine-testnet.mjs [ledgers-back]
import { xdr } from "@stellar/stellar-sdk";
import { rpc } from "./galexie.mjs";
const back = Number(process.argv[2] || 3000);
const latest = (await rpc("getLatestLedger", {})).sequence;
let cursor, best = null, scanned = 0;
const depth = (inv) => 1 + Math.max(0, ...inv.sub_invocations.map(depth));
let start = latest - back;
for (let page = 0; page < 400; page++) {
  const res = await rpc("getTransactions", cursor ? { pagination: { cursor, limit: 200 } } : { startLedger: start, pagination: { limit: 200 } });
  for (const t of res.transactions) {
    scanned++;
    if (t.status !== "SUCCESS") continue;
    const j = xdr.TransactionEnvelope.fromXdr(t.envelopeXdr, "base64").toJson();
    const env = typeof j === "string" ? JSON.parse(j) : j;
    const roots = [];
    (function find(o) {
      if (Array.isArray(o)) return o.forEach(find);
      if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (k === "root_invocation") roots.push(v); else find(v); }
    })(env);
    for (const r of roots) {
      const d = depth(r), n = r.sub_invocations.length;
      if (d >= 2 && (!best || d > best.depth || (d === best.depth && n > best.sub))) {
        best = { tx_hash: t.txHash, ledger: t.ledger, depth: d, sub: n, auth_entries: roots.length,
          created_at: new Date(Number(t.createdAt) * 1000).toISOString(), envelope_xdr: t.envelopeXdr, result_xdr: t.resultXdr, result_meta_xdr: t.resultMetaXdr };
      }
    }
  }
  if (!res.transactions.length || res.latestLedger <= (res.transactions.at(-1)?.ledger ?? 0)) break;
  cursor = res.cursor;
  if (best && best.depth >= 3) break;
}
console.error(`scanned ${scanned} txs from ledger ${start}; best depth ${best?.depth}`);
console.log(JSON.stringify({ mined_at: new Date().toISOString(), scanned_from_ledger: start, scanned_txs: scanned, best }, null, 2));
