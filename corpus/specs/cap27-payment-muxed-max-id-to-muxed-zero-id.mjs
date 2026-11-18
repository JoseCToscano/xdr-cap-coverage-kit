// Mined from existing testnet history: a native payment from a muxed source
// whose ID is 2^64-1 to a muxed destination whose ID is 0. Both ends of the
// uint64 range. This kit did NOT submit this transaction: an unrelated testnet
// account submitted it on 2026-11-12, and we read it back from Horizon and the
// public Galexie archive.
import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync(new URL("../raw/cap27-tx.json", import.meta.url)));

export default {
  id: "cap27-payment-muxed-max-id-to-muxed-zero-id",
  title: "Payment from a muxed source with ID 2^64-1 to a muxed destination with ID 0",
  caps: ["CAP-0027"],
  protocol: { introduced_in: 13, captured_on: 30 },
  passphrase: "Test SDF Network ; September 2015",
  xdrType: "TransactionEnvelope",
  base64: () => raw.envelope_xdr,
  provenance: {
    kind: "testnet",
    origin: "mined_from_testnet_history",
    origin_note: "Read from existing testnet ledger history. Not submitted by this kit; the source account is not ours.",
    ledger: raw.ledger,
    tx_hash: raw.hash,
    source_url: `https://horizon-testnet.stellar.org/transactions/${raw.hash}`,
    tx_created_at: raw.created_at,
    raw_committed_at: "2026-11-12T23:44:12Z",
  },
  ledger: { sequence: raw.ledger },
  ledgerChecks: [
    { id: "lcm-tx-success", path: "$TX/result/result/result/tx_success/0/op_inner/payment", op: "equals", value: "success",
      note: "The payment applied. Readers must take participants and balances from this meta, not from the envelope." },
    { id: "lcm-close-time-ms", path: "$LCM/ledger_header/header/scp_value/ext/signed_ms/close_time_ms", op: "preserved",
      note: "Protocol 30 ledger (CAP-88 header arm)." },
  ],
  checks: [
    { id: "source-muxed-max-id", path: "/tx/tx/source_account", op: "strkey",
      value: "MCGVDJFRRJA6UBTB5OCLJ5BJ2HXYT77QSQGPBQA7C5WQHEGZPEA2X77777777777777F4",
      note: "Muxed ID 18446744073709551615. Readers that store the ID in a signed int64 or a JS number get it wrong." },
    { id: "destination-muxed-zero-id", path: "/tx/tx/operations/0/body/payment/destination", op: "strkey",
      value: "MB4KMJUEQ3QT5CKLJNA5NRDEEJV4WNGVUH6LJ5A27OTA2VDXOY4Z2AAAAAAAAAAAAB55K",
      note: "Muxed ID 0 is still a muxed account. It must not be shown as the plain G address or have its ID dropped as 'empty'." },
    { id: "amount", path: "/tx/tx/operations/0/body/payment/amount", op: "equals", value: "10000000",
      note: "1 XLM in stroops, as a string." },
  ],
  tags: ["muxed", "muxed-max-id"],
  linked_issues: [
    { url: "https://github.com/stellar/js-stellar-sdk/issues/1785", role: "regression", component: "muxed ID parsing" },
    { url: "https://github.com/stellar/wallet-backend/issues/716", role: "related", component: "muxed participants" },
  ],
};
