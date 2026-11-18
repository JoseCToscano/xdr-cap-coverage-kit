// Submitted by this kit on Protocol 30 testnet. One transaction that sits at
// several XDR length limits at once: 100/100 operations, 2/2 extraSigners
// (one is a CAP-40 signed-payload signer whose payload is at its 64-byte max),
// a 28/28-byte text memo, PRECOND_V2 with every field set, a muxed source and
// 100 muxed destinations whose IDs run 0..98 and 2^64-1.
import { capture, submittedProvenance, accounts, TESTNET } from "./_captures.mjs";
const c = capture("cap21-max-vectors");
export default {
  id: "cap21-preconditions-max-length-vectors",
  title: "PRECOND_V2 with 2/2 extra signers (64-byte signed payload), 100/100 ops, 28-byte memo, muxed source and destinations",
  caps: ["CAP-0021", "CAP-0040", "CAP-0027"],
  protocol: { introduced_in: 19, captured_on: 30 },
  passphrase: TESTNET,
  xdrType: "TransactionEnvelope",
  base64: () => c.envelope_xdr,
  provenance: submittedProvenance(c),
  checks: [
    { id: "ops-at-max", path: "/tx/tx/operations", op: "not-dropped", value: 100, note: "operations<100> at its max. Readers that page or cap at fewer ops drop the tail." },
    { id: "extra-signers-at-max", path: "/tx/tx/cond/v2/extra_signers", op: "not-dropped", value: 2, note: "extraSigners<2> at its max." },
    { id: "extra-signer-signed-payload", path: "/tx/tx/cond/v2/extra_signers/1", op: "strkey", value: c.signed_payload_signer,
      note: "Signed-payload signer with a 64-byte payload (the max). The P strkey is 165 chars; columns sized for G/M keys truncate it." },
    { id: "extra-signer-ed25519", path: "/tx/tx/cond/v2/extra_signers/0", op: "strkey", value: accounts.extra_signer_ed25519, note: "Plain ed25519 extra signer." },
    { id: "memo-text-at-max", path: "/tx/tx/memo/text", op: "equals", value: "x".repeat(28), note: "Text memo at its 28-byte max." },
    { id: "ledger-bounds", path: "/tx/tx/cond/v2/ledger_bounds", op: "preserved", note: "LedgerBounds precondition is present." },
    { id: "min-seq-num", path: "/tx/tx/cond/v2/min_seq_num", op: "preserved", note: "minSeqNum precondition is present." },
    { id: "muxed-source-id-1", path: "/tx/tx/source_account", op: "strkey", value: "MDEKP4LJIJMVRZ3P2MVGD6ZMZFP66H3FMPWNTU3S6BOT35AWPESQWAAAAAAAAAAAAFFJE", note: "Muxed source, ID 1." },
    { id: "muxed-dest-max-id", path: "/tx/tx/operations/99/body/payment/destination", op: "strkey",
      value: "MCKTS6PBU5K6TNEJDSACKAB55CI6IJQ5YEVP4I2VOOUMUF524IGTF7777777777774RJQ", note: "Last op pays muxed ID 2^64-1." },
    { id: "muxed-dest-zero-id", path: "/tx/tx/operations/0/body/payment/destination", op: "strkey",
      value: "MCKTS6PBU5K6TNEJDSACKAB55CI6IJQ5YEVP4I2VOOUMUF524IGTEAAAAAAAAAAAADBT4", note: "First op pays muxed ID 0." },
    { id: "three-signatures", path: "/tx/signatures", op: "length", value: 3, note: "Source, ed25519 extra signer, signed-payload extra signer." },
  ],
  ledger: { sequence: c.ledger },
  ledgerChecks: [
    { id: "lcm-100-op-results", path: "$TX/result/result/result/tx_success", op: "length", value: 100, note: "All 100 operations applied." },
    { id: "lcm-last-op-success", path: "$TX/result/result/result/tx_success/99/op_inner/payment", op: "equals", value: "success", note: "Op 100 of 100 applied." },
  ],
  tags: ["max-length", "preconditions", "signed-payload", "muxed", "muxed-max-id"],
  linked_issues: [
    { url: "https://github.com/stellar/wallet-backend/pull/729", role: "related", component: "signed-payload signer width" },
  ],
};
