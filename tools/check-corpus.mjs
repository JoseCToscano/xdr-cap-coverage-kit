// Checks every corpus entry:
//  1. matches schema/corpus-entry.schema.json
//  2. sha256 of the bytes matches
//  3. rs-stellar-xdr (stellar CLI) decodes to expected.json and re-encodes to the same bytes
//  4. js-stellar-sdk decodes, re-encodes to the same bytes, and its SEP-51 JSON equals expected.json
//  5. the transaction hash recomputes under the entry's passphrase
//  6. the semantic checks hold on both the Rust and the JS decode
//  7. for entries with a LedgerCloseMeta: the Galexie object and the LCM hash
//     match, both decoders round-trip the LCM byte for byte, agree on its
//     SEP-51 JSON, the entry's tx sits at ledger.tx_index, and every
//     expected.ledger_checks pointer holds on both decodes
// Writes reports/raw/rust-cli.json and reports/raw/js.json (one row per check).
// Exit code 1 if anything fails.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { xdr, TransactionBuilder } from "@stellar/stellar-sdk";
import { sha256, rustDecode, rustEncode, runChecks, evalChecks } from "./lib.mjs";
import { readEntryLake, rustDecodeLcm } from "./galexie.mjs";

const schema = JSON.parse(readFileSync("schema/corpus-entry.schema.json"));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const dir = "corpus/entries";
let failures = 0;
const rows = { "rust-cli": [], js: [] };
const row = (runner, id, step, ok, msg = "") => {
  if (!ok) failures++;
  if (runner) rows[runner].push({ entry: id, step, ok, ...(ok ? {} : { detail: msg }) });
  console.log(`${ok ? "ok  " : "FAIL"} ${id} ${runner ? `[${runner}] ` : ""}${step}${msg && !ok ? " - " + msg : ""}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const jsJson = (v) => { const j = v.toJson(); return typeof j === "string" ? JSON.parse(j) : j; };

for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const e = JSON.parse(readFileSync(`${dir}/${f}`));
  const id = e.id;
  row(null, id, "schema", validate(e), validate.errors ? ajv.errorsText(validate.errors) : "");

  const bytes = Buffer.from(e.xdr.base64, "base64");
  row(null, id, "sha256", sha256(bytes) === e.xdr.sha256);

  const rjson = rustDecode(e.xdr.type, e.xdr.base64);
  row("rust-cli", id, "decode == expected.json", same(rjson, e.expected.json));
  row("rust-cli", id, "re-encode byte-exact", rustEncode(e.xdr.type, rjson) === e.xdr.base64);

  let jjson = null;
  try {
    const v = xdr[e.xdr.type].fromXdr(e.xdr.base64, "base64");
    row("js", id, "re-encode byte-exact", v.toXdr("base64") === e.xdr.base64);
    jjson = jsJson(v);
    row("js", id, "decode == expected.json", same(jjson, e.expected.json));
  } catch (err) { row("js", id, "decode", false, err.message); }

  if (e.network.expected_tx_hash) {
    const h = Buffer.from(TransactionBuilder.fromXdr(e.xdr.base64, e.network.passphrase).hash()).toString("hex");
    row("js", id, "tx hash", h === e.network.expected_tx_hash, h);
  }
  for (const [who, json] of [["rust-cli", rjson], ["js", jjson]]) {
    if (!json) continue;
    for (const c of runChecks(e, json)) row(who, id, `check ${c.id}`, c.ok, `got ${JSON.stringify(c.got)}`);
  }

  if (e.ledger) {
    const { compressed, lcm } = readEntryLake(".", e);
    row(null, id, "lcm object sha256", sha256(compressed) === e.ledger.sha256_zst);
    row(null, id, "lcm sha256", sha256(lcm) === e.ledger.sha256_lcm);
    const rl = rustDecodeLcm(lcm);
    const b64 = lcm.toString("base64");
    row("rust-cli", id, "lcm re-encode byte-exact", rustEncode("LedgerCloseMeta", rl) === b64);
    let jl = null;
    try {
      const v = xdr.LedgerCloseMeta.fromXdr(lcm);
      row("js", id, "lcm re-encode byte-exact", Buffer.from(v.toXdr()).equals(lcm));
      jl = jsJson(v);
      row("js", id, "lcm decode == rust lcm json", same(jl, rl));
    } catch (err) { row("js", id, "lcm decode", false, err.message); }
    if (e.ledger.tx_index !== null) {
      const v = Object.keys(rl)[0];
      row("rust-cli", id, "lcm tx at tx_index", rl[v].tx_processing[e.ledger.tx_index]?.result.transaction_hash === e.network.expected_tx_hash);
    }
    for (const [who, json] of [["rust-cli", rl], ["js", jl]]) {
      if (!json) continue;
      for (const c of evalChecks(e.expected.ledger_checks, json)) row(who, id, `ledger_check ${c.id}`, c.ok, `got ${JSON.stringify(c.got)}`);
    }
  }
}
mkdirSync("reports/raw", { recursive: true });
for (const [k, v] of Object.entries(rows)) writeFileSync(`reports/raw/${k}.json`, JSON.stringify(v, null, 1) + "\n");
console.log(failures ? `\n${failures} failure(s)` : "\nall entries pass");
process.exitCode = failures ? 1 : 0;
// --check-lcm: also run the golden checks (stellar-core goldens + RPC copy), offline.
if (process.argv.includes("--check-lcm")) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, ["tools/check-lcm.mjs", ...(process.argv.includes("--check") ? ["--check"] : [])], { stdio: "inherit" });
  if (r.status !== 0) process.exitCode = 1;
}
