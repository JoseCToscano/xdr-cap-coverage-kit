// Snapshot of the live checker from its public status.json.
//   node tools/livecheck/snapshot.mjs [--url URL | --file status.json] [--candidates]
// Writes reports/livecheck/live-pubnet-status.json (the exact input) and
// reports/livecheck/live-pubnet-snapshot.md (rendered from it, nothing else).
// --candidates also writes one corpus candidate per first-seen arm to
// corpus/candidates/livecheck/pubnet-live/, re-reading its ledger from the archive.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./check.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const file = arg("--file");
const url = arg("--url", "https://status.xck-status.dev/status.json");
const S = file ? JSON.parse(readFileSync(file, "utf8")) : await (await fetch(url)).json();

const n = (x) => Number(x).toLocaleString("en-US");
const cst = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).replace(",", "") + " CST";
const utc = (sec) => new Date(sec * 1000).toISOString().replace(".000Z", "Z");
const short = (h) => `\`${h.slice(0, 12)}…\``;
const caps = (c) => (c && c.length ? c.join(", ") : "–");
const C = S.checker, R = S.readers, F = S.flags, T = S.flagged_txs;

const out = [];
out.push("# Live checker: pubnet (live)", "");
out.push(`Snapshot of the live checker on pubnet, rendered by \`node tools/livecheck/snapshot.mjs\` from its public [status.json](https://status.xck-status.dev/status.json) (copy: [live-pubnet-status.json](live-pubnet-status.json)). Status generated ${cst(S.generated_at)} (${S.generated_at}). Started ${cst(C.started_at)} at ledger ${C.first}; cursor ${C.cursor}; restarts ${C.restarts}.`, "");
out.push("| | |", "|---|---|");
out.push(`| Ledgers checked | ${n(C.ledgers)} (${C.first} to ${C.cursor}), every ledger in order |`);
out.push(`| Close times | ${utc(C.close_time_min)} to ${utc(C.close_time_max)} |`);
out.push(`| Protocol | ${Object.entries(C.protocol).map(([p, k]) => `${p}: ${n(k)}`).join(", ")} |`);
out.push(`| Transactions | ${n(C.txs)} |`);
out.push(`| Segments compared (ledger + envelopes + result metas), 3 readers each | ${n(C.segments)} |`);
out.push(`| Checker time | ${C.worker_hours} worker-hours |`);
if (C.lag) out.push(`| Lag at snapshot | ${C.lag.ledgers_behind} ledgers (${C.lag.minutes_behind} min) behind the network tip |`);
if (C.host_pauses) out.push(`| Host pauses | ${C.host_pauses.count} (${n(C.host_pauses.total_s)} s in total); the follower resumes from the archive, so no ledger is skipped |`);
out.push("", "## Readers", "", "| Reader | Library | Decoded | Byte round-trip |", "|---|---|---|---|");
for (const r of Object.values(R)) out.push(`| ${r.name} | ${r.lib} | ${n(r.ledgers_ok)} | ${n(r.roundtrip_ok)}${r.json_roundtrip_ok != null ? ` (SEP-51 JSON → XDR: ${n(r.json_roundtrip_ok)})` : ""} |`);
const meaning = {
  decode_failure: "a reader could not decode the ledger (localized per transaction)",
  disagreement: "readers decoded the same bytes to different canonical values",
  roundtrip_mismatch: "decode then encode was not byte-identical (Rust also checks SEP-51 JSON back to XDR)",
  js_precision: "a 64-bit value at or above 2^53 surfaced as a JS number in the SDK's high-level objects",
  first_seen: "union arm never seen in the mainnet baseline",
  long_tail: "union arm seen in fewer than 100 per million baseline mainnet transactions",
  bug_shape: "transaction has a shape behind a reproduced bug (frequency-study detectors)",
  shape_first_seen: "corpus / bug shape with no transaction in the baseline",
};
out.push("", "## Flags", "", "| Flag | Count | Distinct txs | Meaning |", "|---|---|---|---|");
for (const k of Object.keys(meaning)) out.push(`| \`${k}\` | ${n(F[k] ?? 0)} | ${n(T[k] ?? 0)} | ${meaning[k]} |`);
const bad = ["decode_failure", "disagreement", "roundtrip_mismatch", "js_precision"].filter((k) => F[k]);
out.push("", bad.length ? `Reader findings: ${bad.map((k) => `${k} ${F[k]}`).join(", ")}.` : "No decode failures, disagreements, round-trip mismatches or JS precision hazards.");
out.push("", `## Bug shapes (${S.bug_shapes.length})`, "", "| Shape | Txs | CAP (inferred) | Latest example txs |", "|---|---|---|---|");
for (const b of S.bug_shapes) out.push(`| \`${b.shape}\` | ${n(b.txs)} | ${caps(b.caps)} | ${b.recent.slice(0, 3).map((e) => `${short(e.tx)} (L${e.ledger})`).join(", ")} |`);
out.push("", `## First-seen arms (${S.first_seen.length})`, "", "Union arms the 83,500-ledger mainnet baseline never contained. Each has a corpus candidate in [corpus/candidates/livecheck/pubnet-live](../../corpus/candidates/livecheck/pubnet-live).", "",
  "| Arm | Tx | Ledger | Close time (UTC) | CAP (inferred) |", "|---|---|---|---|---|");
for (const f of S.first_seen) out.push(`| \`${f.arm}\` | ${short(f.tx)} | ${f.ledger} | ${utc(f.close_time)} | ${caps(f.caps)} |`);
const lt = S.long_tail;
out.push("", `## Long-tail arms (${lt.arms})`, "", `${n(lt.flags)} flags on ${n(lt.txs)} transactions.`, "", "| Arm | Txs | CAP (inferred) | Example tx |", "|---|---|---|---|");
for (const a of [...lt.top].sort((x, y) => x.txs - y.txs || x.arm.localeCompare(y.arm))) out.push(`| \`${a.arm}\` | ${n(a.txs)} | ${caps(a.caps)} | ${short(a.example.tx)} (L${a.example.ledger}) |`);

writeFileSync(join(ROOT, "reports/livecheck/live-pubnet-status.json"), JSON.stringify(S, null, 1) + "\n");
writeFileSync(join(ROOT, "reports/livecheck/live-pubnet-snapshot.md"), out.join("\n") + "\n");
if (argv.includes("--candidates")) {
  const { createChecker } = await import("./check.mjs");
  const { fetchObject, lcmOf } = await import("./lake.mjs");
  const { writeCandidate } = await import("./candidates.mjs");
  const net = S.net ?? "pubnet", dir = join(ROOT, "corpus/candidates/livecheck", `${net}-live`);
  const c = await createChecker({ net });
  for (const f of S.first_seen) {
    const obj = await fetchObject(net, f.ledger); if (!obj) { console.log(`ledger ${f.ledger} not in the archive yet`); continue; }
    const lcm = lcmOf(obj), r = await c.check(f.ledger, lcm);
    const segments = Object.entries(r.segOf).filter(([, h]) => h === f.tx).map(([s]) => s);
    const flags = [{ type: "first_seen", arm: f.arm, tx: f.tx, ledger: f.ledger, segments, caps: f.caps }];
    console.log(await writeCandidate(dir, c, { net, seq: f.ledger, lcm, closeTime: r.close_time, tx: f.tx, segments, flags, caps: [...f.caps].sort() }));
  }
  c.close();
}
console.log(`snapshot: ${n(C.ledgers)} ledgers, ${n(C.txs)} txs, generated ${cst(S.generated_at)}`);
process.exit(0);
