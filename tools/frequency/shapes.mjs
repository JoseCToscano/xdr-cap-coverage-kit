// Shape detectors for the real-network frequency study. Each detector looks at
// one transaction (decoded SEP-51 JSON from `stellar xdr decode`: the envelope
// from the tx set and its TransactionResultMetaV1) and reports the shapes the
// corpus and the reproduced bugs depend on. Union arms are counted separately
// by the schema walker (tools/xdr-walk.mjs); these are the shapes that are not
// a single union arm: muxed-ID ranges, P signers, auth-tree depth, ScMap key
// collisions, pool issuer order, SAC trust(), CAP-67 classic-op events, ...
//
// `rec(shape, n = 1)` counts a shape for the current transaction.
// `hist(name, bucket)` adds one transaction to a histogram bucket.
// `max(name, value)` tracks the maximum value and the transaction that has it.

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function crc16(buf) {
  let crc = 0;
  for (const b of buf) { crc ^= b << 8; for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff; }
  return crc;
}
// Decodes a strkey; returns { version, payload } or null if not a valid strkey.
export function strkeyDecode(s) {
  if (typeof s !== "string" || s.length < 56) return null;
  const out = []; let bits = 0, acc = 0;
  for (const ch of s) { const v = B32.indexOf(ch); if (v < 0) return null; acc = (acc << 5) | v; bits += 5; if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); } }
  const b = Buffer.from(out);
  if (b.length < 3) return null;
  const body = b.subarray(0, b.length - 2), sum = b.readUInt16LE(b.length - 2);
  if (crc16(body) !== sum) return null;
  return { version: body[0], payload: body.subarray(1) };
}
const MUXED_VER = 12 << 3, SIGNED_PAYLOAD_VER = 15 << 3;
const TWO53 = 2n ** 53n, U64MAX = 2n ** 64n - 1n;
export function muxedId(m) {
  const d = strkeyDecode(m);
  if (!d || d.version !== MUXED_VER || d.payload.length !== 40) return null;
  return d.payload.readBigUInt64BE(32);
}
export function signedPayloadLen(p) {
  const d = strkeyDecode(p);
  if (!d || d.version !== SIGNED_PAYLOAD_VER || d.payload.length < 36) return null;
  return d.payload.readUInt32BE(32);
}
const strkeyBytes = (g) => strkeyDecode(g)?.payload;

export function innerTx(env) {
  return env.tx?.tx ?? env.tx_fee_bump?.tx?.inner_tx?.tx?.tx ?? env.tx_v0?.tx ?? null;
}
const opType = (op) => (typeof op.body === "string" ? op.body : Object.keys(op.body)[0]);

// Generic recursive visitor over plain JSON.
function visit(v, f, path = "") {
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) visit(v[i], f, path); return; }
  if (v && typeof v === "object") { if (f(v, path) === false) return; for (const k in v) visit(v[k], f, k); return; }
  if (typeof v === "string") f(v, path);
}

// Native string a key becomes in js-stellar-sdk scValToNative object keys (#1789).
function nativeKey(k) {
  if (!k || typeof k !== "object") return JSON.stringify(k);
  const [t] = Object.keys(k); const v = k[t];
  if (["u32", "i32", "u64", "i64", "u128", "i128", "u256", "i256", "timepoint", "duration"].includes(t)) return `n:${String(v)}`;
  if (t === "symbol" || t === "string") return `n:${v}`;
  if (t === "bool") return `n:${v}`;
  if (t === "address") return `n:${v}`;
  return `${t}:${JSON.stringify(v)}`;
}
function scvalDepth(v) { // nesting depth of vec/map containers
  if (!v || typeof v !== "object") return 0;
  if (Array.isArray(v.vec)) return 1 + Math.max(0, ...v.vec.map(scvalDepth));
  if (Array.isArray(v.map)) return 1 + Math.max(0, ...v.map.map((e) => Math.max(scvalDepth(e.key), scvalDepth(e.val))));
  return 0;
}
function authDepth(inv) { return 1 + Math.max(0, ...(inv.sub_invocations ?? []).map(authDepth)); }
function authNodes(inv) { return 1 + (inv.sub_invocations ?? []).reduce((s, x) => s + authNodes(x), 0); }
function authHasDeploy(inv) {
  const f = inv.function ?? {};
  if (f.create_contract_host_fn || f.create_contract_v2_host_fn) return true;
  return (inv.sub_invocations ?? []).some(authHasDeploy);
}
const bucket = (n, edges) => { for (const e of edges) if (n <= e) return `<=${e}`; return `>${edges[edges.length - 1]}`; };

