// Submits the Protocol 30 shapes the corpus needs to Stellar Testnet and
// records what the network returned. Keys are random, funded by Friendbot,
// held in memory only and never written to disk. Re-running creates new
// transactions; the corpus records the ones from the run that produced it.
//
// Usage: node tools/capture-testnet.mjs > corpus/raw/p30-captures.json
//
// Shapes:
//   cap21-max-vectors   PRECOND_V2 with 2/2 extraSigners (one a 64-byte signed
//                       payload), 28-byte text memo, 100/100 operations,
//                       muxed source and muxed destinations
//   cap38-pool-issuer-order  pool-share trustline + deposit where the two
//                       issuers sort one way by strkey text and the other by XDR bytes
//   cap46-sac-deploy    CreateStellarAssetContract for the kit's test asset
//   cap73-sac-trust     SAC trust(G) creating a trustline with no contract event (wallet-backend #731)
//   cap84-sac-transfer-to-muxed-contract   native SAC transfer to a W... address (CAP-84)
//   cap67-sac-transfer-to-muxed-account    native SAC transfer to an M... address (CAP-67)
import {
  Keypair, TransactionBuilder, Operation, Asset, LiquidityPoolAsset, getLiquidityPoolId,
  Memo, MuxedAccount, Account, StrKey, Address, nativeToScVal, xdr, rpc, Networks,
  Horizon, Contract, encodeMuxedContractAddress, SignerKey,
} from "@stellar/stellar-sdk";
import { randomBytes } from "node:crypto";

const RPC = "https://soroban-testnet.stellar.org";
const HORIZON = "https://horizon-testnet.stellar.org";
const NET = Networks.TESTNET;
const server = new rpc.Server(RPC);
const horizon = new Horizon.Server(HORIZON);
const log = (...a) => console.error(...a);
const out = { network: NET, rpc: RPC, started_at: new Date().toISOString(), captures: [] };

async function fund(kp) {
  const r = await fetch(`https://friendbot.stellar.org/?addr=${kp.publicKey()}`);
  if (!r.ok) throw new Error(`friendbot ${r.status} ${await r.text()}`);
}
async function submit(tx, label, extra = {}) {
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") throw new Error(`${label}: send error ${sent.errorResult?.toXDR("base64")}`);
  let got;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    got = await server._getTransaction(sent.hash);
    if (got.status !== "NOT_FOUND") break;
  }
  if (got.status !== "SUCCESS") throw new Error(`${label}: ${got.status} ${got.resultXdr}`);
  const rec = { label, tx_hash: sent.hash, ledger: got.ledger, created_at: new Date(Number(got.createdAt) * 1000).toISOString(),
    application_order: got.applicationOrder, envelope_xdr: got.envelopeXdr, result_xdr: got.resultXdr,
    result_meta_xdr: got.resultMetaXdr, ...extra };
  out.captures.push(rec);
  log(`${label}: ${sent.hash} ledger ${got.ledger}`);
  return rec;
}
async function soroban(source, op, label, extra) {
  const acct = await server.getAccount(source.publicKey());
  let tx = new TransactionBuilder(acct, { fee: "1000000", networkPassphrase: NET }).addOperation(op).setTimeout(120).build();
  tx = await server.prepareTransaction(tx);
  tx.sign(source);
  return submit(tx, label, extra);
}

// --- keys ---------------------------------------------------------------
const A = Keypair.random(), B = Keypair.random();
// Issuers whose order by strkey text differs from their order by XDR bytes
// (base32: '2'..'7' sort after 'Z' in bytes but before 'A' in ASCII).
let I1, I2;
for (;;) {
  const x = Keypair.random(), y = Keypair.random();
  const textLess = x.publicKey() < y.publicKey();
  const byteLess = Buffer.compare(x.rawPublicKey(), y.rawPublicKey()) < 0;
  if (textLess !== byteLess) { I1 = x; I2 = y; break; }
}
const K2 = Keypair.random(), K3 = Keypair.random();
for (const k of [A, B, I1, I2]) await fund(k);
log("funded", A.publicKey(), B.publicKey(), I1.publicKey(), I2.publicKey());
out.accounts = { A: A.publicKey(), B: B.publicKey(), issuer_1: I1.publicKey(), issuer_2: I2.publicKey(),
  extra_signer_ed25519: K2.publicKey() };

