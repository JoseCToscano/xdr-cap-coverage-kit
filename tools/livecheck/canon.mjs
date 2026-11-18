// Canonical token projection shared by the JS reader and the Rust reader's
// SEP-51 JSON. The Go reader (go/main.go) emits the same language natively.
//
// A type-driven walk in XDR declaration order emits:
//   U<n> union discriminant   E<n> enum value   I<n> integer, exact decimal
//   B0/B1 bool   X<hex> opaque/string bytes   O0/O1 optional   N<n> array length
//   K<strkey> account/muxed/contract/balance/pool/signer keys, encoded by the reader's SDK
//   A<hex> asset code bytes without trailing NULs
// 128/256-bit parts fold to one exact integer. Tokens are grouped into
// segments: "L" (ledger level), E<i> per TransactionEnvelope, P<j> per
// TransactionResultMeta(V1), in walk order. A segment's hash is the first 12
// bytes of sha256 over its tokens, each followed by "\n" (same as Go).
import { createHash } from "node:crypto";
import * as sdk from "@stellar/stellar-sdk";
import { STRKEY_UNIONS } from "../xdr-walk.mjs";

const { xdr, StrKey, Address, SignerKey, encodeMuxedAccountToAddress } = sdk;
const TWO53 = 2n ** 53n;
const hex = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString("hex");
const stripNul = (u8) => { let n = u8.length; while (n > 0 && u8[n - 1] === 0) n--; return hex(u8.subarray(0, n)); };
export const segHash = (toks) => createHash("sha256").update(toks.length ? toks.join("\n") + "\n" : "").digest("hex").slice(0, 24);

// ---- JS schema index -------------------------------------------------------
const resolve = (s) => { while (s && s.kind === "lazy") s = s.getSchema(); return s; };
export const JS_SCHEMAS = new Map(); // name -> schema (named unions, enums, structs, typedefs)
(function index() {
  const seen = new Set();
  const visit = (s) => {
    s = resolve(s);
    if (!s || seen.has(s)) return; seen.add(s);
    if (s.name && !JS_SCHEMAS.has(s.name)) JS_SCHEMAS.set(s.name, s);
    if (s.entries) for (const [, f] of s.entries) visit(f);
    if (s.cases) for (const c of s.cases) if (c.arm?.schema) visit(c.arm.schema);
    if (s.defaultArm?.schema) visit(s.defaultArm.schema);
    if (s.element) visit(s.element);
    if (s.switchOn) visit(s.switchOn);
  };
  for (const n of ["LedgerCloseMeta", "TransactionEnvelope", "TransactionResultMetaV1", "TransactionResultMeta"]) visit(xdr[n].schema);
})();

// ---- JS reader -------------------------------------------------------------
const encK = {
  PublicKey: (v) => StrKey.encodeEd25519PublicKey(Buffer.from(v.ed25519)),
  MuxedAccount: (v) => encodeMuxedAccountToAddress(xdr.MuxedAccount.fromXdrObject(v)),
  ScAddress: (v) => Address.fromScAddress(xdr.ScAddress.fromXdrObject(v)).toString(),
  SignerKey: (v) => SignerKey.encodeSignerKey(xdr.SignerKey.fromXdrObject(v)),
  ClaimableBalanceId: (v) => StrKey.encodeClaimableBalance(Buffer.concat([Buffer.from([v.type]), Buffer.from(v.v0)])),
  PoolId: (v) => StrKey.encodeLiquidityPool(Buffer.from(v)),
  ContractId: (v) => StrKey.encodeContract(Buffer.from(v)),
};
const SEG_TYPES = { TransactionEnvelope: "E", TransactionResultMetaV1: "P", TransactionResultMeta: "P" };

