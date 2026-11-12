// Builds corpus/entries/<id>.json from a spec in corpus/specs/<id>.mjs.
// It never invents XDR: the base64 comes from captured network data
// (corpus/raw/) or from an SDK builder for entries marked synthetic.
// Expected JSON is produced by rs-stellar-xdr, and the tool refuses to
// write an entry that does not re-encode to the same bytes.
// Usage: node tools/make-entry.mjs corpus/specs/<id>.mjs
import { writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import { TransactionBuilder } from "@stellar/stellar-sdk";
import { sha256, rustDecode, rustEncode, rustXdrVersion } from "./lib.mjs";

const specPath = resolve(process.argv[2]);
const { default: spec } = await import(specPath);
const b64 = await spec.base64();
const bytes = Buffer.from(b64, "base64");

const json = rustDecode(spec.xdrType, b64);
const reencoded = rustEncode(spec.xdrType, json);
if (reencoded !== b64) throw new Error(`${spec.id}: rs-stellar-xdr re-encode differs from input`);

const network = { passphrase: spec.passphrase };
if (spec.passphrase !== "none" && spec.xdrType === "TransactionEnvelope") {
  network.expected_tx_hash = Buffer.from(TransactionBuilder.fromXdr(b64, spec.passphrase).hash()).toString("hex");
  if (spec.provenance.tx_hash && spec.provenance.tx_hash !== network.expected_tx_hash) {
    throw new Error(`${spec.id}: recomputed hash ${network.expected_tx_hash} != captured ${spec.provenance.tx_hash}`);
  }
}

const entry = {
  schema_version: "0.1.0",
  id: spec.id,
  title: spec.title,
  caps: spec.caps,
  protocol: { ...spec.protocol, xdr_ref: rustXdrVersion() },
  network,
  xdr: { type: spec.xdrType, base64: b64, sha256: sha256(bytes) },
  provenance: { ...spec.provenance, tool: `tools/make-entry.mjs (${basename(specPath)})` },
  expected: { json, checks: spec.checks },
  tags: spec.tags,
  linked_issues: spec.linked_issues,
};
const out = resolve(`corpus/entries/${spec.id}.json`);
writeFileSync(out, JSON.stringify(entry, null, 2) + "\n");
console.log(`wrote ${out}`);
