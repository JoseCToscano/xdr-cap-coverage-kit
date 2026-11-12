// js-stellar-sdk #1789: scValToNative drops scvMap entries whose keys
// convert to the same JS property (u32 1 and symbol "1").
// https://github.com/stellar/js-stellar-sdk/issues/1789
// Buggy: 17.2.1. Fixed: 17.3.0 (PR #1778, now throws TypeError).
// Usage: node 1789-scval-map-collision.mjs <sdk-17-2-1|sdk-17-3-0>
const pkg = process.argv[2];
const { xdr, scValToNative } = await import(pkg);

// Same base64 as corpus/entries/scval-map-key-collision.json
const B64 = "AAAAEQAAAAEAAAACAAAAAwAAAAEAAAADAAAACgAAAA8AAAABMQAAAAAAAAMAAAAU";
const map = xdr.ScVal.fromXdr(B64, "base64");
const xdrEntries = map.value.length; // v17: union arm is a field, .value is the arm value

let result;
try {
  const native = scValToNative(map);
  const nativeEntries = Object.keys(native).length;
  result = nativeEntries === xdrEntries
    ? { status: "PASS", detail: `kept all ${xdrEntries} entries` }
    : { status: "FAIL", detail: `XDR has ${xdrEntries} entries, native has ${nativeEntries}: ${JSON.stringify(native)}` };
} catch (e) {
  // The fix makes the loss loud instead of silent.
  result = { status: "PASS", detail: `threw ${e.constructor.name}: ${e.message}` };
}
console.log(`[#1789] ${pkg}: ${result.status} - ${result.detail}`);
process.exitCode = result.status === "PASS" ? 0 : 1;