export function jsProject(rootSchema, value) {
  const segs = [{ name: "L", toks: [], big: false }];
  let stack = [segs[0]], nE = 0, nP = 0;
  const vals = { E: [], P: [] };
  let cur = segs[0];
  const t = (s) => cur.toks.push(s);
  const int = (b) => { if (typeof b === "bigint" && (b >= TWO53 || b <= -TWO53)) cur.big = true; t("I" + b.toString()); };
  function walk(s, v) {
    s = resolve(s);
    const sk = s.name && SEG_TYPES[s.name];
    if (sk) {
      const seg = { name: sk + (sk === "E" ? nE++ : nP++), toks: [], big: false };
      segs.push(seg); stack.push(seg); cur = seg; vals[sk].push(v);
      try { walkInner(s, v); } finally { stack.pop(); cur = stack[stack.length - 1]; }
      return;
    }
    walkInner(s, v);
  }
  function walkInner(s, v) {
    const n = s.name;
    if (n && encK[n]) { try { t("K" + encK[n](v)); } catch (e) { t("K!" + e.message); } return; }
    if (n === "AssetCode4" || n === "AssetCode12") return t("A" + stripNul(v));
    if (n === "AssetCode") return t("A" + stripNul(v.assetCode4 ?? v.assetCode12));
    if (n === "Int128Parts" || n === "Uint128Parts") return int(xdr.partsTo128BigInt(v, n === "Int128Parts"));
    if (n === "Int256Parts" || n === "Uint256Parts") return int(fold256(v, n === "Int256Parts"));
    switch (s.kind) {
      case "struct": for (const [k, f] of s.entries) walk(f, v[k]); return;
      case "union": {
        const d = v[s.switchKey];
        t("U" + d);
        const c = s.cases.find((x) => x.discriminant === d) ?? (s.defaultArm ? { arm: s.defaultArm } : null);
        if (!c) return t("U!badarm");
        if (c.arm.kind === "field") walk(c.arm.schema, v[c.arm.name]);
        return;
      }
      case "enum": return t("E" + v);
      case "int32": case "uint32": return t("I" + v);
      case "int64": case "uint64": return int(v);
      case "bool": return t(v ? "B1" : "B0");
      case "opaque": case "varOpaque": return t("X" + hex(v));
      case "string": return t("X" + hex(v.bytes ?? v));
      case "option": if (v === null || v === undefined) return t("O0"); t("O1"); return walk(s.element, v);
      case "array": case "fixedArray": t("N" + v.length); for (const x of v) walk(s.element, x); return;
      case "void": return;
      default: t("?" + s.kind);
    }
  }
  walk(rootSchema, value);
  return { segs, vals };
}
function fold256(v, signed) {
  return xdr.partsTo256BigInt(v, signed);
}

// ---- Rust reader (SEP-51 JSON from rs-stellar-xdr) ---------------------------
// Rust arm / enum names -> XDR numeric values, zipped by declaration order
// against the JS schema of the same name and cross-checked by name.
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
export function buildTables(defs) {
  const tables = {}, problems = [];
  for (const [name, d] of Object.entries(defs)) {
    const rustArms = d.oneOf ? d.oneOf.flatMap((a) => (a.enum ? a.enum : a.required)) : d.enum ? d.enum : null;
    if (!rustArms) continue;
    const js = resolve(JS_SCHEMAS.get(name));
    if (!js) { problems.push(`${name}: no JS schema`); continue; }
    let jsList;
    if (js.kind === "union") jsList = js.cases.map((c) => [c.name, c.discriminant]);
    else if (js.kind === "enum") jsList = [...js.nameByValue].map(([v, n]) => [n, v]);
    else { problems.push(`${name}: JS kind ${js.kind}`); continue; }
    const map = {};
    const intSwitch = js.kind === "union" && resolve(js.switchOn)?.kind !== "enum";
    const cp = (xs) => { let p = xs[0] ?? ""; for (const x of xs) while (!x.startsWith(p)) p = p.slice(0, -1); return p; };
    const jsN = jsList.map(([n]) => norm(n)), rsN = rustArms.map(norm);
    const jp = jsList.length > 1 ? cp(jsN) : "", rp = rustArms.length > 1 ? cp(rsN) : "";
    for (let i = 0; i < rustArms.length; i++) {
      const a = rustArms[i];
      if (intSwitch && /^v\d+$/.test(a)) { map[a] = Number(a.slice(1)); continue; }
      let j = jsN.findIndex((x) => x.slice(jp.length) === rsN[i].slice(rp.length));
      if (j < 0) j = jsN.findIndex((x) => x === rsN[i]);
      if (j < 0) { const c = jsN.map((x, k) => [x, k]).filter(([x]) => x.endsWith(rsN[i])); if (c.length === 1) j = c[0][1]; }
      if (j < 0) { problems.push(`${name}: no JS arm for ${a}`); continue; }
      map[a] = jsList[j][1];
    }
    if (new Set(Object.values(map)).size !== Object.keys(map).length) problems.push(`${name}: duplicate mapping`);
    tables[name] = { kind: js.kind, map };
  }
  return { tables, problems };
}

