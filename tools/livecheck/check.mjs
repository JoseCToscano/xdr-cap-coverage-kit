// One-ledger differential check: JS (js-stellar-sdk), Go (go-stellar-sdk) and
// Rust (rs-stellar-xdr) each decode the same LedgerCloseMeta and project it to
// canonical tokens (canon.mjs, go/main.go). Per transaction it flags
//   decode_failure       a reader cannot decode (ledger, then per-tx slice)
//   disagreement         readers' tokens differ for a segment (first diff + odd reader)
//   roundtrip_mismatch   decode -> encode is not byte-identical (Rust also SEP-51 JSON -> XDR)
//   js_precision         a 64-bit value >= 2^53 surfaces as a JS number in the SDK's
//                        high-level objects (TransactionBuilder.fromXDR, humanizeEvents)
//   first_seen / long_tail  arms absent from / rarer than 100 per million txs in the baseline
//   bug_shape            a shape behind a reproduced bug (tools/frequency/shapes.mjs names with "#")
//   shape_first_seen     a corpus / bug shape with no transaction in the baseline
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import * as sdk from "@stellar/stellar-sdk";
import { jsProject, rustProject, buildTables, segHash } from "./canon.mjs";
import { Reader, GO_BIN, RUST_BIN } from "./readers.mjs";
import { detect } from "../frequency/shapes.mjs";
import { lcmSchema } from "../xdr-walk.mjs";

const { xdr, TransactionBuilder, humanizeEvents } = sdk;
const HERE = new URL(".", import.meta.url).pathname;
export const ROOT = resolve(HERE, "../..");
export const NETWORKS = {
  pubnet: { passphrase: "Public Global Stellar Network ; September 2015",
    archive: "https://aws-public-blockchain.s3.us-east-2.amazonaws.com/v1.1/stellar/ledgers/pubnet" },
  testnet: { passphrase: "Test SDF Network ; September 2015",
    archive: "https://aws-public-blockchain.s3.us-east-2.amazonaws.com/v1.1/stellar/ledgers/testnet/2025-12-18" },
};
export const CHECKER_VERSION = "livecheck/0.1";

// Baseline: union-arm frequencies from the real-network study (reports/raw/frequency.json).
export function loadBaseline(path = join(ROOT, "reports/raw/frequency.json")) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const arms = new Map(), shapes = new Map(); let txs = 0; const ranges = [];
  for (const s of raw.samples.filter((x) => x.net === "pubnet")) {
    txs += s.totals.txs; ranges.push(...s.ranges);
    for (const [k, v] of Object.entries(s.arms)) {
      const a = arms.get(k) ?? { occ: 0, txs: 0 }; a.occ += v.occ; a.txs += v.txs; arms.set(k, a);
    }
    for (const [k, v] of Object.entries(s.shapes ?? {})) shapes.set(k, (shapes.get(k) ?? 0) + v.txs);
  }
  return { arms, shapes, txs, ranges, source: "reports/raw/frequency.json" };
}
export function armClass(baseline, key, extraSeen) {
  const b = baseline.arms.get(key);
  if (!b || b.occ === 0) return extraSeen?.has(key) ? "seen_live" : "first_seen";
  if (b.txs > 0 && (b.txs * 1e6) / baseline.txs < 100) return "long_tail";
  return null;
}

// CAP tags inferred from the arms a transaction touches (heuristic; marked as such).
const CAP_RULES = [
  [/^MuxedAccount\.muxed_ed25519/, "CAP-0027"],
  [/^Preconditions\.v2/, "CAP-0021"],
  [/ClaimableBalance|Claimant|claimable_balance/, "CAP-0023"],
  [/[Ss]ponsor/, "CAP-0033"],
  [/[Cc]lawback/, "CAP-0035"],
  [/LiquidityPool|liquidity_pool|pool_share/, "CAP-0038"],
  [/^SignerKey\.ed25519_signed_payload/, "CAP-0040"],
  [/^(ScVal|HostFunction|SorobanAuthorized|SorobanCredentials|SorobanTransactionData|InvokeHostFunction|ContractExecutable|ContractIdPreimage|LedgerKey\.contract|ExtendFootprint|RestoreFootprint)/, "CAP-0046"],
  [/^ScAddress\.(muxed_account|claimable_balance|liquidity_pool)|^TransactionMeta\.v4|^ContractEventType/, "CAP-0067"],
  [/^ScAddress\.muxed_contract/, "CAP-0084"],
  [/^StellarValueType\..*_ms|TimePointMs/, "CAP-0088"],
];
const SHAPE_CAPS = [[/^muxed\./, "CAP-0027"], [/^p_signer\./, "CAP-0040"], [/^precond\.|^maxlen\.extra_signers/, "CAP-0021"],
  [/^auth\.|^soroban\.|^scmap\./, "CAP-0046"], [/^sac\./, "CAP-0073"], [/^pool\./, "CAP-0038"], [/^cap67\.|^event\.topic_is_M/, "CAP-0067"]];
