// Shared loader for corpus/raw/p30-captures.json (written by tools/capture-testnet.mjs).
import { readFileSync } from "node:fs";
const file = JSON.parse(readFileSync(new URL("../raw/p30-captures.json", import.meta.url)));
export const accounts = file.accounts;
export function capture(label) {
  const c = file.captures.find((x) => x.label === label);
  if (!c) throw new Error(`no capture ${label}`);
  return c;
}
export function submittedProvenance(c) {
  return {
    kind: "testnet",
    origin: "submitted_by_kit",
    origin_note: "Submitted to testnet by tools/capture-testnet.mjs from a Friendbot-funded throwaway key that was never written to disk.",
    ledger: c.ledger,
    tx_hash: c.tx_hash,
    source_url: `https://horizon-testnet.stellar.org/transactions/${c.tx_hash}`,
    tx_created_at: c.created_at,
  };
}
export const TESTNET = "Test SDF Network ; September 2015";
