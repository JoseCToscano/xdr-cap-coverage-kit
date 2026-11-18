// Accumulator for the frequency study. Per key (a union arm "Type.arm" or a
// shape name): occurrences, transactions that contain it, ledgers that contain
// it, first ledger seen, and up to 3 example transactions (earliest ledgers).
export const EXAMPLES = 3;
export function newAcc() {
  return { totals: { ledgers: 0, txs: 0, successful_txs: 0, soroban_txs: 0, unmatched_envelopes: 0 }, arms: {}, shapes: {}, hist: {}, max: {} };
}
const stat = () => ({ occ: 0, txs: 0, ledgers: 0, first: null, ex: [] });
export class Ledger {
  constructor(acc, seq) { this.acc = acc; this.seq = seq; this.seen = { arms: new Map(), shapes: new Map() }; }
  add(kind, key, who, n) {
    const s = (this.acc[kind][key] ??= stat());
    s.occ += n;
    let w = this.seen[kind].get(key);
    if (!w) { w = new Set(); this.seen[kind].set(key, w); s.ledgers++; if (s.first === null || this.seq < s.first) s.first = this.seq; }
    if (who !== "L" && !w.has(who)) { w.add(who); s.txs++; if (s.ex.length < EXAMPLES) s.ex.push({ ledger: this.seq, tx: who }); }
  }
  arm(key, who) { this.add("arms", key, who, 1); }
  shape(key, who, n) { this.add("shapes", key, who, n); }
  close() { this.seen = null; }
}
export function mergeAcc(a, b) {
  for (const [k, v] of Object.entries(b.totals)) {
    if (k.endsWith("_min")) a.totals[k] = a.totals[k] == null ? v : Math.min(a.totals[k], v);
    else if (k.endsWith("_max")) a.totals[k] = a.totals[k] == null ? v : Math.max(a.totals[k], v);
    else a.totals[k] = (a.totals[k] ?? 0) + v;
  }
  for (const kind of ["arms", "shapes"]) for (const [k, s] of Object.entries(b[kind])) {
    const t = (a[kind][k] ??= stat());
    t.occ += s.occ; t.txs += s.txs; t.ledgers += s.ledgers;
    t.first = t.first === null ? s.first : Math.min(t.first, s.first);
    t.ex = [...t.ex, ...s.ex].sort((x, y) => x.ledger - y.ledger || (x.tx < y.tx ? -1 : 1)).slice(0, EXAMPLES);
  }
  for (const [n, h] of Object.entries(b.hist)) { const t = (a.hist[n] ??= {}); for (const [k, v] of Object.entries(h)) t[k] = (t[k] ?? 0) + v; }
  for (const [n, m] of Object.entries(b.max)) {
    const t = a.max[n];
    if (!t || BigInt(m.value) > BigInt(t.value) || (BigInt(m.value) === BigInt(t.value) && m.ledger < t.ledger)) a.max[n] = m;
  }
  return a;
}
