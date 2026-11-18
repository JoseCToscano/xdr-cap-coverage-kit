// Accumulates per-ledger check results into a compact summary (counts, arm
// tallies with a few example txs, and full detail for every non-arm flag).
export const DETAIL_TYPES = ["decode_failure", "disagreement", "disagreement_overflow", "roundtrip_mismatch", "js_precision", "checker_error"];
export function newSummary() {
  return { ledgers: 0, txs: 0, segments: 0, ms: 0, ledger_min: null, ledger_max: null, close_time_min: null, close_time_max: null,
    protocol: {}, readers: { js: { ok: 0, roundtrip_ok: 0 }, go: { ok: 0, roundtrip_ok: 0 }, rust: { ok: 0, roundtrip_ok: 0, json_roundtrip_ok: 0 } },
    flag_counts: {}, flagged_txs: {}, details: [], arms: {} };
}
const EX = 3;
export function addResult(S, r) {
  S.ledgers++; S.txs += r.txs; S.segments += r.segments; S.ms += r.ms;
  S.ledger_min = Math.min(S.ledger_min ?? r.seq, r.seq); S.ledger_max = Math.max(S.ledger_max ?? r.seq, r.seq);
  if (r.close_time) { S.close_time_min = Math.min(S.close_time_min ?? r.close_time, r.close_time); S.close_time_max = Math.max(S.close_time_max ?? r.close_time, r.close_time); }
  if (r.protocol) S.protocol[r.protocol] = (S.protocol[r.protocol] ?? 0) + 1;
  for (const k of ["js", "go", "rust"]) {
    const x = r.readers[k]; if (!x?.ok) continue;
    S.readers[k].ok++; if (x.roundtrip) S.readers[k].roundtrip_ok++; if (k === "rust" && x.json_roundtrip) S.readers.rust.json_roundtrip_ok++;
  }
  const txSeen = {};
  for (const f of r.flags) {
    S.flag_counts[f.type] = (S.flag_counts[f.type] ?? 0) + 1;
    if (f.tx) { (txSeen[f.type] ??= new Set()).add(f.tx); }
    if (DETAIL_TYPES.includes(f.type)) { S.details.push(f); continue; }
    const a = (S.arms[f.arm ?? f.shape] ??= { class: f.type, txs: 0, caps: f.caps, examples: [] });
    a.txs++;
    if (a.examples.length < EX) a.examples.push({ tx: f.tx, ledger: f.ledger, segments: f.segments });
  }
  for (const [t, s] of Object.entries(txSeen)) S.flagged_txs[t] = (S.flagged_txs[t] ?? 0) + s.size;
}
export function mergeSummary(S, o) {
  for (const k of ["ledgers", "txs", "segments", "ms"]) S[k] += o[k];
  for (const k of ["ledger_min", "close_time_min"]) if (o[k] != null) S[k] = Math.min(S[k] ?? o[k], o[k]);
  for (const k of ["ledger_max", "close_time_max"]) if (o[k] != null) S[k] = Math.max(S[k] ?? o[k], o[k]);
  for (const [p, n] of Object.entries(o.protocol)) S.protocol[p] = (S.protocol[p] ?? 0) + n;
  for (const k of ["js", "go", "rust"]) for (const [m, n] of Object.entries(o.readers[k])) S.readers[k][m] += n;
  for (const [t, n] of Object.entries(o.flag_counts)) S.flag_counts[t] = (S.flag_counts[t] ?? 0) + n;
  for (const [t, n] of Object.entries(o.flagged_txs)) S.flagged_txs[t] = (S.flagged_txs[t] ?? 0) + n;
  S.details.push(...o.details);
  if (o.missing?.length) (S.missing ??= []).push(...o.missing);
  for (const [k, a] of Object.entries(o.arms)) {
    const m = (S.arms[k] ??= { class: a.class, txs: 0, caps: a.caps, examples: [] });
    m.txs += a.txs; for (const e of a.examples) if (m.examples.length < EX) m.examples.push(e);
  }
}
