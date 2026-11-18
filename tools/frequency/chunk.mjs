// Processes one chunk of contiguous ledgers for the frequency study and returns
// its accumulator (see acc.mjs). Each ledger: fetch the Galexie object (public
// AWS Open Data archive, cached on disk), hash every envelope (txhash, Go),
// decode with the reference implementation (`stellar xdr decode`), walk the
// whole LedgerCloseMeta with the coverage walker (tools/xdr-walk.mjs) with
// each envelope / result attributed to its transaction hash, and run the
// shape detectors (shapes.mjs) on every transaction.
import { spawn } from "node:child_process";
import { zstdDecompressSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { objectKey, lcmOfBatch } from "../galexie.mjs";
import { walker } from "../xdr-walk.mjs";
import { detect } from "./shapes.mjs";
import { newAcc, Ledger } from "./acc.mjs";

// Runs cmd with `input` on stdin; resolves to stdout (Buffer).
function pipe(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out = [], err = [];
    c.stdout.on("data", (d) => out.push(d)); c.stderr.on("data", (d) => err.push(d));
    c.on("error", reject);
    c.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`${cmd} exit ${code}: ${Buffer.concat(err).toString().slice(0, 300)}`))));
    c.stdin.end(input);
  });
}
export const NETWORKS = {
  pubnet: { passphrase: "Public Global Stellar Network ; September 2015",
    archive: "https://aws-public-blockchain.s3.us-east-2.amazonaws.com/v1.1/stellar/ledgers/pubnet" },
  testnet: { passphrase: "Test SDF Network ; September 2015",
    archive: "https://aws-public-blockchain.s3.us-east-2.amazonaws.com/v1.1/stellar/ledgers/testnet/2025-12-18" },
};
const CACHE = process.env.XCK_LCM_CACHE ?? join(homedir(), ".cache/xck-lcm");
const HERE = new URL(".", import.meta.url).pathname;
export const TXHASH = process.env.XCK_TXHASH ?? join(HERE, ".bin/txhash");

async function fetchObject(net, seq) {
  const key = objectKey(seq), p = join(CACHE, net, key);
  if (existsSync(p)) return readFileSync(p);
  const url = `${NETWORKS[net].archive}/${key}`;
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (r.status !== 200) throw new Error(`HTTP ${r.status} ${url}`);
      const b = Buffer.from(await r.arrayBuffer());
      if (process.env.XCK_LCM_CACHE !== "off") { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p + ".tmp", b); renameSync(p + ".tmp", p); }
      return b;
    } catch (e) { if (i >= 4) throw e; await new Promise((r) => setTimeout(r, 1000 * 2 ** i)); }
  }
}

export async function processChunk(defs, { net, sample, start, count, onShape }) {
  const acc = newAcc();
  const seqs = Array.from({ length: count }, (_, i) => start + i);
  const prefetch = new Map();
  const want = (i) => { if (i < seqs.length && !prefetch.has(i)) prefetch.set(i, fetchObject(net, seqs[i])); };
  const AHEAD = Number(process.env.XCK_PREFETCH ?? 24);
  for (let i = 0; i < AHEAD; i++) want(i);
  for (let i = 0; i < seqs.length; i++) {
    want(i + AHEAD);
    const seq = seqs[i];
    const compressed = await prefetch.get(i); prefetch.delete(i);
    const lcm = lcmOfBatch(zstdDecompressSync(compressed));
    const [h, d] = await Promise.all([
      pipe(TXHASH, [NETWORKS[net].passphrase], lcm),
      pipe("stellar", ["xdr", "decode", "--type", "LedgerCloseMeta", "--input", "single", "--output", "json"], lcm),
    ]);
    const hashes = JSON.parse(h.toString());
    const json = JSON.parse(d.toString());
    processLedger(defs, acc, seq, json, hashes, onShape);
  }
  return acc;
}

export function processLedger(defs, acc, seq, json, hashes, onShape) {
  const L = new Ledger(acc, seq);
  const lv = json.v2 ?? json.v1 ?? json.v0;
  const header = lv.ledger_header.header;
  acc.totals.ledgers++;
  acc.hist.protocol ??= {}; acc.hist.protocol[header.ledger_version] = (acc.hist.protocol[header.ledger_version] ?? 0) + 1;
  acc.hist.lcm_version ??= {}; const lk = Object.keys(json)[0]; acc.hist.lcm_version[lk] = (acc.hist.lcm_version[lk] ?? 0) + 1;
  const ct = Number(header.scp_value.close_time);
  acc.totals.close_time_min = Math.min(acc.totals.close_time_min ?? ct, ct);
  acc.totals.close_time_max = Math.max(acc.totals.close_time_max ?? ct, ct);
  acc.totals.ledger_min = Math.min(acc.totals.ledger_min ?? seq, seq);
  acc.totals.ledger_max = Math.max(acc.totals.ledger_max ?? seq, seq);

  let envIdx = 0; const envs = [];
  if (!defs) { // shape-only mode (find.mjs): envelopes in tx-set order, no arm walk
    const ph = lv.tx_set?.v1?.phases ?? [];
    for (const p of ph) {
      if (p.v0) for (const c of p.v0) for (const e of c.txset_comp_txs_maybe_discounted_fee.txs) envs.push([hashes[envIdx++], e]);
      if (p.v1) for (const st of p.v1.execution_stages) for (const cl of st) for (const e of cl) envs.push([hashes[envIdx++], e]);
    }
  }
  const W = !defs ? { walkDef() {} } : walker(defs, {
    onHit: (t, arm, who) => L.arm(`${t}.${arm}`, who),
    enter: (name, v) => {
      if (name === "TransactionEnvelope") { const hsh = hashes?.[envIdx++] ?? `?env${envIdx}`; envs.push([hsh, v]); return hsh; }
      if (name === "TransactionResultMetaV1" || name === "TransactionResultMeta") return v.result.transaction_hash;
      return undefined;
    },
  });
  W.walkDef("LedgerCloseMeta", json, "L");
  if (hashes && hashes.length !== envs.length) throw new Error(`ledger ${seq}: ${hashes.length} hashes vs ${envs.length} envelopes`);
  const byHash = new Map(envs);
  for (const [txIndex, meta] of lv.tx_processing.entries()) {
    const hsh = meta.result.transaction_hash;
    acc.totals.txs++;
    const env = byHash.get(hsh);
    if (!env) { acc.totals.unmatched_envelopes++; continue; }
    const r = detect(env, meta, {
      rec: (shape, n = 1) => { L.shape(shape, hsh, n); onShape?.(shape, seq, hsh, txIndex); },
      hist: (name, b) => { const hh = (acc.hist[name] ??= {}); hh[b] = (hh[b] ?? 0) + 1; },
      max: (name, value) => {
        const cur = acc.max[name];
        if (!cur || BigInt(value) > BigInt(cur.value)) acc.max[name] = { value: String(value), tx: hsh, ledger: seq };
      },
    });
    if (r.soroban) acc.totals.soroban_txs++;
    const ok = meta.result.result.result;
    if (ok && (ok.tx_success || ok.tx_fee_bump_inner_success)) acc.totals.successful_txs++;
  }
  L.close();
}
