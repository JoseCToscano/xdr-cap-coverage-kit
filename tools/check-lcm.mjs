// Golden checks for the corpus LedgerCloseMeta files. Each entry with a
// ledger is compared against two independent references, offline, from files
// committed in this repo:
//
//   core  stellar-core's own LedgerCloseMeta test goldens for the same protocol
//         (src/testdata/ledger-close-meta-v2-protocol-<P>[-soroban].json at a
//         pinned commit, vendored in corpus/goldens/stellar-core). They are
//         synthetic ledgers, so only shape is compared: LCM version, header
//         ledger_version, StellarValueExt arm, CAP-88 floor(close_time_ms/1000) == close_time,
//         TransactionMeta version, LedgerCloseMetaExt arm, LedgerCloseMetaV2 fields.
//   rpc   a second copy of the same ledger from Stellar RPC getLedgers
//         (corpus/datalake/testnet-rpc), compared to the Galexie archive copy
//         byte for byte, then by part: header, tx set, results, events, ledger
//         entry changes (as ordered lists and as multisets), diagnostic events.
//
// Verdicts: agrees | diverges | no_golden.
//
// Usage:
//   node tools/check-lcm.mjs            write reports/lcm-golden.md + reports/raw/lcm-golden.json
//   node tools/check-lcm.mjs --check    fail if those files are stale
//   node tools/check-lcm.mjs --fetch    (network, read-only) vendor the core goldens, store one
//                                       RPC copy per ledger, and record how many distinct byte
//                                       strings RPC returns over 6 requests
// Also run by `node tools/check-corpus.mjs --check-lcm`.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { readLake, readEntryLake, lakeName, rustDecodeLcm, rpc, sha256, writeLake, batchOf } from "./galexie.mjs";
import { evalChecks } from "./lib.mjs";
import { zstdCompressSync } from "node:zlib";

const CORE_COMMIT = "f2b91947fb20fc8174cca38bf320eda7baa3edbb"; // stellar-core master, 2026-11-12
const GOLD = "corpus/goldens/stellar-core";
const SRC = "corpus/datalake/SOURCES.json";
const VAR = "corpus/datalake/rpc-variance.json";
const J = JSON.stringify;
const entries = readdirSync("corpus/entries").filter((f) => f.endsWith(".json")).sort()
  .map((f) => JSON.parse(readFileSync(`corpus/entries/${f}`, "utf8"))).filter((e) => e.ledger);
const protocols = [...new Set(entries.map((e) => e.ledger.protocol_version))].sort();

// --fetch-goldens: vendor only the core goldens that are missing (keeps existing files and RPC copies).
const onlyGoldens = process.argv.includes("--fetch-goldens");
if (process.argv.includes("--fetch") || onlyGoldens) {
  mkdirSync(GOLD, { recursive: true });
  const gs = onlyGoldens && existsSync(`${GOLD}/SOURCES.json`) ? JSON.parse(readFileSync(`${GOLD}/SOURCES.json`)) : {};
  for (const p of protocols) for (const suffix of ["", "-soroban"]) {
    const name = `ledger-close-meta-v2-protocol-${p}${suffix}.json`;
    if (onlyGoldens && gs[name]) continue;
    const url = `https://raw.githubusercontent.com/stellar/stellar-core/${CORE_COMMIT}/src/testdata/${name}`;
    const r = await fetch(url);
    if (!r.ok) { console.log(`${name}: HTTP ${r.status}`); continue; }
    const b = Buffer.from(await r.arrayBuffer());
    writeFileSync(`${GOLD}/${name}`, b);
    gs[name] = { repo: "stellar/stellar-core", commit: CORE_COMMIT, path: `src/testdata/${name}`, url, sha256: sha256(b), fetched_at: new Date().toISOString() };
  }
  writeFileSync(`${GOLD}/SOURCES.json`, J(Object.fromEntries(Object.entries(gs).sort()), null, 2) + "\n");
  if (onlyGoldens) process.exit(0);
  const S = JSON.parse(readFileSync(SRC));
  const variance = {};
  for (const seq of Object.keys(S).filter((k) => S[k].network !== "pubnet").map(Number)) { // testnet RPC only
    const shas = [];
    let first = null, why = "not in retention window";
    for (let i = 0; i < 6; i++) {
      const res = await rpc("getLedgers", { startLedger: seq, pagination: { limit: 1 } }).catch((err) => ((why = `RPC error: ${err.message}`), null));
      const l = res?.ledgers.find((x) => x.sequence === seq);
      if (!l) break;
      const lcm = Buffer.from(l.metadataXdr, "base64");
      first ??= lcm;
      shas.push(sha256(lcm));
    }
    const at = new Date().toISOString();
    if (!first) { delete S[seq].alt; variance[seq] = { fetched_at: at, rpc: why }; continue; }
    writeLake(".", seq, zstdCompressSync(batchOf(seq, first)), "testnet-rpc");
    S[seq].alt = { source: "stellar-rpc-getLedgers", fetched_at: at, file: `corpus/datalake/testnet-rpc/${S[seq].object_key}`,
      sha256_lcm: sha256(first), lcm_bytes: first.length, byte_identical: first.equals(readLake(".", seq).lcm) };
    variance[seq] = { fetched_at: at, requests: shas.length, distinct: new Set(shas).size, archive_sha256_lcm: S[seq].sha256_lcm,
      rpc_sha256_lcm: shas, any_equal_to_archive: shas.includes(S[seq].sha256_lcm) };
    console.log(seq, `rpc: ${new Set(shas).size} distinct of ${shas.length}`);
  }
  writeFileSync(SRC, J(S, null, 2) + "\n");
  writeFileSync(VAR, J({ endpoint: "https://soroban-testnet.stellar.org getLedgers", ledgers: variance }, null, 2) + "\n");
}