export const shapeCaps = (sh) => SHAPE_CAPS.filter(([re]) => re.test(sh)).map(([, c]) => c);
export function capsFor(arms) {
  const caps = new Set();
  for (const a of arms) for (const [re, c] of CAP_RULES) if (re.test(a)) caps.add(c);
  return [...caps].sort();
}

const TWO53 = 2 ** 53;
export function scanNumbers(obj, path, out, depth = 0, seen = new Set()) {
  if (obj === null || obj === undefined || depth > 8) return;
  if (typeof obj === "number") { if (Number.isFinite(obj) && Math.abs(obj) >= TWO53) out.push({ path, value: obj }); return; }
  if (typeof obj !== "object" || seen.has(obj)) return;
  if (obj instanceof Uint8Array) return;
  seen.add(obj);
  if (obj.constructor && obj.constructor.schema) return; // raw xdr values carry bigint, not number
  for (const k of Object.keys(obj)) scanNumbers(obj[k], `${path}.${k}`, out, depth + 1, seen);
}
export function jsPrecision(kind, plain, passphrase) {
  const out = [];
  try {
    if (kind === "E") {
      const env = xdr.TransactionEnvelope.fromXdrObject(plain);
      const tx = TransactionBuilder.fromXDR(env, passphrase);
      scanNumbers(tx, "TransactionBuilder.fromXDR()", out);
      if (tx.innerTransaction) scanNumbers(tx.innerTransaction, "FeeBumpTransaction.innerTransaction", out);
    } else {
      const meta = plain.txApplyProcessing;
      const evs = meta?.v4 ? [...(meta.v4.events ?? []).map((e) => e.event), ...meta.v4.operations.flatMap((o) => o.events)] : meta?.v3?.sorobanMeta?.events ?? [];
      if (evs.length) scanNumbers(humanizeEvents(evs.map((e) => xdr.ContractEvent.fromXdrObject(e))), "humanizeEvents()", out);
    }
  } catch (e) { out.push({ path: kind === "E" ? "TransactionBuilder.fromXDR()" : "humanizeEvents()", error: e.message.slice(0, 200) }); }
  return out;
}

