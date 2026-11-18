// Shared helpers for entries mined from mainnet history (tools/capture-mainnet.mjs).
// The kit did not submit these transactions; they are read back from the
// public Galexie archive and found by the frequency study (reports/frequency.md).
import { readFileSync } from "node:fs";
const caps = JSON.parse(readFileSync(new URL("../raw/mainnet-captures.json", import.meta.url)));
const sources = JSON.parse(readFileSync(new URL("../datalake/SOURCES.json", import.meta.url)));
export const PUBNET = caps.passphrase;
export function mainnet(hash, why) {
  const c = caps.captures[hash];
  if (!c) throw new Error(`no capture for ${hash}`);
  return {
    c,
    passphrase: PUBNET,
    xdrType: "TransactionEnvelope",
    base64: () => c.envelope_xdr,
    provenance: {
      kind: "mainnet",
      origin: "mined_from_mainnet_history",
      origin_note: `Found by the real-network frequency study (tools/frequency/, reports/frequency.md): ${why} Not submitted by this kit.`,
      ledger: c.ledger,
      tx_hash: hash,
      source_url: c.explorer_url,
      tx_created_at: new Date(Number(c.ledger_close_time) * 1000).toISOString(),
      retrieved_at: sources[c.ledger].fetched_at,
    },
    ledger: { sequence: c.ledger },
  };
}