export function detect(env, meta, { rec, hist, max }) {
  const tx = innerTx(env);
  const ops = tx?.operations ?? [];
  const m = meta.tx_apply_processing ?? {};
  const mv = m.v4 ?? m.v3 ?? m.v2 ?? m.v1 ?? null;
  const metaVer = Object.keys(m)[0];

  // --- muxed accounts (CAP-27; wallet-backend #716 classic control; js-stellar-sdk #1785) ---
  const muxedSeen = new Set(), pSeenEnv = new Set();
  visit(env, (s) => {
    if (typeof s !== "string") return;
    if (s[0] === "M" && s.length === 69) muxedSeen.add(s);
    else if (s[0] === "P" && s.length >= 69) pSeenEnv.add(s);
  });
  let anyMuxed = false;
  for (const s of muxedSeen) {
    const id = muxedId(s); if (id === null) continue;
    anyMuxed = true;
    rec("muxed.envelope_any");
    if (id === 0n) rec("muxed.id_zero");
    if (id >= TWO53) rec("muxed.id_ge_2^53 (JS-unsafe, #1785 shape)");
    if (id === U64MAX) rec("muxed.id_2^64-1");
  }
  if (tx && typeof tx.source_account === "string" && tx.source_account[0] === "M") rec("muxed.tx_source");
  if (env.tx_fee_bump && String(env.tx_fee_bump.tx.fee_source)[0] === "M") rec("muxed.fee_bump_source");
  for (const op of ops) if (typeof op.source_account === "string" && op.source_account[0] === "M") { rec("muxed.op_source"); break; }

  // --- signed-payload P signers (CAP-40; wallet-backend #729, #716 producer 3) ---
  for (const p of pSeenEnv) {
    const n = signedPayloadLen(p); if (n === null) continue;
    rec("p_signer.in_envelope");
    if (n === 64) rec("p_signer.payload_64_bytes (max)");
  }
  for (const op of ops) {
    const so = op.body?.set_options;
    if (so?.signer && String(so.signer.key)[0] === "P") rec("p_signer.set_options_adds_P (#729 trigger)");
  }
  let pInMeta = false;
  visit(mv, (o) => { if (o && typeof o === "object" && Array.isArray(o.signers)) for (const s of o.signers) if (String(s.key)[0] === "P") pInMeta = true; });
  if (pInMeta) rec("p_signer.account_entry_with_P_in_meta");

  // --- preconditions / max-length vectors (CAP-21) ---
  if (tx) {
    hist("ops_per_tx", bucket(ops.length, [1, 2, 5, 10, 50, 99, 100]));
    if (ops.length === 100) rec("maxlen.100_ops");
    const memo = tx.memo;
    if (memo && typeof memo === "object" && memo.text !== undefined && Buffer.byteLength(memo.text) === 28) rec("maxlen.memo_text_28_bytes");
    const v2 = tx.cond?.v2;
    if (v2) {
      rec("precond.v2");
      if ((v2.extra_signers ?? []).length === 2) rec("maxlen.extra_signers_2");
      if (v2.min_seq_num != null) rec("precond.min_seq_num");
      if (v2.ledger_bounds) rec("precond.ledger_bounds");
    }
    const sigs = (env.tx?.signatures ?? env.tx_fee_bump?.tx?.inner_tx?.tx?.signatures ?? env.tx_v0?.signatures ?? []).length;
    if (sigs === 20) rec("maxlen.20_signatures");
  }

  // --- offer IDs (js-stellar-sdk #1785 offer-ID half) ---
  visit(meta, (o, k) => { if (k === "offer_id" && typeof o === "string") max("offer_id", BigInt(o)); });

  // --- Soroban: auth trees (CAP-46-11; XDRL002 / wallet-backend#820 walkInvocation) ---
  let soroban = false, maxDepth = 0, maxNodes = 0, deployInAuth = false;
  for (const op of ops) {
    const ihf = op.body?.invoke_host_function;
    if (!ihf) continue;
    soroban = true;
    const hf = ihf.host_function ?? {};
    if (hf.invoke_contract) {
      const fn = hf.invoke_contract.function_name;
      if (fn === "trust") rec("sac.invoke_trust_fn (CAP-73 candidate)");
      for (const a of hf.invoke_contract.args ?? []) max("scval_depth.invoke_args", scvalDepth(a));
    }
    if (hf.create_contract || hf.create_contract_v2) rec("soroban.create_contract_op");
    for (const a of ihf.auth ?? []) {
      maxDepth = Math.max(maxDepth, authDepth(a.root_invocation));
      maxNodes = Math.max(maxNodes, authNodes(a.root_invocation));
      if (authHasDeploy(a.root_invocation)) deployInAuth = true;
      if (a.credentials && a.credentials !== "source_account") rec("auth.address_credentials");
    }
  }
  if (soroban) {
    rec("soroban.tx");
    if (String(tx?.source_account)[0] === "M" || ops.some((op) => String(op.source_account)[0] === "M")) rec("muxed.source_on_soroban_tx (#716 producer 1)");
    if (maxDepth) {
      hist("auth_tree_depth", String(maxDepth));
      max("auth_tree_depth", maxDepth); max("auth_tree_nodes", maxNodes);
      if (maxDepth >= 2) rec("auth.depth_ge_2");
      if (maxDepth >= 3) rec("auth.depth_ge_3 (corpus cap46-11 shape)");
      if (maxDepth >= 4) rec("auth.depth_ge_4");
    }
    if (deployInAuth) rec("auth.contains_create_contract (contract_deploy.go walkInvocation input)");
  }

  // --- trustline created inside a Soroban tx (wallet-backend #731 shape) ---
  if (soroban && mv) {
    let created = false;
    visit(mv, (o) => { if (o && typeof o === "object" && o.created?.data?.trustline) created = true; });
    if (created) {
      rec("soroban.creates_trustline (#731 shape)");
      for (const op of ops) if (op.body?.invoke_host_function?.host_function?.invoke_contract?.function_name === "trust") { rec("sac.trust_creates_trustline (#731 exact)"); break; }
    }
  }

  // --- ScMap key collisions after native conversion (js-stellar-sdk #1789) ---
  let collide = false, mixed = false;
  visit({ env, mv }, (o) => {
    if (!o || typeof o !== "object" || !Array.isArray(o.map) || Object.keys(o).length !== 1) return;
    const keys = o.map.map((e) => e?.key).filter(Boolean);
    const types = new Set(keys.map((k) => (k && typeof k === "object" ? Object.keys(k)[0] : String(k))));
    if (types.size > 1) mixed = true;
    const seen = new Set();
    for (const k of keys) { const nk = nativeKey(k); if (seen.has(nk)) collide = true; seen.add(nk); }
  });
  if (mixed) rec("scmap.mixed_key_types");
  if (collide) rec("scmap.key_collision_after_native (#1789 shape)");

  // --- liquidity pools: issuer order by strkey text vs XDR bytes (js-stellar-sdk #1766) ---
  visit({ env, mv }, (o) => {
    if (!o || typeof o !== "object" || !o.asset_a || !o.asset_b) return;
    const ka = Object.keys(o.asset_a)[0], kb = Object.keys(o.asset_b)[0];
    if (ka !== kb || ka === "native" || typeof o.asset_a === "string") return;
    const a = o.asset_a[ka], b = o.asset_b[kb];
    if (a.asset_code !== b.asset_code || a.issuer === b.issuer) return;
    rec("pool.same_code_different_issuer");
    const text = a.issuer < b.issuer, bytes = Buffer.compare(strkeyBytes(a.issuer), strkeyBytes(b.issuer)) < 0;
    if (text !== bytes) rec("pool.issuer_text_order_differs_from_bytes (#1766 shape)");
    return false;
  });

  // --- events: CAP-67 unified events on classic ops; muxed in events ---
  if (metaVer) hist("transaction_meta_version", metaVer);
  if (m.v4) {
    let classicEv = 0, toMuxed = false, muxedTopic = false;
    m.v4.operations?.forEach((om, i) => {
      const t = ops[i] ? opType(ops[i]) : "?";
      for (const ev of om.events ?? []) {
        const body = ev.body?.v0 ?? {};
        if (t !== "invoke_host_function") { classicEv++; const s0 = body.topics?.[0]?.symbol; if (s0) hist("cap67_classic_op_event_topic", s0); }
        const tm = Array.isArray(body.data?.map) ? body.data.map.find((e) => e.key?.symbol === "to_muxed_id") : null;
        if (tm) { toMuxed = true; hist("cap67_to_muxed_id_value_type", Object.keys(tm.val ?? {})[0] ?? String(tm.val)); }
        max("scval_depth.events", Math.max(scvalDepth(body.data), ...(body.topics ?? []).map(scvalDepth)));
        if ((body.topics ?? []).some((x) => typeof x.address === "string" && x.address[0] === "M")) muxedTopic = true;
      }
    });
    if (classicEv) { rec("cap67.classic_op_events", classicEv); rec("cap67.tx_with_classic_op_events"); }
    if (toMuxed) rec("cap67.transfer_with_to_muxed_id");
    if (muxedTopic) rec("event.topic_is_M_address (#716 producer 2 shape)");
  }
  return { soroban, anyMuxed };
}