function unescapeSep51(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (s[i] !== "\\") { if (c < 0x80) out.push(c); else out.push(...Buffer.from(s[i], "utf8")); continue; }
    const n = s[++i];
    if (n === "x") { out.push(parseInt(s.substr(i + 1, 2), 16)); i += 2; }
    else out.push({ "0": 0, t: 9, n: 10, r: 13, "\\": 92, '"': 34, "'": 39 }[n] ?? n.charCodeAt(0));
  }
  return Uint8Array.from(out);
}

const RUST_K = new Set(["AccountId", "NodeId", "MuxedAccount", "ScAddress", "SignerKey", "ClaimableBalanceId", "PoolId", "ContractId"]);
const RUST_INT = new Set(["Int128Parts", "UInt128Parts", "Int256Parts", "UInt256Parts", "Duration", "TimePoint", "TimePointMs", "SequenceNumber"]);
const RUST_SEG = SEG_TYPES;

// opts.arms: record "Type.arm" hits per segment (frequency-study keys).
// opts.paths: record a JSON path per token (debugging divergences).
export function rustProject(defs, tables, json, opts = {}) {
  const segs = [{ name: "L", toks: [], arms: new Set(), paths: opts.paths ? [] : null }];
  let stack = [segs[0]], cur = segs[0], nE = 0, nP = 0;
  const envs = [];
  let path = [];
  const t = (s) => { cur.toks.push(s); if (cur.paths) cur.paths.push(path.join("/")); };
  const hit = (k) => { if (opts.arms) cur.arms.add(k); };
  function ref(name, v) {
    const sk = RUST_SEG[name];
    if (sk) {
      const seg = { name: sk + (sk === "E" ? nE++ : nP++), toks: [], arms: new Set(), paths: opts.paths ? [] : null };
      if (sk === "E") envs.push(v);
      segs.push(seg); stack.push(seg); cur = seg;
      try { refInner(name, v); } finally { stack.pop(); cur = stack[stack.length - 1]; }
      return;
    }
    refInner(name, v);
  }
  function refInner(name, v) {
    const d = defs[name];
    if (RUST_K.has(name)) { const m = STRKEY_UNIONS[name]; if (m) hit(`${name}.${m[v[0]] ?? "?" + v[0]}`); return t("K" + v); }
    if (name === "AssetCode4" || name === "AssetCode12" || name === "AssetCode") { const b = unescapeSep51(v); let n = b.length; while (n > 0 && b[n - 1] === 0) n--; return t("A" + Buffer.from(b.subarray(0, n)).toString("hex")); }
    if (RUST_INT.has(name)) return t("I" + v);
    if (name.startsWith("StringM<")) return t("X" + Buffer.from(unescapeSep51(v)).toString("hex"));
    const tab = tables[name];
    if (tab && (d.oneOf || d.enum)) {
      const key = typeof v === "string" ? v : Object.keys(v)[0];
      hit(`${name}.${key}`);
      const num = tab.map[key];
      if (tab.kind === "enum") return t("E" + num);
      t("U" + num);
      if (typeof v !== "string") {
        const arm = d.oneOf.find((a) => a.required?.[0] === key);
        path.push(key); node(arm.properties[key], v[key]); path.pop();
      }
      return;
    }
    node(d, v);
  }
  function node(n, v) {
    if (n.$ref) return ref(n.$ref.slice(14), v);
    if (n.anyOf) { if (v === null || v === undefined) return t("O0"); t("O1"); return node(n.anyOf.find((x) => x.type !== "null"), v); }
    if (Array.isArray(n.type)) { if (v === null || v === undefined) return t("O0"); t("O1"); return node({ ...n, type: n.type.find((x) => x !== "null") }, v); }
    if (n.properties) {
      for (const k of Object.keys(v)) { path.push(k); node(n.properties[k], v[k]); path.pop(); }
      return;
    }
    switch (n.type) {
      case "integer": return t("I" + v);
      case "boolean": return t(v ? "B1" : "B0");
      case "string":
        if (n.contentEncoding === "hex") return t("X" + v.toLowerCase());
        return t("I" + v);
      case "array": {
        t("N" + v.length);
        v.forEach((x, i) => { path.push(i); node(Array.isArray(n.prefixItems) ? n.prefixItems[i] ?? n.items : n.items, x); path.pop(); });
        return;
      }
    }
    t("?" + JSON.stringify(n).slice(0, 60));
  }
  ref(opts.root ?? "LedgerCloseMeta", json);
  return { segs, envs };
}
