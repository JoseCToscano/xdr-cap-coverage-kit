// Captured from testnet: a SetOptions that adds a CAP-40 signed-payload
// (P...) signer built over the source account's own ed25519 key.
// This is the ledger wallet-backend #729 names as the one that halted ingestion.
import { readFileSync } from "node:fs";
const raw = JSON.parse(readFileSync(new URL("../raw/cap40-tx.json", import.meta.url)));

export default {
  id: "cap40-setoptions-signed-payload-signer",
  title: "SetOptions adds a signed-payload (P...) signer over the source account's own key",
  caps: ["CAP-0040"],
  protocol: { introduced_in: 19, captured_on: 28 },
  passphrase: "Test SDF Network ; September 2015",
  xdrType: "TransactionEnvelope",
  base64: () => raw.envelope_xdr,
  provenance: {
    kind: "testnet",
    ledger: raw.ledger,
    tx_hash: raw.hash,
    source_url: `https://horizon-testnet.stellar.org/transactions/${raw.hash}`,
    captured_at: raw.created_at,
  },
  checks: [
    { id: "signer-is-p-strkey", path: "/tx/tx/operations/0/body/set_options/signer/key", op: "strkey",
      value: "PBCK2RYYLIYOSHBEL2FQLAVRSHRH3GP3ID476SGKBV7BEZHMQ6NSAAAAAAB55LN6AANMS",
      note: "Store and return the full P... key. Truncating it to 32 bytes (wallet-backend #716) or rejecting it in a 33-byte column (#729) are both bugs." },
    { id: "signer-weight", path: "/tx/tx/operations/0/body/set_options/signer/weight", op: "equals", value: 1,
      note: "Weight 1 signer." },
    { id: "same-key-as-source", path: "/tx/tx/source_account", op: "strkey",
      value: "GBCK2RYYLIYOSHBEL2FQLAVRSHRH3GP3ID476SGKBV7BEZHMQ6NSBB7B",
      note: "The P signer wraps the same ed25519 key as the source. Reducing P to its base G makes two different signers look identical." },
  ],
  tags: ["signed-payload"],
  linked_issues: [
    { url: "https://github.com/stellar/wallet-backend/pull/729", role: "reproduces", component: "wallet-backend ingest (signer state changes)" },
    { url: "https://github.com/stellar/wallet-backend/issues/716", role: "related", component: "wallet-backend AddressBytea" },
  ],
};
