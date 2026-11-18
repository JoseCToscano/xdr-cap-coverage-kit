// Fetches the LedgerCloseMeta for every ledger the corpus needs and writes it
// into corpus/datalake/testnet in Galexie layout (zstd LedgerCloseMetaBatch,
// one ledger per object). Prefers SDF's public Galexie archive and falls back
// to Stellar RPC getLedgers. Records source + hashes in corpus/datalake/SOURCES.json.
// When both sources have the ledger, the second copy is kept too, in
// corpus/datalake/testnet-<source> (same layout), for tools/check-lcm.mjs.
// Usage: node tools/fetch-lcm.mjs [--net pubnet] <ledger> [<ledger> ...]
// --net pubnet: mainnet ledger from the public archive into corpus/datalake/pubnet
// (no RPC copy; recorded in SOURCES.json with network "pubnet").
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fetchLedger, writeLake, objectKey, sha256 } from "./galexie.mjs";
const root = new URL("..", import.meta.url).pathname;
const srcPath = `${root}corpus/datalake/SOURCES.json`;
const sources = existsSync(srcPath) ? JSON.parse(readFileSync(srcPath)) : {};
const args = process.argv.slice(2);
const ni = args.indexOf("--net");
const net = ni >= 0 ? args.splice(ni, 2)[1] : "testnet";
for (const seq of args.map(Number)) {
  const got = await fetchLedger(seq, { prefer: "archive", net });
  writeLake(root, seq, got.compressed, net);
  const rec = { ...(net === "pubnet" ? { network: "pubnet" } : {}), ledger: seq, object_key: objectKey(seq), source: got.source, url: got.url,
    fetched_at: new Date().toISOString(), sha256_zst: sha256(got.compressed), sha256_lcm: sha256(got.lcm), lcm_bytes: got.lcm.length };
  // Also record the other source's hash when both exist: they are not always byte-identical.
  const alt = net === "pubnet" ? null : await fetchLedger(seq, { prefer: got.source.startsWith("galexie") ? "rpc" : "archive" }).catch(() => null);
  if (alt && alt.source !== got.source) {
    writeLake(root, seq, alt.compressed, alt.source.startsWith("galexie") ? "testnet-archive" : "testnet-rpc");
    rec.alt = { source: alt.source, sha256_lcm: sha256(alt.lcm), lcm_bytes: alt.lcm.length, byte_identical: alt.lcm.equals(got.lcm) };
  }
  sources[seq] = rec;
  console.log(`${seq} ${got.source} ${got.lcm.length} bytes${rec.alt ? ` (alt ${rec.alt.source}: byte_identical=${rec.alt.byte_identical})` : ""}`);
}
writeFileSync(srcPath, JSON.stringify(Object.fromEntries(Object.entries(sources).sort()), null, 2) + "\n");
