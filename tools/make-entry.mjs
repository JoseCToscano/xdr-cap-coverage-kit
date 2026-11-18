// Builds corpus/entries/<id>.json from a spec in corpus/specs/<id>.mjs.
// It never invents XDR: the base64 comes from captured network data
// (corpus/raw/, corpus/datalake/) or from an SDK builder for entries marked
// synthetic. Expected JSON is produced by rs-stellar-xdr, and the tool
// refuses to write an entry that does not re-encode to the same bytes, whose
// tx hash does not match, or whose ledger checks do not hold on the stored
// LedgerCloseMeta.
// Usage: node tools/make-entry.mjs corpus/specs/<id>.mjs [...]
import { writeFileSync, readFileSync } from "node:fs";
import { resolve, basename, relative } from "node:path";
import { TransactionBuilder } from "@stellar/stellar-sdk";
import { sha256, rustDecode, rustEncode, rustXdrVersion, runChecks, evalChecks } from "./lib.mjs";
import { readLake, rustDecodeLcm, objectKey, lakeDir, lakeName } from "./galexie.mjs";

const root = resolve(new URL("..", import.meta.url).pathname);
const sources = JSON.parse(readFileSync(`${root}/corpus/datalake/SOURCES.json`));

for (const arg of process.argv.slice(2)) {
  const specPath = resolve(arg);
  const { default: spec } = await import(specPath);
  const b64 = await spec.base64();
  const bytes = Buffer.from(b64, "base64");

  const json = rustDecode(spec.xdrType, b64);
  if (rustEncode(spec.xdrType, json) !== b64) throw new Error(`${spec.id}: rs-stellar-xdr re-encode differs from input`);

  const network = { passphrase: spec.passphrase };
  if (spec.passphrase !== "none" && spec.xdrType === "TransactionEnvelope") {
    network.expected_tx_hash = Buffer.from(TransactionBuilder.fromXdr(b64, spec.passphrase).hash()).toString("hex");
    if (spec.provenance.tx_hash && spec.provenance.tx_hash !== network.expected_tx_hash) {
      throw new Error(`${spec.id}: recomputed hash ${network.expected_tx_hash} != captured ${spec.provenance.tx_hash}`);
    }
  }

  const entry = {
    schema_version: "0.2.0",
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
  const bad = runChecks(entry, json).filter((c) => !c.ok);
  if (bad.length) throw new Error(`${spec.id}: checks fail on the reference decode: ${JSON.stringify(bad)}`);

  if (spec.ledger) {
    const seq = spec.ledger.sequence;
    const lake = lakeName(spec.passphrase);
    const { compressed, lcm } = readLake(root, seq, lake);
    const lj = rustDecodeLcm(lcm);
    const v = Object.keys(lj)[0];
    const header = lj[v].ledger_header.header;
    let txIndex = null;
    if (network.expected_tx_hash) {
      txIndex = lj[v].tx_processing.findIndex((t) => t.result.transaction_hash === network.expected_tx_hash);
      if (txIndex < 0) throw new Error(`${spec.id}: tx ${network.expected_tx_hash} not in ledger ${seq}`);
    }
    const TX = `/${v}/tx_processing/${txIndex}`;
    const ledgerChecks = (spec.ledgerChecks || []).map((c) => ({ ...c, path: c.path.replace("$TX", TX).replace("$LCM", `/${v}`) }));
    const src = sources[seq];
    entry.ledger = {
      type: "LedgerCloseMeta",
      lcm_version: v,
      sequence: seq,
      protocol_version: header.ledger_version,
      file: relative(root, `${lakeDir(root, lake)}/${objectKey(seq)}`),
      format: "galexie: zstd(LedgerCloseMetaBatch), 1 ledger per object, 64000 per partition",
      sha256_zst: sha256(compressed),
      sha256_lcm: sha256(lcm),
      tx_index: txIndex,
      source: src.source,
      source_url: src.url,
      ...(src.alt ? { alt_source: src.alt } : {}),
    };
    entry.expected.ledger_checks = ledgerChecks;
    const lbad = evalChecks(ledgerChecks, lj).filter((c) => !c.ok);
    if (lbad.length) throw new Error(`${spec.id}: ledger checks fail on the stored LCM: ${JSON.stringify(lbad)}`);
    if (spec.protocol.captured_on !== header.ledger_version) throw new Error(`${spec.id}: captured_on ${spec.protocol.captured_on} != ledger_version ${header.ledger_version}`);
  }
  const out = resolve(`${root}/corpus/entries/${spec.id}.json`);
  writeFileSync(out, JSON.stringify(entry, null, 2) + "\n");
  console.log(`wrote ${relative(root, out)}${entry.ledger ? ` (+ LCM ${entry.ledger.sequence}, ${entry.expected.ledger_checks.length} ledger checks)` : ""}`);
}
