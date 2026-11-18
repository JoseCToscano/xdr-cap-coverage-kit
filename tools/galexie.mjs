// Galexie data-lake helpers: object keys, zstd framing, and fetching one
// LedgerCloseMeta from Stellar RPC getLedgers or from SDF's public Galexie
// archive on AWS (s3://aws-public-blockchain/v1.1/stellar/ledgers/{testnet,pubnet}).
// Mainnet (pubnet) ledgers come from the archive only.
// Layout matches galexie defaults: ledgersPerBatch 1, batchesPerPartition 64000.
import { zstdCompressSync, zstdDecompressSync } from "node:zlib";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

export const TESTNET = {
  passphrase: "Test SDF Network ; September 2015",
  rpc: "https://soroban-testnet.stellar.org",
  // The testnet archive is prefixed by the date of the last testnet reset.
  archive: "https://aws-public-blockchain.s3.us-east-2.amazonaws.com/v1.1/stellar/ledgers/testnet/2025-12-18",
};
export const PUBNET = {
  passphrase: "Public Global Stellar Network ; September 2015",
  archive: "https://aws-public-blockchain.s3.us-east-2.amazonaws.com/v1.1/stellar/ledgers/pubnet",
};
// Data-lake directory name (corpus/datalake/<name>) for a network passphrase.
export const lakeName = (passphrase) => (passphrase === PUBNET.passphrase ? "pubnet" : "testnet");
export const LAKE = { ledgersPerBatch: 1, batchesPerPartition: 64000 };
export const sha256 = (b) => createHash("sha256").update(b).digest("hex");

const hex8 = (n) => (0xffffffff - n).toString(16).toUpperCase().padStart(8, "0");
export function objectKey(seq) {
  const per = LAKE.ledgersPerBatch * LAKE.batchesPerPartition;
  const p = Math.floor(seq / per) * per;
  return `${hex8(p)}--${p}-${p + per - 1}/${hex8(seq)}--${seq}.xdr.zst`;
}

export async function rpc(method, params, url = TESTNET.rpc) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error)}`);
  return j.result;
}

// LedgerCloseMetaBatch XDR for a single ledger, built from an LCM's bytes.
// Batch = uint32 startSequence, uint32 endSequence, LedgerCloseMeta<> (count + items).
export function batchOf(seq, lcmBytes) {
  const h = Buffer.alloc(12);
  h.writeUInt32BE(seq, 0); h.writeUInt32BE(seq, 4); h.writeUInt32BE(1, 8);
  return Buffer.concat([h, lcmBytes]);
}
export function lcmOfBatch(batch) {
  const n = batch.readUInt32BE(8);
  if (n !== 1) throw new Error(`expected 1 LCM per batch, got ${n}`);
  return batch.subarray(12);
}

// Returns { source, url, compressed, batch, lcm } for one ledger.
export async function fetchLedger(seq, { prefer = "archive", net = "testnet" } = {}) {
  const tryArchive = async () => {
    const url = `${(net === "pubnet" ? PUBNET : TESTNET).archive}/${objectKey(seq)}`;
    const r = await fetch(url);
    if (r.status !== 200) return null;
    const compressed = Buffer.from(await r.arrayBuffer());
    const batch = zstdDecompressSync(compressed);
    return { source: "galexie-public-archive", url, compressed, batch, lcm: lcmOfBatch(batch) };
  };
  const tryRpc = async () => {
    if (net === "pubnet") return null;
    const res = await rpc("getLedgers", { startLedger: seq, pagination: { limit: 1 } });
    const l = res.ledgers.find((x) => x.sequence === seq);
    if (!l) return null;
    const lcm = Buffer.from(l.metadataXdr, "base64");
    const batch = batchOf(seq, lcm);
    return { source: "stellar-rpc-getLedgers", url: `${TESTNET.rpc} getLedgers(startLedger=${seq})`,
      compressed: zstdCompressSync(batch), batch, lcm };
  };
  const order = prefer === "archive" ? [tryArchive, tryRpc] : [tryRpc, tryArchive];
  for (const f of order) { const got = await f().catch(() => null); if (got) return got; }
  throw new Error(`ledger ${seq}: not on the public Galexie archive or RPC`);
}

export function lakeDir(root, name = "testnet") { return join(root, "corpus/datalake", name); }
export function writeLake(root, seq, compressed, name = "testnet") {
  const dir = lakeDir(root, name);
  mkdirSync(dir, { recursive: true });
  const cfg = join(dir, ".config.json");
  if (!existsSync(cfg)) writeFileSync(cfg, JSON.stringify({ networkPassphrase: name.startsWith("pubnet") ? PUBNET.passphrase : TESTNET.passphrase, version: "1.0",
    compression: "zstd", ledgersPerBatch: LAKE.ledgersPerBatch, batchesPerPartition: LAKE.batchesPerPartition }));
  const p = join(dir, objectKey(seq));
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, compressed);
  return p;
}
// The stored LCM of a corpus entry, from the lake of the entry's network.
export function readEntryLake(root, e) { return readLake(root, e.ledger.sequence, lakeName(e.network.passphrase)); }
export function readLake(root, seq, name = "testnet") {
  const compressed = readFileSync(join(lakeDir(root, name), objectKey(seq)));
  const batch = zstdDecompressSync(compressed);
  return { compressed, batch, lcm: lcmOfBatch(batch) };
}

// Rust reference decode of an LCM to SEP-51 JSON (stellar CLI / rs-stellar-xdr).
export function rustDecodeLcm(lcm) {
  const out = execFileSync("stellar", ["xdr", "decode", "--type", "LedgerCloseMeta", "--input", "single", "--output", "json"],
    { input: lcm, maxBuffer: 1 << 30 });
  return JSON.parse(out.toString());
}