// ---- core golden shape --------------------------------------------------
const armOfCore = (v) => v.replace(/^STELLAR_VALUE_/, "").toLowerCase();
function coreShape(g) {
  const v = g.LedgerCloseMeta.v2, h = v.ledgerHeader.header, ext = h.scpValue.ext;
  const snake = (s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  return { lcm_version: `v${g.LedgerCloseMeta.v}`, ledger_version: h.ledgerVersion, stellar_value_ext: armOfCore(ext.v),
    close_time_ms_invariant: ext.signedMsValue ? BigInt(ext.signedMsValue.closeTimeMs) / 1000n === BigInt(h.scpValue.closeTime) : null,
    tx_meta_versions: [...new Set(v.txProcessing.map((t) => `v${t.txApplyProcessing.v}`))].sort(),
    lcm_ext: `v${v.ext.v}`, v2_fields: Object.keys(v).map(snake).sort() };
}
function ourShape(lcm) {
  const ver = Object.keys(lcm)[0], v = lcm[ver], h = v.ledger_header.header, ext = h.scp_value.ext;
  const extArm = typeof ext === "string" ? ext : Object.keys(ext)[0];
  return { lcm_version: ver, ledger_version: h.ledger_version, stellar_value_ext: extArm,
    close_time_ms_invariant: ext.signed_ms ? BigInt(ext.signed_ms.close_time_ms) / 1000n === BigInt(h.scp_value.close_time) : null,
    tx_meta_versions: [...new Set(v.tx_processing.map((t) => Object.keys(t.tx_apply_processing)[0]))].sort(),
    lcm_ext: typeof v.ext === "string" ? v.ext : Object.keys(v.ext)[0], v2_fields: Object.keys(v).sort() };
}

// ---- rpc copy diff ------------------------------------------------------
const ms = (x) => J((x ?? []).map(J).sort());
// Group ledger-entry changes into (state, following non-state) pairs.
const pairs = (cs = []) => { const r = []; for (let i = 0; i < cs.length; i++) { if (cs[i].state && cs[i + 1] && !cs[i + 1].state) { r.push(J([cs[i], cs[i + 1]])); i++; } else r.push(J([cs[i]])); } return J(r.sort()); };
function partsDiff(a, b) {
  const va = a.v2, vb = b.v2, out = new Set();
  for (const k of Object.keys(va)) if (k !== "tx_processing" && J(va[k]) !== J(vb[k])) out.add(k === "ext" ? "LedgerCloseMetaExt arm" : k);
  va.tx_processing.forEach((ta, i) => {
    const tb = vb.tx_processing[i];
    if (!tb) return out.add("tx count");
    if (J(ta.result) !== J(tb.result)) out.add("tx results");
    if (J(ta.fee_processing) !== J(tb.fee_processing)) out.add(ms(ta.fee_processing) === ms(tb.fee_processing) ? "fee changes order" : "fee changes content");
    const x = Object.values(ta.tx_apply_processing)[0], y = Object.values(tb.tx_apply_processing)[0];
    for (const k of Object.keys(x)) {
      if (k === "operations") x.operations.forEach((o, j) => {
        if (J(o.changes) !== J(y.operations[j]?.changes)) out.add(ms(o.changes) !== ms(y.operations[j]?.changes) ? "op ledger-entry changes: content"
          : pairs(o.changes) === pairs(y.operations[j]?.changes) ? "op ledger-entry changes: order only, state/updated pairs intact" : "op ledger-entry changes: order only, pairs split");
        if (J(o.events) !== J(y.operations[j]?.events)) out.add("op contract events");
      });
      else if (J(x[k]) !== J(y[k])) out.add(k === "diagnostic_events" ? "diagnostic events" : k);
    }
  });
  return [...out].sort();
}

const coreGold = {};
for (const f of existsSync(GOLD) ? readdirSync(GOLD).filter((f) => f.startsWith("ledger-close-meta")) : []) coreGold[f] = coreShape(JSON.parse(readFileSync(`${GOLD}/${f}`)));
const S = JSON.parse(readFileSync(SRC));
const variance = existsSync(VAR) ? JSON.parse(readFileSync(VAR)).ledgers : {};
const rows = [];
const cache = new Map();
for (const e of entries) {
  const seq = e.ledger.sequence;
  if (!cache.has(seq)) cache.set(seq, rustDecodeLcm(readEntryLake(".", e).lcm));
  const ours = ourShape(cache.get(seq));
  // core
  const gname = `ledger-close-meta-v2-protocol-${e.ledger.protocol_version}${e.tags?.includes("soroban") || e.caps.some((c) => /CAP-00(46|67|73|84)/.test(c)) ? "-soroban" : ""}.json`;
  const g = coreGold[gname];
  const core = { golden: g ? `${GOLD}/${gname}` : null, fields: {} };
  for (const k of Object.keys(ours)) core.fields[k] = !g ? "no_golden" : J(g[k]) === J(ours[k]) ? "agrees" : "diverges";
  const shapeKeys = Object.keys(ours).filter((k) => k !== "lcm_ext");
  core.verdict = !g ? "no_golden" : shapeKeys.every((k) => core.fields[k] === "agrees") ? "agrees" : "diverges";
  core.differs = !g ? [] : Object.keys(ours).filter((k) => core.fields[k] === "diverges").map((k) => `${k}: ours ${J(ours[k])}, core ${J(g[k])}`);
  // rpc
  const alt = S[seq]?.alt;
  const rpcRow = { file: alt?.file ?? null, variance: variance[seq] ?? null };
  if (!alt || !alt.file || !existsSync(alt.file)) { rpcRow.verdict = "no_golden"; rpcRow.why = variance[seq]?.rpc ?? (lakeName(e.network.passphrase) === "pubnet" ? "mainnet entry: archive copy only, no RPC copy stored" : "no RPC copy stored"); }
  else {
    const rl = readLake(".", seq, "testnet-rpc").lcm;
    const same = rl.equals(readLake(".", seq).lcm);
    const rj = rustDecodeLcm(rl);
    rpcRow.verdict = same ? "agrees" : "diverges";
    rpcRow.parts = same ? [] : partsDiff(cache.get(seq), rj);
    const i = e.ledger.tx_index;
    if (i != null) rpcRow.entry_tx_hash_same = rj.v2.tx_processing[i]?.result.transaction_hash === e.network.expected_tx_hash;
    rpcRow.entry_ledger_checks_hold_on_rpc_copy = evalChecks(e.expected.ledger_checks, rj).every((c) => c.ok);
  }
  rows.push({ entry: e.id, ledger: seq, protocol: e.ledger.protocol_version, our_shape: ours, core, rpc: rpcRow });
}

let md = `# LedgerCloseMeta golden checks\n\n<!-- generated by tools/check-lcm.mjs; do not edit. CI fails if stale. -->\n\n`;
md += `Every corpus entry with a ledger is checked against two references, offline, from files in this repo. Verdicts: **agrees**, **diverges**, **no_golden**.\n\n`;
md += `- **core**: stellar-core's own LedgerCloseMeta test goldens for the same protocol (\`src/testdata/ledger-close-meta-v2-protocol-<P>[-soroban].json\` at stellar-core \`${CORE_COMMIT.slice(0, 8)}\`, vendored in \`${GOLD}\`). They are synthetic ledgers, so only shape is compared: LCM version, header ledger_version, StellarValueExt arm, CAP-88 \`close_time_ms == close_time*1000\`, TransactionMeta version and LedgerCloseMetaV2 field set. The LedgerCloseMetaExt arm is shown but not part of the verdict (it depends on how the producing node is configured).\n`;
md += `- **rpc**: a second copy of the same ledger from Stellar RPC \`getLedgers\` (\`corpus/datalake/testnet-rpc\`), compared with the Galexie archive copy byte for byte; when they differ, the parts that differ are listed.\n\n`;
md += `| Entry | Ledger | P | core | core differences | rpc | rpc: parts that differ | entry tx and ledger checks on rpc copy |\n|---|---|---|---|---|---|---|---|\n`;
for (const r of rows) {
  const rp = r.rpc;
  md += `| \`${r.entry}\` | ${r.ledger} | ${r.protocol} | **${r.core.verdict}** | ${r.core.differs.join("; ") || "none"} | **${rp.verdict}** | ${rp.parts?.join("; ") || rp.why || "none"} | ${rp.verdict === "no_golden" ? "n/a" : `${rp.entry_tx_hash_same === false ? "tx hash differs" : "same tx"}, checks ${rp.entry_ledger_checks_hold_on_rpc_copy ? "hold" : "FAIL"}`} |\n`;
}
const vs = Object.entries(variance).filter(([, v]) => v.requests);
if (vs.length) {
  md += `\n## RPC returns different bytes for the same ledger\n\nRecorded by \`node tools/check-lcm.mjs --fetch\` (\`${VAR}\`): ${vs.length} ledgers, 6 \`getLedgers\` requests each to the public testnet endpoint.\n\n| Ledger | Distinct LCM byte strings | Any equal to the archive copy |\n|---|---|---|\n`;
  for (const [seq, v] of vs) md += `| ${seq} | ${v.distinct} of ${v.requests} | ${v.any_equal_to_archive ? "yes" : "no"} |\n`;
  const all = new Set(rows.flatMap((r) => r.rpc.parts ?? []));
  const same = ["ledger_header", "tx_set", "tx results", "op contract events", "upgrades_processing", "evicted_keys"].filter((k) => !all.has(k));
  md += `\nAcross all stored archive/RPC pairs, the parts that differ are: ${[...all].sort().join("; ")}. Identical in every pair: ${same.join(", ")}. `;
  md += `A consumer that hashes LCM bytes, or depends on change order or diagnostic events, gets different results depending on which copy it read.\n`;
}
const json = J({ core_commit: CORE_COMMIT, rows }, null, 2) + "\n";
if (process.argv.includes("--check")) {
  const same = (p, s) => existsSync(p) && readFileSync(p, "utf8") === s;
  if (!same("reports/lcm-golden.md", md) || !same("reports/raw/lcm-golden.json", json)) { console.error("reports/lcm-golden.md is stale: run node tools/check-lcm.mjs and commit"); process.exit(1); }
  console.log("lcm golden report is fresh");
} else {
  mkdirSync("reports/raw", { recursive: true });
  writeFileSync("reports/lcm-golden.md", md);
  writeFileSync("reports/raw/lcm-golden.json", json);
}
const tally = (k) => rows.reduce((t, r) => ((t[r[k].verdict] = (t[r[k].verdict] ?? 0) + 1), t), {});
console.log(`core: ${J(tally("core"))}  rpc: ${J(tally("rpc"))}`);
if (rows.some((r) => r.rpc.verdict !== "no_golden" && !r.rpc.entry_ledger_checks_hold_on_rpc_copy)) process.exitCode = 1;
