#!/usr/bin/env node
// Builds a small public status.json from the live checker's state.json and
// findings.jsonl. Read-only on the checker directory; every number comes from
// those two files (plus, with --tip, the network tip from a Horizon server).
//
//   node tools/status/status.mjs [--dir <live dir>] [--out <file>] [--tip [url]]
//   node tools/status/status.mjs --watch 60 --out /srv/status/status.json --tip
//
// Defaults: --dir $XCK_LIVE_DIR or ~/.local/share/xck-livecheck/pubnet,
// --out stdout. --watch <s> rewrites the file every <s> seconds (atomic rename).
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

const argv = process.argv.slice(2);
const has = (k) => argv.includes(k);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const NET = arg("--net", "pubnet");
const DIR = arg("--dir", process.env.XCK_LIVE_DIR ?? join(homedir(), ".local/share/xck-livecheck", NET));
const OUT = arg("--out", null);
const TIP = has("--tip") ? arg("--tip", process.env.XCK_HORIZON_URL ?? (NET === "pubnet" ? "https://horizon.stellar.org/" : "https://horizon-testnet.stellar.org/")) : null;
const WATCH = Number(arg("--watch", 0));
const RECENT = Number(arg("--recent", 25));

export const READERS = {
  js: { name: "JS", lib: "js-stellar-sdk 17.4.0" },
  go: { name: "Go", lib: "go-stellar-sdk 0.9.0" },
  rust: { name: "Rust", lib: "rs-stellar-xdr 30.0.0" },
};
const READER_FLAGS = ["disagreement", "decode_failure", "roundtrip_mismatch", "js_precision"];

export function readFindings(path) {
  if (!existsSync(path)) return [];
  const out = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* a half-written last line while the follower appends */ }
  }
  return out;
}

const slim = (f) => ({ type: f.type, arm: f.arm, shape: f.shape, tx: f.tx, ledger: f.ledger, close_time: f.close_time, detected_at: f.ts, caps: f.caps ?? [], source: f.source });

export function buildStatus(state, findings, tip = null) {
  const s = state.summary;
  const flags = Object.fromEntries([...READER_FLAGS, "first_seen", "bug_shape", "long_tail", "shape_first_seen"].map((k) => [k, s.flag_counts?.[k] ?? 0]));
  const flaggedTxs = Object.fromEntries(Object.keys(flags).map((k) => [k, s.flagged_txs?.[k] ?? 0]));
  const byShape = {};
  for (const f of findings.filter((f) => f.type === "bug_shape")) (byShape[f.shape] ??= []).push(f);
  const longTail = Object.entries(s.arms ?? {}).filter(([, v]) => v.class === "long_tail")
    .map(([arm, v]) => ({ arm, txs: v.txs, caps: v.caps ?? [], example: v.examples?.[0] ? { tx: v.examples[0].tx, ledger: v.examples[0].ledger } : null }))
    .sort((a, b) => b.txs - a.txs || a.arm.localeCompare(b.arm));
  // the checker's own lag measurement (cursor vs network tip, rate, ETA) and host-pause record
  const own = {};
  if (state.lag) own.lag = state.lag;
  if (state.host_pauses) own.host_pauses = state.host_pauses;
  const last = state.last ?? null;
  let network = null;
  if (tip) {
    network = { source: tip.source, ledger: tip.ledger, closed_at: tip.closed_at, fetched_at: tip.fetched_at };
    if (last?.close_time) {
      const tipT = Date.parse(tip.closed_at) / 1000;
      network.lag_ledgers = tip.ledger - state.cursor;
      network.lag_seconds = Math.max(0, Math.round(tipT - last.close_time));
    }
  }
  return {
    schema: 1,
    generated_at: new Date().toISOString(),
    net: state.net,
    readers: Object.fromEntries(Object.entries(READERS).map(([k, r]) => [k, { ...r, ledgers_ok: s.readers?.[k]?.ok ?? 0, roundtrip_ok: s.readers?.[k]?.roundtrip_ok ?? 0, ...(k === "rust" ? { json_roundtrip_ok: s.readers?.rust?.json_roundtrip_ok ?? 0 } : {}) }])),
    checker: {
      started_at: state.started_at, updated_at: state.updated_at, restarts: state.restarts ?? 0,
      first: state.first, cursor: state.cursor,
      last_ledger: last ? { seq: last.seq, close_time: last.close_time, source: last.source, txs: last.txs } : null,
      ledgers: s.ledgers, txs: s.txs, segments: s.segments, worker_hours: +((s.ms ?? 0) / 3.6e6).toFixed(2),
      close_time_min: s.close_time_min, close_time_max: s.close_time_max, protocol: s.protocol ?? {},
      ...own,
    },
    network,
    flags, flagged_txs: flaggedTxs,
    first_seen: findings.filter((f) => f.type === "first_seen").map(slim),
    reader_findings: findings.filter((f) => READER_FLAGS.includes(f.type)).slice(-RECENT).map(slim),
    bug_shapes: Object.entries(byShape).map(([shape, fs]) => ({ shape, txs: fs.length, caps: fs[0].caps ?? [], recent: fs.slice(-RECENT).reverse().map(slim) })),
    long_tail: { arms: longTail.length, flags: flags.long_tail, txs: flaggedTxs.long_tail, top: longTail },
  };
}

async function fetchTip(url) {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10000) });
    const j = await r.json();
    return { source: new URL(url).host, ledger: j.history_latest_ledger, closed_at: j.history_latest_ledger_closed_at, fetched_at: new Date().toISOString() };
  } catch (e) { process.stderr.write(`tip fetch failed: ${e.message}\n`); return null; }
}

async function once() {
  const state = JSON.parse(readFileSync(join(DIR, "state.json"), "utf8"));
  const findings = readFindings(join(DIR, "findings.jsonl"));
  const status = buildStatus(state, findings, TIP ? await fetchTip(TIP) : null);
  const body = JSON.stringify(status, null, 1) + "\n";
  if (!OUT) { process.stdout.write(body); return; }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT + ".tmp", body); renameSync(OUT + ".tmp", OUT);
  process.stderr.write(`${status.generated_at} wrote ${OUT}: cursor ${status.checker.cursor}, ${status.checker.txs} txs${status.network ? `, lag ${status.network.lag_ledgers} ledgers` : ""}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await once();
  if (WATCH > 0) setInterval(() => once().catch((e) => process.stderr.write(`status: ${e.message}\n`)), WATCH * 1000);
}
