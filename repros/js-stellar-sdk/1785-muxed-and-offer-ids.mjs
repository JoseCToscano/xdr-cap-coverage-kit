// js-stellar-sdk #1785: muxed account IDs and offer IDs accept values that
// encode a different ID than the one passed in.
// https://github.com/stellar/js-stellar-sdk/issues/1785
// Buggy: 17.2.1. Fixed: 17.3.0 (PR #1780).
// Usage: node 1785-muxed-and-offer-ids.mjs <sdk-17-2-1|sdk-17-3-0>
const pkg = process.argv[2];
const sdk = await import(pkg);
const { Account, MuxedAccount, Operation, Asset, Keypair } = sdk;

// Fixed test key so the output is stable. Not a funded account.
const base = new Account(Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7)).publicKey(), "1");
const checks = [];

// Check A: two MuxedAccount objects for the same M-address must report the same id().
try {
  const a = new MuxedAccount(base, "16");
  const b = new MuxedAccount(base, "0x10");
  const same = a.accountId() === b.accountId();
  const ok = !(same && a.id() !== b.id());
  checks.push({ name: "muxed id canonical", ok,
    detail: `"0x10" -> M-address ${same ? "same as" : "differs from"} id 16, id() = ${JSON.stringify(b.id())}` });
} catch (e) {
  checks.push({ name: "muxed id canonical", ok: true, detail: `"0x10" rejected: ${e.message}` });
}

// Check B: an offer ID above 2^53-1 passed as a number must not be rounded.
const wanted = "9007199254740993"; // 2^53 + 1
try {
  const op = Operation.manageSellOffer({
    selling: Asset.native(),
    buying: new Asset("USD", base.accountId()),
    amount: "1",
    price: "1",
    offerId: Number(wanted),
  });
  const encoded = op.body.value.offerId.toString();
  checks.push({ name: "offerId not rounded", ok: encoded === wanted,
    detail: `asked for ${wanted}, operation encodes ${encoded}` });
} catch (e) {
  checks.push({ name: "offerId not rounded", ok: true, detail: `unsafe number rejected: ${e.message}` });
}

let fail = 0;
for (const c of checks) {
  if (!c.ok) fail++;
  console.log(`[#1785] ${pkg}: ${c.ok ? "PASS" : "FAIL"} ${c.name} - ${c.detail}`);
}
process.exitCode = fail ? 1 : 0;