// --- CAP-21 + max-length vectors + muxed ---------------------------------
{
  const acct = await server.getAccount(A.publicKey());
  const seq = BigInt(acct.sequenceNumber());
  const latest = (await server.getLatestLedger()).sequence;
  const payload = randomBytes(64); // signed-payload signer payload at its 64-byte max
  const pSigner = StrKey.encodeSignedPayload(
    new xdr.SignerKeyEd25519SignedPayload({ ed25519: K3.rawPublicKey(), payload }).toXDR());
  const mSource = new MuxedAccount(new Account(A.publicKey(), acct.sequenceNumber()), "1");
  const b = new TransactionBuilder(mSource, {
    fee: "100", networkPassphrase: NET, memo: Memo.text("x".repeat(28)),
    timebounds: { minTime: 0, maxTime: Math.floor(Date.now() / 1000) + 300 },
    ledgerbounds: { minLedger: latest, maxLedger: latest + 200 },
    minAccountSequence: (seq).toString(), minAccountSequenceAge: 0, minAccountSequenceLedgerGap: 0,
    extraSigners: [K2.publicKey(), pSigner],
  });
  for (let i = 0; i < 100; i++) {
    const dest = new MuxedAccount(new Account(B.publicKey(), "0"), String(i === 99 ? 18446744073709551615n : i)).accountId();
    b.addOperation(Operation.payment({ destination: dest, asset: Asset.native(), amount: "0.0000001" }));
  }
  const tx = b.build();
  tx.sign(A);
  tx.sign(K2);
  tx.signatures.push(K3.signPayloadDecorated(payload));
  await submit(tx, "cap21-max-vectors", { signed_payload_signer: pSigner, memo_text_bytes: 28, operations: 100 });
}

// --- CAP-38 pool with issuers whose strkey and byte order disagree -------
{
  const X = new Asset("KIT", I1.publicKey()), Y = new Asset("KIT", I2.publicKey());
  const [a, b] = Asset.compare(X, Y) < 0 ? [X, Y] : [Y, X]; // byte order, as core requires
  const textFirst = X.getIssuer() < Y.getIssuer() ? X : Y;
  const acct = await server.getAccount(A.publicKey());
  let tx = new TransactionBuilder(acct, { fee: "1000", networkPassphrase: NET })
    .addOperation(Operation.changeTrust({ asset: X }))
    .addOperation(Operation.changeTrust({ asset: Y }))
    .addOperation(Operation.payment({ source: I1.publicKey(), destination: A.publicKey(), asset: X, amount: "1000" }))
    .addOperation(Operation.payment({ source: I2.publicKey(), destination: A.publicKey(), asset: Y, amount: "1000" }))
    .setTimeout(120).build();
  tx.sign(A, I1, I2);
  await submit(tx, "cap38-pool-setup");
  const pool = new LiquidityPoolAsset(a, b, 30);
  const poolId = Buffer.from(getLiquidityPoolId("constant_product", pool.getLiquidityPoolParameters())).toString("hex");
  const acct2 = await server.getAccount(A.publicKey());
  tx = new TransactionBuilder(acct2, { fee: "1000", networkPassphrase: NET })
    .addOperation(Operation.changeTrust({ asset: pool }))
    .addOperation(Operation.liquidityPoolDeposit({ liquidityPoolId: poolId, maxAmountA: "100", maxAmountB: "100",
      minPrice: "0.5", maxPrice: "2" }))
    .setTimeout(120).build();
  tx.sign(A);
  await submit(tx, "cap38-pool-issuer-order", { pool_id: poolId, asset_a_issuer: a.getIssuer(), asset_b_issuer: b.getIssuer(),
    text_order_first_issuer: textFirst.getIssuer() });
}

// --- SAC for KIT:I1, trust() (CAP-73), transfers to W (CAP-84) and M (CAP-67)
const kit = new Asset("KIT", I1.publicKey());
const kitSac = kit.contractId(NET);
await soroban(A, Operation.createStellarAssetContract({ asset: kit }), "cap46-sac-deploy", { contract_id: kitSac });
await soroban(B, new Contract(kitSac).call("trust", nativeToScVal(B.publicKey(), { type: "address" })),
  "cap73-sac-trust", { contract_id: kitSac, account: B.publicKey() });

const xlmSac = Asset.native().contractId(NET);
const wId = 18446744073709551615n;
const W = encodeMuxedContractAddress(kitSac, wId.toString());
await soroban(A, new Contract(xlmSac).call("transfer", nativeToScVal(A.publicKey(), { type: "address" }),
  nativeToScVal(W, { type: "address" }), nativeToScVal(10_000_000n, { type: "i128" })),
  "cap84-sac-transfer-to-muxed-contract", { contract_id: xlmSac, to: W, to_contract: kitSac, to_muxed_id: wId.toString() });

const M = new MuxedAccount(new Account(B.publicKey(), "0"), "0").accountId();
await soroban(A, new Contract(xlmSac).call("transfer", nativeToScVal(A.publicKey(), { type: "address" }),
  nativeToScVal(M, { type: "address" }), nativeToScVal(10_000_000n, { type: "i128" })),
  "cap67-sac-transfer-to-muxed-account", { contract_id: xlmSac, to: M, to_muxed_id: "0" });

out.finished_at = new Date().toISOString();
console.log(JSON.stringify(out, null, 2));
