// Renders reports/frequency.md from reports/raw/frequency.json (pure function,
// so `run.mjs --check` can verify the markdown offline).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newAcc, mergeAcc } from "./acc.mjs";

const fmt = (n) => Number(n).toLocaleString("en-US");
const perM = (n, d) => (d ? (1e6 * n) / d : 0);
const rate = (n, d) => { const r = perM(n, d); return r === 0 ? "0" : r >= 100 ? fmt(Math.round(r)) : r >= 1 ? r.toFixed(1) : r.toFixed(2); };
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(n && (100 * n) / d < 0.1 ? 3 : 1)}%` : "-");
const day = (t) => (t ? new Date(t * 1000).toISOString().slice(0, 10) : "-");
const short = (h) => `\`${h.slice(0, 10)}…\``;
const ex = (s, net) => (s?.ex?.[0] ? `[${short(s.ex[0].tx)}](https://stellar.expert/explorer/${net === "pubnet" ? "public" : "testnet"}/tx/${s.ex[0].tx}) (L${s.ex[0].ledger})` : "-");

// Shapes behind the reproduced bugs and the corpus entries. kind: shape | arm.
export const BUGS = [
  { bug: "wallet-backend #729 (P signer halts ingestion) / #716 producer 3", keys: [["shape", "p_signer.set_options_adds_P (#729 trigger)"], ["shape", "p_signer.account_entry_with_P_in_meta"], ["shape", "p_signer.in_envelope"], ["shape", "p_signer.payload_64_bytes (max)"], ["arm", "SignerKey.ed25519_signed_payload"]], entry: ["cap40-setoptions-signed-payload-signer", "mainnet-cap21-40-extra-signers-signed-payload"] },
  { bug: "wallet-backend #716 classic control (muxed participants)", keys: [["shape", "muxed.envelope_any"], ["arm", "MuxedAccount.muxed_ed25519"], ["shape", "muxed.tx_source"], ["shape", "muxed.op_source"], ["shape", "muxed.fee_bump_source"], ["shape", "muxed.source_on_soroban_tx (#716 producer 1)"]], entry: ["cap27-payment-muxed-max-id-to-muxed-zero-id", "mainnet-cap27-muxed-id-above-2-53"] },
  { bug: "wallet-backend #716 producer 2 (event topic holds an M address)", keys: [["shape", "event.topic_is_M_address (#716 producer 2 shape)"], ["arm", "ScAddress.muxed_account"]], entry: ["mainnet-cap67-event-data-muxed-address (M address in event data, not a topic)"] },
  { bug: "wallet-backend #731 (SAC trust() has no trustline state change)", keys: [["shape", "sac.trust_creates_trustline (#731 exact)"], ["shape", "sac.invoke_trust_fn (CAP-73 candidate)"], ["shape", "soroban.creates_trustline (#731 shape)"]], entry: ["cap73-sac-trust-creates-trustline", "mainnet-cap73-nested-sac-trust-creates-trustline"] },
  { bug: "js-stellar-sdk #1766 (pool issuers ordered by strkey text)", keys: [["shape", "pool.issuer_text_order_differs_from_bytes (#1766 shape)"], ["shape", "pool.same_code_different_issuer"]], entry: "cap38-pool-issuers-strkey-vs-bytes-order" },
  { bug: "js-stellar-sdk #1785 (muxed IDs above 2^53)", keys: [["shape", "muxed.id_ge_2^53 (JS-unsafe, #1785 shape)"], ["shape", "muxed.id_2^64-1"], ["shape", "muxed.id_zero"]], entry: ["cap27-payment-muxed-max-id-to-muxed-zero-id", "mainnet-cap27-muxed-id-above-2-53"] },
  { bug: "js-stellar-sdk #1789 (scValToNative drops colliding map keys)", keys: [["shape", "scmap.key_collision_after_native (#1789 shape)"], ["shape", "scmap.mixed_key_types"]], entry: "scval-map-key-collision" },
  { bug: "XDRL002 / wallet-backend#820 (uncapped walkInvocation in contract_deploy.go)", keys: [["shape", "auth.contains_create_contract (contract_deploy.go walkInvocation input)"], ["shape", "auth.depth_ge_3 (corpus cap46-11 shape)"], ["shape", "auth.depth_ge_4"]], entry: ["cap46-11-nested-auth-depth-3", "mainnet-cap46-11-auth-tree-depth-4", "mainnet-cap46-auth-root-deploys-contract"] },
  { bug: "CAP-67 unified events: classic-op events, muxed transfer", keys: [["shape", "cap67.tx_with_classic_op_events"], ["shape", "cap67.transfer_with_to_muxed_id"]], entry: "cap67-sac-transfer-to-muxed-account" },
  { bug: "CAP-21 max-length vectors", keys: [["shape", "maxlen.100_ops"], ["shape", "maxlen.memo_text_28_bytes"], ["shape", "maxlen.extra_signers_2"], ["shape", "precond.v2"]], entry: "cap21-preconditions-max-length-vectors" },
  { bug: "CAP-84 muxed contract W address (Protocol 30)", keys: [["arm", "ScAddress.muxed_contract"]], entry: "cap84-sac-transfer-to-muxed-contract" },
  { bug: "CAP-88 millisecond close time (Protocol 30)", keys: [["arm", "StellarValueExt.signed_ms"], ["arm", "StellarValueExt.empty_tx_set_ms"]], entry: "cap88-ledger-close-time-ms" },
];