export async function createChecker({ net = "pubnet", baseline = loadBaseline(), liveSeen = new Set() } = {}) {
  const s = lcmSchema();
  const defs = { ...s.definitions, LedgerCloseMeta: { oneOf: s.oneOf } };
  const { tables, problems } = buildTables(defs);
  if (problems.length) throw new Error(`arm tables: ${problems.join("; ")}`);
  const go = new Reader("go", GO_BIN), rs = new Reader("rust", RUST_BIN);
  const passphrase = NETWORKS[net].passphrase;
  const LCM = xdr.LedgerCloseMeta.schema;

  // Decode a single component with each reader (localizing a ledger-level decode failure).
  async function single(type, bytes) {
    const r = {};
    try { const v = xdr[type].schema.decode(bytes); r.js = segHash(jsProject(xdr[type].schema, v).segs.flatMap((x) => x.toks)); } catch (e) { r.js_err = e.message; }
    const g = await go.request({ seq: 0, passphrase, single: type }, bytes).catch((e) => ({ ok: false, err: e.message }));
    if (!g.ok) r.go_err = g.err;
    const rr = await rs.request({ seq: 0, single: type }, bytes).catch((e) => ({ ok: false, err: e.message }));
    if (!rr.ok) r.rust_err = rr.err;
    return r;
  }

  // opts.inject (tests only): { reader: "js"|"rust", segment, index, token } overwrites one token.
  async function check(seq, lcm, opts = {}) {
    const t0 = Date.now();
    const pg = go.request({ seq, passphrase }, lcm).catch((e) => ({ ok: false, err: e.message }));
    const pr = rs.request({ seq }, lcm).catch((e) => ({ ok: false, err: e.message }));
    const res = { seq, net, ms: 0, txs: 0, segments: 0, readers: {}, flags: [], close_time: null, protocol: null };
    let J = null, plain = null;
    try {
      plain = LCM.decode(lcm);
      res.readers.js = { ok: true, roundtrip: Buffer.compare(Buffer.from(LCM.encode(plain)), lcm) === 0 };
      J = jsProject(LCM, plain);
    } catch (e) { res.readers.js = { ok: false, err: e.message.slice(0, 300) }; }
    const g = await pg, r = await pr;
    res.readers.go = { ok: g.ok, roundtrip: g.roundtrip, err: g.err };
    res.readers.rust = { ok: r.ok, roundtrip: r.roundtrip, json_roundtrip: r.json_roundtrip, err: r.err };
    let R = null;
    if (r.ok) { try { R = rustProject(defs, tables, r.json, { arms: true }); } catch (e) { res.readers.rust = { ok: false, err: "projection: " + e.message.slice(0, 300) }; } }
    const lv = r.json?.v2 ?? r.json?.v1 ?? r.json?.v0;
    if (lv) { res.close_time = Number(lv.ledger_header.header.scp_value.close_time); res.protocol = lv.ledger_header.header.ledger_version; }

    for (const [k, P] of [["js", J], ["rust", R]]) {
      const inj = opts.inject; if (!inj || inj.reader !== k || !P) continue;
      const sg = P.segs.find((x) => x.name === inj.segment); if (sg) sg.toks[inj.index] = inj.token;
    }
    // Segment hashes per reader.
    const H = { js: {}, go: {}, rust: {} };
    if (J) for (const sg of J.segs) H.js[sg.name] = segHash(sg.toks);
    if (R) for (const sg of R.segs) H.rust[sg.name] = segHash(sg.toks);
    if (g.ok) { H.go.L = g.L; (g.env ?? []).forEach((h, i) => (H.go["E" + i] = h)); (g.proc ?? []).forEach((h, i) => (H.go["P" + i] = h)); }
    const txOf = {};
    (g.env_hash ?? []).forEach((h, i) => (txOf["E" + i] = h));
    (g.proc_hash ?? []).forEach((h, i) => (txOf["P" + i] = h));
    if (!g.ok && lv) { // fall back to Rust for tx hashes of result metas
      lv.tx_processing.forEach((p, i) => (txOf["P" + i] = p.result.transaction_hash));
    }
    const names = new Set([...Object.keys(H.js), ...Object.keys(H.go), ...Object.keys(H.rust)]);
    res.segments = names.size;
    res.txs = Object.keys(txOf).filter((k) => k[0] === "P").length || (lv?.tx_processing.length ?? 0);
    const okReaders = ["js", "go", "rust"].filter((k) => res.readers[k].ok);
    const flag = (f) => res.flags.push(f);

    // (a) decode failures, localized per component.
    for (const k of ["js", "go", "rust"]) {
      if (res.readers[k].ok) continue;
      const f = { type: "decode_failure", reader: k, ledger: seq, err: res.readers[k].err, components: [] };
      if (g.ok) {
        const want = [...Object.keys(txOf)];
        const sl = await go.request({ seq, passphrase, slices: want }, lcm);
        for (const n of want) {
          const b = Buffer.from(sl.slices[n], "base64");
          const one = await single(n[0] === "E" ? "TransactionEnvelope" : "TransactionResultMetaV1", b);
          if (one[`${k}_err`]) f.components.push({ segment: n, tx: txOf[n], err: one[`${k}_err`].slice(0, 200) });
        }
      }
      flag(f);
    }
    // (c) round-trip
    for (const k of okReaders) {
      if (res.readers[k].roundtrip === false) flag({ type: "roundtrip_mismatch", reader: k, ledger: seq, what: "xdr->xdr" });
      if (k === "rust" && res.readers.rust.json_roundtrip === false) flag({ type: "roundtrip_mismatch", reader: "rust", ledger: seq, what: "sep51-json->xdr" });
    }
    // (b) disagreements
    const bad = [];
    for (const n of names) {
      const hs = okReaders.map((k) => H[k][n]);
      if (new Set(hs).size > 1) bad.push(n);
    }
    if (bad.length) {
      const dumpNames = bad.slice(0, 25);
      const gd = g.ok ? await go.request({ seq, passphrase, dump: dumpNames }, lcm) : { dump: {} };
      const RP = R ? rustProject(defs, tables, r.json, { paths: true }) : null;
      if (RP && opts.inject?.reader === "rust") { const sg = RP.segs.find((x) => x.name === opts.inject.segment); if (sg) sg.toks[opts.inject.index] = opts.inject.token; }
      for (const n of dumpNames) {
        const toks = { js: J?.segs.find((x) => x.name === n)?.toks, go: gd.dump?.[n], rust: RP?.segs.find((x) => x.name === n)?.toks };
        const paths = RP?.segs.find((x) => x.name === n)?.paths ?? [];
        const len = Math.max(...okReaders.map((k) => toks[k]?.length ?? 0));
        let i = 0;
        for (; i < len; i++) if (new Set(okReaders.map((k) => toks[k]?.[i])).size > 1) break;
        const at = Object.fromEntries(okReaders.map((k) => [k, toks[k]?.[i] ?? null]));
        const vals = Object.values(at); const odd = okReaders.filter((k) => vals.filter((v) => v === at[k]).length === 1);
        flag({ type: "disagreement", segment: n, tx: txOf[n] ?? null, ledger: seq, token_index: i, at, odd_reader: odd.length === 1 ? odd[0] : null,
          path: paths[i] ?? null, context: Object.fromEntries(okReaders.map((k) => [k, toks[k]?.slice(Math.max(0, i - 4), i + 3)])) });
      }
      if (bad.length > dumpNames.length) flag({ type: "disagreement_overflow", ledger: seq, more: bad.length - dumpNames.length });
    }
    // (d) JS precision hazards, only where a 64-bit value >= 2^53 occurs.
    if (J) for (const sg of J.segs) {
      if (!sg.big || sg.name === "L") continue;
      const v = J.vals[sg.name[0]][Number(sg.name.slice(1))];
      const hz = jsPrecision(sg.name[0], v, passphrase);
      if (hz.length) flag({ type: "js_precision", segment: sg.name, tx: txOf[sg.name] ?? null, ledger: seq, hazards: hz.slice(0, 10) });
    }
    // (e) first-seen / long-tail arms per transaction.
    if (R) {
      const byTx = new Map();
      for (const sg of R.segs) { if (sg.name === "L") continue; const tx = txOf[sg.name]; if (!tx) continue; const e = byTx.get(tx) ?? { arms: new Set(), segs: [] }; sg.arms.forEach((a) => e.arms.add(a)); e.segs.push(sg.name); byTx.set(tx, e); }
      res.txArms = byTx;
      for (const [tx, e] of byTx) {
        const rare = [];
        for (const a of e.arms) { const c = armClass(baseline, a, liveSeen); if (c === "first_seen" || c === "long_tail") rare.push([c, a]); }
        for (const [c, a] of rare) flag({ type: c, arm: a, tx, ledger: seq, segments: e.segs });
      }
    }
    // Corpus / bug shapes per transaction (same detectors as the frequency study).
    if (R && lv) {
      const envBy = new Map(R.envs.map((e, i) => [txOf["E" + i], e]));
      const noop = () => {};
      lv.tx_processing.forEach((meta, j) => {
        const tx = meta.result.transaction_hash, env = envBy.get(tx);
        if (!env) return;
        const found = new Set();
        try { detect(env, meta, { rec: (shape) => found.add(shape), hist: noop, max: noop }); } catch (e) { found.add(`detector_error: ${e.message.slice(0, 80)}`); }
        for (const sh of found) {
          const segs = Object.entries(txOf).filter(([, h]) => h === tx).map(([k]) => k);
          if (sh.includes("#")) flag({ type: "bug_shape", shape: sh, tx, ledger: seq, segments: segs });
          else if (baseline.shapes && !baseline.shapes.get(sh)) flag({ type: "shape_first_seen", shape: sh, tx, ledger: seq, segments: segs });
        }
      });
    }
    // CAP tags for every tx-level flag.
    for (const f of res.flags) {
      const arms = f.tx && res.txArms?.get(f.tx)?.arms;
      f.caps = arms ? capsFor(f.arm ? [f.arm] : [...arms]) : [];
      if (f.shape) f.caps = [...new Set([...f.caps, ...shapeCaps(f.shape)])].sort();
      if (f.type === "disagreement" && f.path && arms) f.caps = capsFor([...arms].filter((a) => f.path.includes(a.split(".")[1]))).concat(f.caps).filter((x, i, a) => a.indexOf(x) === i);
    }
    res.segOf = Object.fromEntries(Object.entries(txOf));
    res.ms = Date.now() - t0;
    return res;
  }

  async function slices(seq, lcm, names) {
    const sl = await go.request({ seq, passphrase, slices: names }, lcm);
    return sl.slices ?? {};
  }
  return { check, slices, close: () => { go.close(); rs.close(); }, tables, defs };
}
