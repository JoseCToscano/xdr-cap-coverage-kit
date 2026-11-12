// Synthetic: an ScVal map with keys u32 1 and symbol "1". Valid XDR, in host
// key order (u32 sorts before symbol), but the two keys print the same.
// Built with the JS SDK, so it is marked synthetic until we capture one
// from a contract event on a local core (see synthetic_reason).
import { xdr } from "@stellar/stellar-sdk";

export default {
  id: "scval-map-key-collision",
  title: "ScVal map whose keys u32 1 and symbol \"1\" collide after native conversion",
  caps: ["CAP-0046-01"],
  protocol: { introduced_in: 20, captured_on: 30 },
  passphrase: "none",
  xdrType: "ScVal",
  base64: () =>
    xdr.ScVal.scvMap([
      new xdr.ScMapEntry({ key: xdr.ScVal.scvU32(1), val: xdr.ScVal.scvU32(10) }),
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("1"), val: xdr.ScVal.scvU32(20) }),
    ]).toXdr("base64"),
  provenance: {
    kind: "synthetic",
    synthetic_reason: "Built with @stellar/stellar-sdk 17.4.0. Plan to replace it with a capture: deploy a test contract on a local quickstart that emits this map in an event, take the LedgerCloseMeta from getLedgers, and slice the event body.",
  },
  checks: [
    { id: "two-entries", path: "/map", op: "not-dropped", value: 2,
      note: "Both entries must survive conversion, or the conversion must fail loudly (js-stellar-sdk #1789)." },
    { id: "first-key-u32", path: "/map/0/key", op: "equals", value: { u32: 1 }, note: "u32 key." },
    { id: "second-key-symbol", path: "/map/1/key", op: "equals", value: { symbol: "1" }, note: "symbol key that prints the same." },
  ],
  tags: ["key-collision"],
  linked_issues: [
    { url: "https://github.com/stellar/js-stellar-sdk/issues/1789", role: "reproduces", component: "scValToNative" },
  ],
};