function mergedPubnet(samples) {
  const pub = samples.filter((s) => s.net === "pubnet");
  if (!pub.length) return null;
  const acc = newAcc();
  for (const s of pub) mergeAcc(acc, JSON.parse(JSON.stringify({ totals: s.totals, arms: s.arms, shapes: s.shapes, hist: s.hist, max: s.max })));
  return { name: "pubnet (all)", net: "pubnet", ...acc };
}
const get = (s, kind, key) => s?.[kind === "arm" ? "arms" : "shapes"]?.[key];
const cell = (s, kind, key) => {
  const v = get(s, kind, key);
  if (!v) return "0";
  if (v.txs === 0) return `${fmt(v.ledgers)} ledgers`;
  return `${fmt(v.txs)} (${rate(v.txs, s.totals.txs)}/M)`;
};

export function render(raw, root = ".") {
  const S = raw.samples;
  const P = mergedPubnet(S);
  const byName = Object.fromEntries(S.map((s) => [s.name, s]));
  const cov = JSON.parse(readFileSync(join(root, "reports/raw/coverage.json"), "utf8"));
  const corpusArms = new Map(); // "Type.arm" -> entry ids
  for (const u of cov.unions) for (const a of u.arms) corpusArms.set(`${u.type}.${a.arm}`, a.entry);
  const universe = cov.unions.flatMap((u) => u.arms.map((a) => `${u.type}.${a.arm}`));

  let md = "# Real-network frequency study\n\n<!-- generated by tools/frequency/run.mjs from reports/raw/frequency.json; do not edit -->\n\n";
  md += "How often each XDR union arm, and each shape behind the corpus entries and the reproduced bugs, occurs in real `LedgerCloseMeta`. Every number below is a count over the ledgers listed in the sample table, measured by `node tools/frequency/run.mjs`; nothing is extrapolated. Rates are transactions containing the shape per million transactions in that sample (all transactions in `tx_processing`, failed ones included).\n\n";
  md += "## Sample\n\n| Sample | Network | Ledgers | Ranges | Close dates (UTC) | Protocols | Transactions | Successful | Soroban txs |\n|---|---|---|---|---|---|---|---|---|\n";
  for (const s of S) {
    const rg = s.ranges.length > 3 ? `${s.ranges.length} ranges of ${fmt(s.ranges[0][1] - s.ranges[0][0] + 1)}, ${fmt(s.ranges[0][0])}–${fmt(s.ranges.at(-1)[1])}` : s.ranges.map(([a, b]) => `${fmt(a)}–${fmt(b)}`).join(", ");
    md += `| ${s.name} | ${s.net} | ${fmt(s.totals.ledgers)}${s.missing_chunks.length ? ` (of ${fmt(s.planned_ledgers)})` : ""} | ${rg} | ${day(s.totals.close_time_min)} to ${day(s.totals.close_time_max)} | ${Object.entries(s.hist.protocol).map(([p, n]) => `P${p}: ${fmt(n)}`).join(", ")} | ${fmt(s.totals.txs)} | ${fmt(s.totals.successful_txs)} | ${fmt(s.totals.soroban_txs)} |\n`;
  }
  if (P) md += `| **pubnet (all)** | pubnet | ${fmt(P.totals.ledgers)} | | ${day(P.totals.close_time_min)} to ${day(P.totals.close_time_max)} | ${Object.entries(P.hist.protocol).map(([p, n]) => `P${p}: ${fmt(n)}`).join(", ")} | ${fmt(P.totals.txs)} | ${fmt(P.totals.successful_txs)} | ${fmt(P.totals.soroban_txs)} |\n`;
  md += `\nSource: SDF's Galexie export on AWS Open Data (\`s3://aws-public-blockchain/v1.1/stellar/ledgers/{pubnet,testnet/2025-12-18}\`), one ledger per object. Decoder: ${raw.xdr}. Every envelope is attributed to its transaction by hash (Go \`network.HashTransactionInEnvelope\`), and each ledger's hashes were checked to match its \`tx_processing\` results one for one (${S.reduce((n, s) => n + s.totals.unmatched_envelopes, 0)} unmatched).\n\n`;

  md += "## Bug and corpus shapes on the real network\n\n";
  const cols = [P, ...S].filter(Boolean);
  md += `| Reproduced bug / corpus shape | Shape measured | ${cols.map((c) => c.name).join(" | ")} | First seen (pubnet) | Example (pubnet) |\n|---|---|${cols.map(() => "---|").join("")}---|---|\n`;
  for (const b of BUGS) for (const [i, [kind, key]] of b.keys.entries()) {
    md += `| ${i === 0 ? `${b.bug}<br>corpus: ${[].concat(b.entry).map((e) => `\`${e}\``).join(", ")}` : ""} | \`${key}\` | ${cols.map((c) => cell(c, kind, key)).join(" | ")} | ${get(P, kind, key)?.first ? `L${fmt(get(P, kind, key).first)}` : "-"} | ${ex(get(P, kind, key), "pubnet")} |\n`;
  }
  const mo = P?.max?.offer_id;
  if (mo) md += `\nLargest offer ID seen on pubnet: ${fmt(mo.value)} (L${fmt(mo.ledger)}); 2^53 = 9,007,199,254,740,992, so the offer-ID half of #1785 has ${BigInt(mo.value) >= 2n ** 53n ? "been reached" : "not been reached"} on mainnet.\n`;
  for (const k of ["auth_tree_depth", "auth_tree_nodes", "scval_depth.invoke_args", "scval_depth.events"]) if (P?.max?.[k]) md += `\nMax \`${k}\` on pubnet: ${P.max[k].value} (tx ${short(P.max[k].tx)}, L${fmt(P.max[k].ledger)}).`;
  md += "\n\n";

  // Histograms
  md += "## Distributions (pubnet, all samples)\n\n";
  const HL = { auth_tree_depth: "max depth per Soroban tx with auth entries", cap67_classic_op_event_topic: "events emitted by classic operations, by first topic", cap67_to_muxed_id_value_type: "events carrying to_muxed_id, by ScVal type: u64 = muxed destination or memo id, string = memo text, bytes = memo hash", lcm_version: "ledgers", protocol: "ledgers" };
  for (const h of ["auth_tree_depth", "ops_per_tx", "cap67_classic_op_event_topic", "cap67_to_muxed_id_value_type", "transaction_meta_version", "lcm_version"]) {
    const H = P?.hist?.[h]; if (!H) continue;
    const tot = Object.values(H).reduce((a, b) => a + b, 0);
    const keys = Object.keys(H).sort((a, b) => (h === "auth_tree_depth" ? Number(a) - Number(b) : H[b] - H[a]));
    const lab = (k) => (h === "cap67_to_muxed_id_value_type" && k === "0" ? "void" : k); // detector keyed the bare "void" ScVal as "0"
    md += `**${h}** (${HL[h] ?? "transactions"}): ${keys.map((k) => `${lab(k)}: ${fmt(H[k])} (${pct(H[k], tot)})`).join(", ")}\n\n`;
  }

  // Arms
  const pubArms = P?.arms ?? {};
  const observed = universe.filter((k) => pubArms[k]);
  const never = universe.filter((k) => !pubArms[k]);
  const txArms = observed.filter((k) => pubArms[k].txs > 0);
  const tail = txArms.filter((k) => perM(pubArms[k].txs, P.totals.txs) < 100).sort((a, b) => pubArms[a].txs - pubArms[b].txs || (a < b ? -1 : 1));
  const inCorpus = (k) => (corpusArms.get(k) ?? []).length > 0;
  md += `## Union arms\n\nUniverse: the ${universe.length} union arms of \`reports/coverage.md\`. On pubnet ${observed.length} of ${universe.length} arms occur in the sample; ${never.length} never do. The corpus covers ${universe.filter(inCorpus).length} arms at entry scope.\n\n`;
  md += `| | Arms | In corpus (entry scope) |\n|---|---|---|\n`;
  md += `| Seen on pubnet, in transactions | ${txArms.length} | ${txArms.filter(inCorpus).length} |\n`;
  md += `| Seen on pubnet, ledger-level only (header, upgrades, SCP info) | ${observed.length - txArms.length} | ${observed.filter((k) => pubArms[k].txs === 0).filter(inCorpus).length} |\n`;
  md += `| Long tail: in < 100 per million pubnet txs | ${tail.length} | ${tail.filter(inCorpus).length} |\n`;
  md += `| Never seen on pubnet | ${never.length} | ${never.filter(inCorpus).length} |\n\n`;
  md += `### (a) Long tail: arms that occur on mainnet but in fewer than 100 per million transactions\n\nRare enough that a decoder or indexer can ship without ever meeting one in testing, common enough to arrive in production. Sorted rarest first.\n\n`;
  md += `| Arm | pubnet txs | per M txs | Ledgers | First seen | In corpus | Example |\n|---|---|---|---|---|---|---|\n`;
  for (const k of tail) { const v = pubArms[k]; md += `| \`${k}\` | ${fmt(v.txs)} | ${rate(v.txs, P.totals.txs)} | ${fmt(v.ledgers)} | L${fmt(v.first)} | ${inCorpus(k) ? (corpusArms.get(k)).map((e) => `\`${e}\``).join(", ") : "no"} | ${ex(v, "pubnet")} |\n`; }
  md += `\n### (b) Corpus arms vs observed frequency\n\nEvery arm the corpus covers at entry scope, with how often it occurs on pubnet and testnet.\n\n`;
  const T = S.find((s) => s.net === "testnet");
  md += `| Arm | Corpus entries | pubnet txs (per M) | testnet txs (per M) |\n|---|---|---|---|\n`;
  for (const k of universe.filter(inCorpus).sort((a, b) => (pubArms[a]?.txs ?? 0) - (pubArms[b]?.txs ?? 0) || (a < b ? -1 : 1))) {
    const c = (s) => { const v = s?.arms?.[k]; return !v ? "0" : v.txs ? `${fmt(v.txs)} (${rate(v.txs, s.totals.txs)})` : `${fmt(v.ledgers)} ledgers`; };
    md += `| \`${k}\` | ${corpusArms.get(k).length} | ${c(P)} | ${c(T)} |\n`;
  }
  md += `\n### (c) Arms never seen on pubnet\n\nLower priority for production indexers today: ${never.length} arms with no occurrence in ${fmt(P?.totals.ledgers ?? 0)} pubnet ledgers. Grouped by type; arms that do occur on the testnet sample are marked \`(t)\`, arms in the corpus \`(c)\`.\n\n`;
  const byType = {};
  for (const k of never) { const [t, a] = k.split("."); (byType[t] ??= []).push(`${a}${T?.arms?.[k] ? " (t)" : ""}${inCorpus(k) ? " (c)" : ""}`); }
  md += `| Type | Never-seen arms |\n|---|---|\n`;
  for (const t of Object.keys(byType).sort()) md += `| \`${t}\` | ${byType[t].join(", ")} |\n`;

  md += `\n## Full arm counts\n\nPer-sample counts for every union arm and enum value seen, with first-seen ledger and up to three example transactions, are in \`reports/raw/frequency.json\` (\`samples[].arms\`, \`samples[].shapes\`).\n\n`;
  md += "## Method and limits\n\n";
  md += "- Each ledger is decoded once by the reference implementation and walked by the same schema walker that produces `reports/coverage.md` (`tools/xdr-walk.mjs`), so arm names and the 376-arm universe are identical. Envelope and result subtrees are attributed to their transaction; header, upgrade and SCP arms count ledgers only.\n";
  md += "- Shapes that are not a single union arm (muxed-ID ranges, P signers, auth-tree depth, map-key collisions, pool issuer order, SAC `trust()`, classic-op events) are detected in `tools/frequency/shapes.mjs`; each detector's rule is in that file.\n";
  md += "- `sac.invoke_trust_fn` matches any contract function named `trust`; it does not confirm the contract is a Stellar Asset Contract. `sac.trust_creates_trustline` additionally requires a trustline `created` change in the same transaction.\n";
  md += "- `sac.invoke_trust_fn` and `sac.trust_creates_trustline (#731 exact)` look only at the top-level `invoke_contract` function name, so they undercount. All 7 `soroban.creates_trustline` transactions on pubnet call SAC `trust()` as a sub-invocation in the authorization tree (under `batch`, `swap_split` or `swap_bridge`), so the #731 shape itself occurred 7 times in the pubnet sample. Each was checked by hand and replayed through wallet-backend: see `reports/replay-mainnet.md`.\n";
  md += "- `pubnet-spread` is a systematic sample (every 100,000th ledger window), not a random one; `pubnet-recent` is one contiguous window. Rates describe these ledgers; they are not network-wide estimates.\n";
  md += "- Corpus entries are testnet ledgers except the `mainnet-*` entries, which are mainnet transactions this study found; mainnet is on Protocol 29 in this sample, so Protocol 30 arms (CAP-84, CAP-88) can only appear on testnet.\n";
  return md;
}
