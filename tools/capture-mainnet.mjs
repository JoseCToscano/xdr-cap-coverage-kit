// Captures real mainnet transactions for corpus entries: stores each ledger in
// corpus/datalake/pubnet (Galexie layout, from SDF's public archive; recorded
// in corpus/datalake/SOURCES.json with network "pubnet") and writes the
// transaction envelope (re-encoded by rs-stellar-xdr from the ledger's tx set,
// matched by hash) to corpus/raw/mainnet-captures.json. Nothing is built or
// submitted by the kit; these are other people's transactions on mainnet.
// Usage: node tools/capture-mainnet.mjs <ledger>:<txhash> [...]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { TransactionBuilder } from "@stellar/stellar-sdk";
import { fetchLedger, writeLake, objectKey, sha256, rustDecodeLcm, PUBNET } from "./galexie.mjs";
import { rustEncode } from "./lib.mjs";

const root = new URL("..", import.meta.url).pathname;
const srcPath = join(root, "corpus/datalake/SOURCES.json");
const capPath = join(root, "corpus/raw/mainnet-captures.json");
const sources = JSON.parse(readFileSync(srcPath));
const caps = existsSync(capPath) ? JSON.parse(readFileSync(capPath)) : { network: "pubnet", passphrase: PUBNET.passphrase, captures: {} };
function envelopes(v) {
  const out = [];
  for (const ph of v.tx_set.v1.phases) {
    if (ph.v0) for (const c of ph.v0) out.push(...c.txset_comp_txs_maybe_discounted_fee.txs);
    if (ph.v1) for (const st of ph.v1.execution_stages) for (const cl of st) out.push(...cl);
  }
  return out;
}
for (const arg of process.argv.slice(2)) {
  const [s, hash] = arg.split(":"); const seq = Number(s);
  const got = await fetchLedger(seq, { net: "pubnet" });
  writeLake(root, seq, got.compressed, "pubnet");
  sources[seq] = { network: "pubnet", ledger: seq, object_key: objectKey(seq), source: got.source, url: got.url,
    fetched_at: sources[seq]?.fetched_at ?? new Date().toISOString(), sha256_zst: sha256(got.compressed), sha256_lcm: sha256(got.lcm), lcm_bytes: got.lcm.length };
  const j = rustDecodeLcm(got.lcm), v = j.v2;
  const txIndex = v.tx_processing.findIndex((t) => t.result.transaction_hash === hash);
  if (txIndex < 0) throw new Error(`${hash} not in ledger ${seq}`);
  // Find the envelope by hash: re-encode each candidate and hash it under the mainnet passphrase.
  let b64 = null;
  for (const env of envelopes(v)) {
    const e64 = rustEncode("TransactionEnvelope", env);
    if (Buffer.from(TransactionBuilder.fromXdr(e64, PUBNET.passphrase).hash()).toString("hex") === hash) { b64 = e64; break; }
  }
  if (!b64) throw new Error(`${hash}: envelope not found in tx set`);
  caps.captures[hash] = { ledger: seq, tx_index: txIndex, ledger_close_time: v.ledger_header.header.scp_value.close_time,
    protocol: v.ledger_header.header.ledger_version, envelope_xdr: b64,
    source_url: got.url, explorer_url: `https://stellar.expert/explorer/public/tx/${hash}` };
  console.log(`${seq} ${hash} tx_index ${txIndex}`);
}
caps.captures = Object.fromEntries(Object.entries(caps.captures).sort((a, b) => a[1].ledger - b[1].ledger));
writeFileSync(capPath, JSON.stringify(caps, null, 2) + "\n");
writeFileSync(srcPath, JSON.stringify(Object.fromEntries(Object.entries(sources).sort()), null, 2) + "\n");
