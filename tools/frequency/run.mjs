// Real-network frequency study: how often each XDR union arm and each corpus /
// bug shape actually occurs in real LedgerCloseMeta.
//
//   node tools/frequency/run.mjs [--workers N] [--only <sample>]   fetch + walk (network, resumable)
//   node tools/frequency/run.mjs --report                         rebuild the report from .work/ only
//   node tools/frequency/run.mjs --render                         rewrite reports/frequency.md from reports/raw/frequency.json
//                                                                 (offline; picks up corpus/coverage changes)
//   node tools/frequency/run.mjs --check                          fail if reports/frequency.md is stale
//                                                                 vs reports/raw/frequency.json (offline)
// Needs: node 24, Go (builds txhash once), the stellar CLI. Ledger objects are
// cached in $XCK_LCM_CACHE (default ~/.cache/xck-lcm; "off" disables).
// Per-chunk results go to tools/frequency/.work/ so an interrupted run resumes.
import { fork, execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { cpus } from "node:os";
import { newAcc, mergeAcc } from "./acc.mjs";
import { TXHASH, NETWORKS } from "./chunk.mjs";
import { render } from "./report.mjs";
import { rustXdrVersion } from "../lib.mjs";

const HERE = new URL(".", import.meta.url).pathname;
const ROOT = resolve(HERE, "../..");
const WORK = join(HERE, ".work");
const RAW = join(ROOT, "reports/raw/frequency.json"), MD = join(ROOT, "reports/frequency.md");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const plan = JSON.parse(readFileSync(join(HERE, "plan.json"), "utf8"));

function rangesOf(s) {
  if (s.ranges) return s.ranges;
  const r = []; for (let a = s.every.from; a <= s.every.to; a += s.every.step) r.push([a, a + s.every.len - 1]); return r;
}
function chunksOf(s) {
  const out = [];
  for (const [a, b] of rangesOf(s)) for (let x = a; x <= b; x += plan.chunk)
    out.push({ net: s.net, sample: s.name, start: x, count: Math.min(plan.chunk, b - x + 1), out: join(WORK, s.name, `${x}.json`) });
  return out;
}

if (process.argv.includes("--render")) {
  writeFileSync(MD, render(JSON.parse(readFileSync(RAW, "utf8")), ROOT));
  console.log(`wrote ${MD} from ${RAW}`); process.exit(0);
}

if (process.argv.includes("--check")) {
  const raw = JSON.parse(readFileSync(RAW, "utf8"));
  const md = render(raw, ROOT);
  if (readFileSync(MD, "utf8") !== md) { console.error("reports/frequency.md is stale: run node tools/frequency/run.mjs --report"); process.exit(1); }
  console.log("frequency report is fresh"); process.exit(0);
}

if (!process.argv.includes("--report")) {
  if (!existsSync(TXHASH)) execFileSync("go", ["build", "-o", TXHASH, "."], { cwd: join(HERE, "txhash"), stdio: "inherit" });
  const only = arg("--only");
  const pending = plan.samples.filter((s) => !only || s.name === only).flatMap(chunksOf).filter((c) => !existsSync(c.out));
  const W = Number(arg("--workers", Math.max(1, cpus().length - 1)));
  console.log(`${pending.length} chunks to do with ${W} workers`);
  const t0 = Date.now(); let done = 0, failed = [];
  const retries = new Map();
  await new Promise((res) => {
    let live = 0;
    const next = (w) => { const j = pending.shift(); if (!j) { w.send("exit"); if (--live === 0) res(); return; } w.send(j); };
    for (let i = 0; i < Math.min(W, pending.length); i++) {
      const w = fork(join(HERE, "worker.mjs")); live++;
      w.on("message", (m) => {
        if (m.ready) return next(w);
        if (m.ok) { done++; const rate = (done * plan.chunk) / ((Date.now() - t0) / 1000); console.log(`done ${m.job.sample} ${m.job.start} (${m.ms} ms) ${done}/${done + pending.length} ~${rate.toFixed(1)} ledgers/s`); }
        else {
          const n = (retries.get(m.job.out) ?? 0) + 1; retries.set(m.job.out, n);
          console.log(`FAIL ${m.job.sample} ${m.job.start}: ${m.error.split("\n")[0]}`);
          if (n < 3) pending.push(m.job); else failed.push(m.job);
        }
        next(w);
      });
    }
    if (!pending.length && live === 0) res();
  });
  console.log(`fetch+walk finished in ${((Date.now() - t0) / 1000).toFixed(0)} s; ${failed.length} chunks failed`);
}

// Merge chunk results per sample.
const samples = [];
for (const s of plan.samples) {
  const chunks = chunksOf(s);
  const have = chunks.filter((c) => existsSync(c.out));
  if (!have.length) continue;
  const acc = newAcc(); let ms = 0;
  for (const c of have) { const a = JSON.parse(readFileSync(c.out, "utf8")); ms += a.chunk?.ms ?? 0; delete a.chunk; mergeAcc(acc, a); }
  samples.push({ name: s.name, net: s.net, description: s.description, source: NETWORKS[s.net].archive,
    ranges: rangesOf(s), planned_ledgers: chunks.reduce((n, c) => n + c.count, 0), missing_chunks: chunks.filter((c) => !existsSync(c.out)).map((c) => c.start),
    worker_ms: ms, ...acc });
}
if (!samples.length) { console.error(`no chunk results under ${WORK}: nothing to report (use --render to rewrite the report from ${RAW})`); process.exit(1); }
const raw = { generated_by: "tools/frequency/run.mjs", xdr: rustXdrVersion(), plan, samples };
mkdirSync(join(ROOT, "reports/raw"), { recursive: true });
writeFileSync(RAW, JSON.stringify(raw, null, 1) + "\n");
writeFileSync(MD, render(raw, ROOT));
console.log(`wrote ${RAW} and ${MD}`);
