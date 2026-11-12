// Checks every corpus entry:
//  1. matches schema/corpus-entry.schema.json
//  2. sha256 of the bytes matches
//  3. rs-stellar-xdr (stellar CLI) decodes to expected.json and re-encodes to the same bytes
//  4. js-stellar-sdk decodes, re-encodes to the same bytes, and its SEP-51 JSON equals expected.json
//  5. the transaction hash recomputes under the entry's passphrase
//  6. the semantic checks hold on both the Rust and the JS decode
// Exit code 1 if anything fails. This is the seed of the conformance runner.
import { readFileSync, readdirSync } from "node:fs";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { xdr, TransactionBuilder } from "@stellar/stellar-sdk";
import { sha256, rustDecode, rustEncode, runChecks } from "./lib.mjs";

const schema = JSON.parse(readFileSync("schema/corpus-entry.schema.json"));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const dir = "corpus/entries";
let failures = 0;
const row = (id, step, ok, msg = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${id} ${step}${msg ? " - " + msg : ""}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const e = JSON.parse(readFileSync(`${dir}/${f}`));
  const id = e.id;
  row(id, "schema", validate(e), validate.errors ? ajv.errorsText(validate.errors) : "");

  const bytes = Buffer.from(e.xdr.base64, "base64");
  row(id, "sha256", sha256(bytes) === e.xdr.sha256);

  const rjson = rustDecode(e.xdr.type, e.xdr.base64);
  row(id, "rust decode == expected.json", same(rjson, e.expected.json));
  row(id, "rust re-encode", rustEncode(e.xdr.type, rjson) === e.xdr.base64);

  const T = xdr[e.xdr.type];
  const v = T.fromXdr(e.xdr.base64, "base64");
  row(id, "js re-encode", v.toXdr("base64") === e.xdr.base64);
  const j = v.toJson();
  const jjson = typeof j === "string" ? JSON.parse(j) : j;
  row(id, "js toJson == expected.json", same(jjson, e.expected.json));

  if (e.network.expected_tx_hash) {
    const h = Buffer.from(TransactionBuilder.fromXdr(e.xdr.base64, e.network.passphrase).hash()).toString("hex");
    row(id, "tx hash", h === e.network.expected_tx_hash, h);
  }
  for (const [who, json] of [["rust", rjson], ["js", jjson]]) {
    for (const c of runChecks(e, json)) row(id, `check ${c.id} (${who})`, c.ok, c.ok ? "" : `got ${JSON.stringify(c.got)}`);
  }
}
console.log(failures ? `\n${failures} failure(s)` : "\nall entries pass");
process.exitCode = failures ? 1 : 0;
