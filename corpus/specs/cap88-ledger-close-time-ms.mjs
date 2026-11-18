// The LedgerHeader of a Protocol 30 testnet ledger (the one holding the CAP-84
// capture), taken from its LedgerCloseMeta in the Galexie data lake. CAP-88
// adds the STELLAR_VALUE_SIGNED_MS arm with closeTimeMs; closeTime must equal
// closeTimeMs / 1000. The spec refuses to build if that does not hold.
import { readLake, rustDecodeLcm } from "../../tools/galexie.mjs";
import { rustEncode } from "../../tools/lib.mjs";
import { capture } from "./_captures.mjs";
const root = new URL("../..", import.meta.url).pathname;
const seq = capture("cap84-sac-transfer-to-muxed-contract").ledger;
const header = rustDecodeLcm(readLake(root, seq).lcm).v2.ledger_header.header;
const ms = header.scp_value.ext.signed_ms.close_time_ms;
const s = header.scp_value.close_time;
if (BigInt(s) !== BigInt(ms) / 1000n) throw new Error(`CAP-88 invariant broken: close_time ${s} vs close_time_ms ${ms}`);
export default {
  id: "cap88-ledger-close-time-ms",
  title: "Protocol 30 LedgerHeader with millisecond close time (STELLAR_VALUE_SIGNED_MS)",
  caps: ["CAP-0088"],
  protocol: { introduced_in: 30, captured_on: 30 },
  passphrase: "none",
  xdrType: "LedgerHeader",
  base64: () => rustEncode("LedgerHeader", header),
  provenance: {
    kind: "testnet",
    origin: "mined_from_testnet_history",
    origin_note: "Header of a ledger read back from SDF's public Galexie archive. Every Protocol 30 ledger has this arm.",
    ledger: seq,
  },
  checks: [
    { id: "signed-ms-arm", path: "/scp_value/ext/signed_ms/close_time_ms", op: "equals", value: ms,
      note: "TimePointMs (uint64 ms). Readers that only know STELLAR_VALUE_BASIC/SIGNED fail to decode every Protocol 30 header." },
    { id: "close-time-seconds", path: "/scp_value/close_time", op: "equals", value: s, note: "closeTime == closeTimeMs / 1000 (integer division)." },
    { id: "protocol-30", path: "/ledger_version", op: "equals", value: 30, note: "Protocol 30." },
  ],
  ledger: { sequence: seq },
  ledgerChecks: [
    { id: "lcm-header-ms", path: "$LCM/ledger_header/header/scp_value/ext/signed_ms/close_time_ms", op: "equals", value: ms, note: "Same value inside the full LedgerCloseMeta." },
  ],
  tags: ["protocol-30", "close-time-ms", "ledger-header"],
  linked_issues: [],
};
