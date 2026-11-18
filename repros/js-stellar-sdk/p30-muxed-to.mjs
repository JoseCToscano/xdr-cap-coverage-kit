// Protocol 30 probe (records behavior; not a filed issue). How each JS SDK
// version reads the SAC transfer `to` argument of two captured testnet txs:
//   cap67-sac-transfer-to-muxed-account   to = M... (muxed account, ID 0)
//   cap84-sac-transfer-to-muxed-contract  to = W... (muxed contract, ID 2^64-1)
// The ScVal bytes are produced by the reference encoder (rs-stellar-xdr via the
// stellar CLI) from the entry's expected JSON, so the SDK under test only decodes.
// Usage: node p30-muxed-to.mjs <package> [<expect cap67> <expect cap84>]
//   expect = same | ERROR | DIFFERENT; exits 1 if a result differs from it.
import { readFileSync } from "node:fs";
import { rustEncode } from "../../tools/lib.mjs";
const pkg = process.argv[2];
const expect = process.argv.slice(3);
let bad = 0, k = 0;
const { xdr, scValToNative, Address } = await import(pkg);
for (const id of ["cap67-sac-transfer-to-muxed-account", "cap84-sac-transfer-to-muxed-contract"]) {
  const e = JSON.parse(readFileSync(new URL(`../../corpus/entries/${id}.json`, import.meta.url)));
  const arg = e.expected.json.tx.tx.operations[0].body.invoke_host_function.host_function.invoke_contract.args[1];
  const b64 = rustEncode("ScVal", arg);
  let native, addr;
  try {
    const sc = xdr.ScVal.fromXDR(b64, "base64");
    try { native = String(scValToNative(sc)); } catch (er) { native = `throws: ${er.message}`; }
    try { addr = Address.fromScVal(sc).toString(); } catch (er) { addr = `throws: ${er.message}`; }
  } catch (er) { native = addr = `decode throws: ${er.message}`; }
  const tag = (s) => (s === arg.address ? "same" : s.startsWith("throws") || s.startsWith("decode") ? "ERROR" : "DIFFERENT");
  const want = expect[k++];
  if (want && (tag(native) !== want || tag(addr) !== want)) bad = 1;
  console.log(`[p30] ${pkg.replace(/^sdk-/, "")} ${id.split("-").slice(0, 1)}: scValToNative=${tag(native)} (${native}) Address.fromScVal=${tag(addr)} (${addr})`);
}
process.exit(bad);
