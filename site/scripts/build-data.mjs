#!/usr/bin/env node
// Build-time data for the status site. Every number is read from files in this
// repo (reports/) or from the live checker's state directory; nothing is typed in.
//
//   node scripts/build-data.mjs            write data/static.json, refresh public/status.json
//                                           from the local checker if it exists
//   node scripts/build-data.mjs --check    fail if data/static.json is stale (CI)
//
// public/status.json is the bundled fallback snapshot. The live site fetches
// NEXT_PUBLIC_STATUS_URL first and falls back to this file.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { buildStatus, readFindings } from "../../tools/status/status.mjs";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(SITE, "..");
const J = (p) => JSON.parse(readFileSync(join(REPO, p), "utf8"));
const CHECK = process.argv.includes("--check");
const sdk = createRequire(join(REPO, "package.json"))("@stellar/stellar-sdk");

// ---- frequency baseline: pubnet samples merged (same rule as tools/frequency/report.mjs)
const freq = J("reports/raw/frequency.json");
const pubs = freq.samples.filter((s) => s.net === "pubnet");
const P = { ledgers: 0, txs: 0, arms: {} };
for (const s of pubs) {
  P.ledgers += s.totals.ledgers; P.txs += s.totals.txs;
  for (const [k, v] of Object.entries(s.arms)) {
    const a = (P.arms[k] ??= { occ: 0, txs: 0, ledgers: 0 });
    a.occ += v.occ; a.txs += v.txs; a.ledgers += v.ledgers;
  }
}
const samples = freq.samples.map((s) => ({ name: s.name, net: s.net, description: s.description, ledgers: s.totals.ledgers, txs: s.totals.txs,
  soroban_txs: s.totals.soroban_txs, ledger_min: s.totals.ledger_min, ledger_max: s.totals.ledger_max, close_time_min: s.totals.close_time_min, close_time_max: s.totals.close_time_max }));
const testnet = freq.samples.find((s) => s.net === "testnet");
const shapeTx = (k) => pubs.reduce((n, s) => n + (s.shapes?.[k]?.txs ?? 0), 0);

// ---- coverage universe (reports/raw/coverage.json) classified by the baseline
const cov = J("reports/raw/coverage.json");
const types = cov.unions.map((u) => ({
  type: u.type,
  arms: u.arms.map((a) => {
    const b = P.arms[`${u.type}.${a.arm}`];
    let cls;
    if (!b || b.occ === 0) cls = "never";
    else if (b.txs === 0) cls = "ledger";
    else if ((b.txs * 1e6) / P.txs < 100) cls = "tail";
    else cls = "frequent";
    return { arm: a.arm, cls, txs: b?.txs ?? 0, entry: (a.entry ?? []).length, ledger: a.ledger ?? 0, tn: testnet?.arms[`${u.type}.${a.arm}`]?.txs ?? 0 };
  }),
}));
const all = types.flatMap((t) => t.arms);
const n = (f) => all.filter(f).length;
const coverage = {
  universe: all.length, types: types.length,
  seen: n((a) => a.cls !== "never"), never: n((a) => a.cls === "never"),
  frequent: n((a) => a.cls === "frequent"), tail: n((a) => a.cls === "tail"), ledger_only: n((a) => a.cls === "ledger"),
  corpus_entry_scope: cov.summary.unions.entry_scope_arms, corpus_ledger_scope: cov.summary.unions.ledger_scope_arms,
  corpus_entries: cov.summary.entries, tail_in_corpus: n((a) => a.cls === "tail" && a.entry > 0),
  seen_in_corpus: n((a) => a.cls !== "never" && a.entry > 0),
};
if (coverage.universe !== cov.summary.unions.arms) throw new Error("arm universe mismatch");

// ---- 50,000-ledger backfill (reports/livecheck/backfill.json)
const bf = J("reports/livecheck/backfill.json").summary;
const armList = (cls) => Object.entries(bf.arms).filter(([, v]) => v.class === cls)
  .map(([k, v]) => ({ name: k, txs: v.txs, caps: v.caps ?? [], examples: (v.examples ?? []).map((e) => ({ tx: e.tx, ledger: e.ledger })) }))
  .sort((a, b) => b.txs - a.txs || a.name.localeCompare(b.name));
const backfill = {
  ledgers: bf.ledgers, txs: bf.txs, segments: bf.segments, ledger_min: bf.ledger_min, ledger_max: bf.ledger_max,
  close_time_min: bf.close_time_min, close_time_max: bf.close_time_max, protocol: bf.protocol, readers: bf.readers,
  worker_hours: +(bf.ms / 3.6e6).toFixed(2),
  flags: Object.fromEntries(["disagreement", "decode_failure", "roundtrip_mismatch", "js_precision", "first_seen", "bug_shape", "long_tail", "shape_first_seen"].map((k) => [k, bf.flag_counts[k] ?? 0])),
  flagged_txs: bf.flagged_txs, bug_shapes: armList("bug_shape"), long_tail: armList("long_tail"),
};

