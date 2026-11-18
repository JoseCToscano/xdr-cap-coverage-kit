// Submits one Soroban transaction whose source account is muxed (M...) to
// Stellar Testnet: a native SAC transfer from the base account. This is the
// "Soroban op participants" producer in wallet-backend#716 (contract op
// participants seeded from op.SourceAccount().Address(), which is M... for a
// muxed source). Key is random, Friendbot-funded, held in memory only.
//
// Usage: MODE=tx|op node tools/capture-wb716.mjs > corpus/raw/wb716-soroban-muxed-<mode>-source.json
// If the network rejects the transaction at submission, the rejection
// (TransactionResult) is recorded instead.
import { execFileSync } from "node:child_process";
import { Keypair, TransactionBuilder, MuxedAccount, Asset, Address, nativeToScVal, rpc, Networks, Contract, xdr } from "@stellar/stellar-sdk";

const RPC = "https://soroban-testnet.stellar.org", NET = Networks.TESTNET;
const server = new rpc.Server(RPC);
const out = { network: NET, rpc: RPC, started_at: new Date().toISOString(), captures: [] };
const A = Keypair.random(), B = Keypair.random();
for (const k of [A, B]) {
  const r = await fetch(`https://friendbot.stellar.org/?addr=${k.publicKey()}`);
  if (!r.ok) throw new Error(`friendbot ${r.status}`);
}
out.accounts = { A: A.publicKey(), B: B.publicKey() };
const muxId = "18446744073709551615";
const mux = new MuxedAccount(await server.getAccount(A.publicKey()), muxId);
const sac = new Contract(Asset.native().contractId(NET));
// The JS SDK's TransactionBuilder refuses a muxed source on Soroban
// transactions, so build with the base account, simulate, then set the
// muxed source in the XDR (MODE=tx: tx source; MODE=op: operation source)
// and sign. The network decides whether it is valid.
const MODE = process.env.MODE || "tx";
let tx = new TransactionBuilder(await server.getAccount(A.publicKey()), { fee: "1000000", networkPassphrase: NET })
  .addOperation(sac.call("transfer", new Address(A.publicKey()).toScVal(), new Address(B.publicKey()).toScVal(), nativeToScVal(1234567n, { type: "i128" })))
  .setTimeout(120).build();
tx = await server.prepareTransaction(tx);
// Edit through SEP-51 JSON with the stellar CLI (reference XDR implementation).
const j = JSON.parse(execFileSync("stellar", ["xdr", "decode", "--type", "TransactionEnvelope", "--output", "json"], { input: tx.toEnvelope().toXDR("base64") }).toString());
if (MODE === "tx") j.tx.tx.source_account = mux.accountId();
else j.tx.tx.operations[0].source_account = mux.accountId();
const b64 = execFileSync("stellar", ["xdr", "encode", "--type", "TransactionEnvelope", "--input", "json", "--output", "single-base64"], { input: JSON.stringify(j) }).toString().trim();
tx = TransactionBuilder.fromXDR(b64, NET);
tx.sign(A);
const src = mux;
const sent = await server.sendTransaction(tx);
if (sent.status === "ERROR") {
  // Record the network's verdict instead of failing: this is the evidence.
  const res = sent.errorResult.toXDR("base64");
  const decoded = JSON.parse(execFileSync("stellar", ["xdr", "decode", "--type", "TransactionResult", "--output", "json"], { input: res }).toString());
  out.rejected = { mode: MODE, muxed_source: mux.accountId(), tx_hash: sent.hash, envelope_xdr: b64, error_result_xdr: res, error_result: decoded,
    rpc_latest_ledger: sent.latestLedger, at: new Date().toISOString() };
  console.error(`rejected: ${decoded.result}`);
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}
let got;
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  got = await server._getTransaction(sent.hash);
  if (got.status !== "NOT_FOUND") break;
}
if (got.status !== "SUCCESS") throw new Error(`${got.status} ${got.resultXdr}`);
out.captures.push({ label: `wb716-soroban-muxed-${MODE}-source`, tx_hash: sent.hash, ledger: got.ledger,
  created_at: new Date(Number(got.createdAt) * 1000).toISOString(), application_order: got.applicationOrder,
  envelope_xdr: got.envelopeXdr, result_xdr: got.resultXdr, result_meta_xdr: got.resultMetaXdr,
  muxed_source: src.accountId(), base_source: A.publicKey(), destination: B.publicKey() });
console.error(`${sent.hash} ledger ${got.ledger} source ${src.accountId()}`);
console.log(JSON.stringify(out, null, 2));
