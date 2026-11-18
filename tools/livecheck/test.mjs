// Deterministic tests for the live differential checker (offline).
//   node tools/livecheck/test.mjs            check against testdata/expected.json
//   node tools/livecheck/test.mjs --update   rewrite testdata/expected.json
// Fixtures: the 9 Protocol 28/30 testnet ledgers committed under
// corpus/datalake/testnet (G/M/C/B/L/W/P addresses, CAP-88 headers) and one
// mainnet Protocol 29 ledger in tools/livecheck/testdata.
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import { createChecker, scanNumbers, armClass, capsFor, ROOT } from "./check.mjs";
import { lcmOf } from "./lake.mjs";
import { buildReaders } from "./readers.mjs";

const HERE = new URL(".", import.meta.url).pathname;
const EXPECTED = join(HERE, "testdata/expected.json");
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".xdr.zst") ? [join(d, e.name)] : []));
const fixtures = [
  ...walk(join(ROOT, "corpus/datalake/testnet")).map((f) => ({ net: "testnet", f })),
  ...walk(join(HERE, "testdata/pubnet")).map((f) => ({ net: "pubnet", f })),
].sort((a, b) => (a.f < b.f ? -1 : 1));
const seqOf = (f) => Number(f.match(/--(\d+)\.xdr\.zst$/)[1]);

buildReaders();
let pass = 0;
const ok = (name) => { pass++; console.log(`ok   ${name}`); };
const got = {};
const checkers = { testnet: await createChecker({ net: "testnet" }), pubnet: await createChecker({ net: "pubnet" }) };
try {
  for (const { net, f } of fixtures) {
    const seq = seqOf(f), lcm = lcmOf(readFileSync(f));
    const r = await checkers[net].check(seq, lcm);
    const counts = {}; for (const x of r.flags) counts[x.type] = (counts[x.type] ?? 0) + 1;
    got[`${net}/${seq}`] = { txs: r.txs, segments: r.segments, protocol: r.protocol, readers: JSON.parse(JSON.stringify(r.readers)),
      flags: counts, arms: r.flags.filter((x) => x.arm || x.shape).map((x) => `${x.type}:${x.arm ?? x.shape}:${x.tx.slice(0, 12)}`).sort() };
    for (const k of ["js", "go", "rust"]) { assert.equal(r.readers[k].ok, true, `${k} decodes ${seq}`); assert.equal(r.readers[k].roundtrip, true, `${k} round-trips ${seq}`); }
    assert.equal(r.readers.rust.json_roundtrip, true);
    assert.equal(r.flags.filter((x) => ["disagreement", "decode_failure", "roundtrip_mismatch"].includes(x.type)).length, 0, `three readers agree on ${net} ${seq}`);
    ok(`${net} ${seq}: ${r.txs} txs, ${r.segments} segments, three readers agree, byte round-trips`);

    // Injected divergence: one token changed in one reader must be flagged, attributed and located.
    if (r.txs > 0) {
      for (const reader of ["js", "rust"]) {
        const ri = await checkers[net].check(seq, lcm, { inject: { reader, segment: "E0", index: 1, token: "Kinjected" } });
        const d = ri.flags.filter((x) => x.type === "disagreement");
        assert.equal(d.length, 1, `one disagreement after injecting into ${reader}`);
        assert.equal(d[0].segment, "E0"); assert.equal(d[0].token_index, 1); assert.equal(d[0].odd_reader, reader);
        assert.match(d[0].tx, /^[0-9a-f]{64}$/);
      }
      ok(`${net} ${seq}: injected divergence in JS and in Rust each flagged at E0[1] with the odd reader named`);
    }
  }
  // Corrupt bytes: every reader must report a decode failure, not crash.
  const bad = lcmOf(readFileSync(fixtures[0].f)).subarray(0, 200);
  const rb = await checkers.testnet.check(1, bad);
  assert.deepEqual(rb.flags.filter((x) => x.type === "decode_failure").map((x) => x.reader).sort(), ["go", "js", "rust"]);
  ok("truncated ledger: decode_failure from all three readers");
} finally { for (const c of Object.values(checkers)) c.close(); }

// JS precision scan and arm classes.
const hz = []; scanNumbers({ a: 2 ** 53, b: [1, { c: -(2 ** 60) }], d: "9007199254740993", e: 9007199254740991 }, "x", hz);
assert.deepEqual(hz.map((h) => h.path), ["x.a", "x.b.1.c"]);
ok("precision scan flags numbers >= 2^53 and ignores strings / safe integers");
const base = { txs: 1e6, arms: new Map([["A.common", { occ: 500, txs: 500 }], ["A.rare", { occ: 3, txs: 3 }], ["A.ledgeronly", { occ: 9, txs: 0 }]]) };
assert.equal(armClass(base, "A.common"), null); assert.equal(armClass(base, "A.rare"), "long_tail");
assert.equal(armClass(base, "A.never"), "first_seen"); assert.equal(armClass(base, "A.ledgeronly"), null);
assert.equal(armClass(base, "A.never", new Set(["A.never"])), "seen_live");
assert.deepEqual(capsFor(["ScAddress.muxed_contract", "SignerKey.ed25519_signed_payload", "MuxedAccount.muxed_ed25519"]), ["CAP-0027", "CAP-0040", "CAP-0084"]);
ok("arm classes (first-seen / long-tail / seen-live) and CAP tags");

if (process.argv.includes("--update")) { writeFileSync(EXPECTED, JSON.stringify(got, null, 1) + "\n"); console.log(`wrote ${EXPECTED}`); }
else {
  assert.ok(existsSync(EXPECTED), "testdata/expected.json missing: run with --update");
  assert.deepEqual(got, JSON.parse(readFileSync(EXPECTED, "utf8")));
  ok("per-fixture results match testdata/expected.json");
}
console.log(`${pass} checks passed`);