// ---- wallet-backend #731 shape replayed against real mainnet ledgers (reports/raw/replay-mainnet.json)
const rep = J("reports/raw/replay-mainnet.json");
const tl = rep.rows.filter((r) => r.Group === "soroban-trustline" && /trustline$/.test(r.Case));
const replay731 = {
  txs: [...new Set(tl.map((r) => r.Tx))].length,
  builds: [...new Set(tl.map((r) => r.Build))].map((b) => {
    const rs = tl.filter((r) => r.Build === b);
    return { build: b, commit: rs[0].Commit, pass: rs.filter((r) => r.Verdict === "pass").length, total: rs.length, verdicts: [...new Set(rs.map((r) => r.Verdict))] };
  }),
};

// ---- hero: one committed live-checker candidate with a muxed ID at or above 2^53 (#1785 shape)
const HERO = "corpus/candidates/livecheck/pubnet-live/bug_shape-muxed.id_ge_2_53-27d285d59b0e.json";
const hc = J(HERO);
let htx = sdk.TransactionBuilder.fromXDR(hc.xdr[0].base64, sdk.Networks.PUBLIC);
const feeBump = !!htx.innerTransaction; if (feeBump) htx = htx.innerTransaction;
const hop = htx.operations[0];
const mux = sdk.MuxedAccount.fromAddress(hop.destination, "0");
const muxId = mux.id(); const asNum = BigInt(Number(muxId));
const hero = {
  file: HERO, tx: hc.tx_hash, ledger: hc.ledger, close: hc.ledger_close_time, detected_at: hc.provenance.detected_at, source_url: hc.provenance.source_url,
  base64: hc.xdr[0].base64, segment: hc.xdr[0].segment, sha256: hc.xdr[0].sha256, envType: sdk.xdr.TransactionEnvelope.fromXDR(hc.xdr[0].base64, "base64").type,
  op: hop.type, amount: hop.amount, asset: hop.asset.isNative() ? "XLM" : hop.asset.getCode(), destination: hop.destination, base: mux.baseAccount().accountId(),
  muxedId: muxId, asNumber: asNum.toString(), drift: (BigInt(muxId) - asNum).toString(), arm: "MuxedAccount.muxed_ed25519", cap: "CAP-0027",
  seenTxs: P.arms["MuxedAccount.muxed_ed25519"]?.txs ?? 0, caps: hc.caps, shape: hc.flags[0].shape,
};
// ---- #1785 repro verdicts (reports/divergence-matrix.md)
const dm = readFileSync(join(REPO, "reports/divergence-matrix.md"), "utf8");
const m1785 = dm.match(/js-stellar-sdk#1785 \| `[^`]+` \| ([^|]+) \| ([^|]+) \|/);
const repro1785 = m1785 ? { before: m1785[1].trim(), after: m1785[2].trim() } : null;
const ex731 = backfill.bug_shapes.find((b) => b.name.includes("#731"))?.examples[0] ?? null;

const data = {
  sources: ["reports/raw/frequency.json", "reports/raw/coverage.json", "reports/livecheck/backfill.json", "reports/raw/replay-mainnet.json", "reports/divergence-matrix.md", HERO],
  xdr: freq.xdr, baseline: { ledgers: P.ledgers, txs: P.txs, samples },
  baseline_shapes: { muxed_ge_2_53: shapeTx("muxed.id_ge_2^53 (JS-unsafe, #1785 shape)"), creates_trustline_731: shapeTx("soroban.creates_trustline (#731 shape)") },
  coverage, types, enum_arms: Object.fromEntries(cov.enums.map((e) => [e.type, e.arms.map((a) => a.arm)])), backfill, replay731, hero, repro1785, ex731,
  // per-arm transaction counts for every arm that occurred (first-sighting siblings)
  baseline_arms: Object.fromEntries(Object.entries(P.arms).filter(([, v]) => v.txs > 0).map(([k, v]) => [k, v.txs]).sort()),
  testnet_arms: Object.fromEntries(Object.entries(testnet?.arms ?? {}).filter(([, v]) => v.txs > 0).map(([k, v]) => [k, v.txs]).sort()),
};
const body = JSON.stringify(data) + "\n";
const out = join(SITE, "data/static.json");
if (CHECK) {
  if (!existsSync(out) || readFileSync(out, "utf8") !== body) { console.error("site/data/static.json is stale: run `npm run data` in site/"); process.exit(1); }
  console.log("site/data/static.json is fresh");
  process.exit(0);
}
writeFileSync(out, body);
console.log(`static.json: ${coverage.universe} arms (${coverage.seen} seen, ${coverage.never} never, ${coverage.tail} long-tail), backfill ${backfill.ledgers} ledgers / ${backfill.txs} txs`);

// ---- bundled live snapshot (fallback when the public status URL is unreachable)
const LIVE = process.env.XCK_LIVE_DIR ?? join(homedir(), ".local/share/xck-livecheck/pubnet");
if (existsSync(join(LIVE, "state.json"))) {
  const status = buildStatus(JSON.parse(readFileSync(join(LIVE, "state.json"), "utf8")), readFindings(join(LIVE, "findings.jsonl")));
  writeFileSync(join(SITE, "public/status.json"), JSON.stringify(status, null, 1) + "\n");
  console.log(`status.json: cursor ${status.checker.cursor}, ${status.checker.txs} txs (bundled snapshot)`);
} else console.log(`no checker state at ${LIVE}; keeping the committed public/status.json`);
