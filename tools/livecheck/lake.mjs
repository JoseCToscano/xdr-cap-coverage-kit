// Galexie objects from SDF's public ledger archive (AWS Open Data), cached on disk.
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { zstdDecompressSync } from "node:zlib";
import { objectKey, lcmOfBatch } from "../galexie.mjs";
import { NETWORKS } from "./check.mjs";

export const CACHE = process.env.XCK_LCM_CACHE ?? join(homedir(), ".cache/xck-lcm");
export const urlOf = (net, seq) => `${NETWORKS[net].archive}/${objectKey(seq)}`;

// Returns the compressed object, or null on 404 (not exported yet).
export async function fetchObject(net, seq, { cache = true, retries = 4 } = {}) {
  const p = join(CACHE, net, objectKey(seq));
  if (existsSync(p)) return readFileSync(p);
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(urlOf(net, seq), { signal: AbortSignal.timeout(30000) });
      if (r.status === 404 || r.status === 403) return null;
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      const b = Buffer.from(await r.arrayBuffer());
      if (cache && process.env.XCK_LCM_CACHE !== "off") { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p + ".tmp", b); renameSync(p + ".tmp", p); }
      return b;
    } catch (e) { if (i >= retries) throw e; await new Promise((r) => setTimeout(r, 1000 * 2 ** i)); }
  }
}
export const lcmOf = (compressed) => lcmOfBatch(zstdDecompressSync(compressed));
