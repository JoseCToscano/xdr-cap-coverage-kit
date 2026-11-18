// Backfill: run the differential checker over cached / archived ledger ranges.
//   node tools/livecheck/backfill.mjs [--range A-B ...] [--every FROM:TO:STEP:LEN] [--name spread] [--workers N] [--net pubnet]
//   node tools/livecheck/backfill.mjs --report [--name spread]   merge .work/ into reports/livecheck/backfill[-name].{md,json}
// Per-chunk results go to tools/livecheck/.work/<net>/<start>.json, so a run resumes.
import { fork } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { cpus } from "node:os";
import { ROOT } from "./check.mjs";
import { newSummary, mergeSummary } from "./summary.mjs";
import { renderBackfill } from "./report.mjs";

const HERE = new URL(".", import.meta.url).pathname;
const WORK = join(HERE, ".work");
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const net = arg("--net", "pubnet");
const CHUNK = Number(arg("--chunk", 250));
const NAME = arg("--name", ""); // separate sample (e.g. "spread"): own work dir and report
const WDIR = join(WORK, NAME ? `${net}-${NAME}` : net);
const OUT = join(ROOT, "reports/livecheck", NAME ? `backfill-${NAME}` : "backfill");

// --candidates: one corpus candidate per flagged arm / shape (first example) and
// every reader finding, written to corpus/candidates/livecheck/<net>[-name]/.
if (argv.includes("--candidates")) {
  const { createChecker } = await import("./check.mjs");
  const { fetchObject, lcmOf } = await import("./lake.mjs");
  const { writeCandidate } = await import("./candidates.mjs");
  const raw = JSON.parse(readFileSync(OUT + ".json", "utf8"));
  const dir = join(ROOT, "corpus/candidates/livecheck", NAME ? `${net}-${NAME}` : net);
  const c = await createChecker({ net });
  const picks = [];
  for (const [k, a] of Object.entries(raw.summary.arms)) { const e = a.examples[0]; if (e) picks.push({ ...e, flags: [{ type: a.class, [a.class.includes("shape") ? "shape" : "arm"]: k, caps: a.caps }] }); }
  for (const f of raw.summary.details) if (f.tx) picks.push({ tx: f.tx, ledger: f.ledger, segments: [f.segment], flags: [f] });
  let n = 0;
  for (const p of picks) {
    const obj = await fetchObject(net, p.ledger); if (!obj) continue;
    const lcm = lcmOf(obj);
    const r = await c.check(p.ledger, lcm);
    const segs = Object.entries(r.segOf).filter(([, h]) => h === p.tx).map(([s]) => s);
    await writeCandidate(dir, c, { net, seq: p.ledger, lcm, closeTime: r.close_time, tx: p.tx, segments: segs, flags: p.flags, caps: [...new Set(p.flags.flatMap((f) => f.caps ?? []))].sort() });
    n++;
  }
  c.close();
  console.log(`wrote ${n} candidates to ${dir}`);
  process.exit(0);
}

if (process.argv[1].endsWith("backfill.mjs") && !argv.includes("--worker")) {
  if (!argv.includes("--report")) {
    const ranges = argv.flatMap((a, i) => (argv[i - 1] === "--range" ? [a.split("-").map(Number)] : []));
    const ev = arg("--every"); if (ev) { const [f, t, st, len] = ev.split(":").map(Number); for (let a = f; a <= t; a += st) ranges.push([a, a + len - 1]); }
    if (!ranges.length) ranges.push([65450000, 65499999]);
    const jobs = [];
    for (const [a, b] of ranges) for (let x = a; x <= b; x += CHUNK) {
      const out = join(WDIR, `${x}.json`);
      if (!existsSync(out)) jobs.push({ net, start: x, count: Math.min(CHUNK, b - x + 1), out });
    }
    const W = Number(arg("--workers", Math.max(1, Math.min(5, cpus().length - 2))));
    console.log(`${jobs.length} chunks to check with ${W} workers`);
    const t0 = Date.now(); let done = 0, ledgers = 0;
    await new Promise((res) => {
      let live = 0;
      const next = (w) => { const j = jobs.shift(); if (!j) { w.send("exit"); if (--live === 0) res(); return; } w.send(j); };
      for (let i = 0; i < Math.min(W, jobs.length); i++) {
        const w = fork(new URL(import.meta.url).pathname, ["--worker"]); live++;
        w.on("message", (m) => {
          if (m.ready) return next(w);
          if (m.ok) { done++; ledgers += m.job.count; console.log(`done ${m.job.start} +${m.job.count} (${m.ms} ms, ${m.flags}) ${done} chunks, ${(ledgers / ((Date.now() - t0) / 1000)).toFixed(2)} ledgers/s`); }
          else { console.log(`FAIL ${m.job.start}: ${m.error.split("\n")[0]}`); }
          next(w);
        });
      }
      if (!jobs.length) res();
    });
  }
  // Merge.
  const dir = WDIR;
  const S = newSummary(); let chunks = 0;
  for (const f of existsSync(dir) ? readdirSync(dir).filter((x) => x.endsWith(".json")).sort() : []) { mergeSummary(S, JSON.parse(readFileSync(join(dir, f), "utf8"))); chunks++; }
  S.details.sort((a, b) => a.ledger - b.ledger);
  mkdirSync(join(ROOT, "reports/livecheck"), { recursive: true });
  const raw = { generated_by: "tools/livecheck/backfill.mjs", net, name: NAME || "recent", chunks, summary: S };
  writeFileSync(OUT + ".json", JSON.stringify(raw, null, 1) + "\n");
  writeFileSync(OUT + ".md", renderBackfill(raw));
  console.log(`merged ${chunks} chunks (${S.ledgers} ledgers, ${S.txs} txs) -> ${OUT}.{md,json}`);
}

if (argv.includes("--worker")) {
  const { createChecker } = await import("./check.mjs");
  const { fetchObject, lcmOf } = await import("./lake.mjs");
  const { newSummary: ns, addResult } = await import("./summary.mjs");
  const checkers = {};
  process.on("message", async (job) => {
    if (job === "exit") { for (const c of Object.values(checkers)) c.close(); process.exit(0); }
    const t0 = Date.now();
    try {
      const c = (checkers[job.net] ??= await createChecker({ net: job.net }));
      const S = ns(); const missing = [];
      const ahead = new Map();
      const want = (i) => { if (i < job.count && !ahead.has(i)) ahead.set(i, fetchObject(job.net, job.start + i)); };
      for (let i = 0; i < 8; i++) want(i);
      for (let i = 0; i < job.count; i++) {
        want(i + 8);
        const seq = job.start + i; const obj = await ahead.get(i); ahead.delete(i);
        if (!obj) { missing.push(seq); continue; }
        let r;
        try { r = await c.check(seq, lcmOf(obj)); }
        catch (e) { S.details.push({ type: "checker_error", ledger: seq, err: String(e.stack ?? e).slice(0, 500) }); S.flag_counts.checker_error = (S.flag_counts.checker_error ?? 0) + 1; continue; }
        addResult(S, r);
      }
      S.missing = missing;
      mkdirSync(dirname(job.out), { recursive: true });
      writeFileSync(job.out + ".tmp", JSON.stringify(S)); renameSync(job.out + ".tmp", job.out);
      process.send({ ok: true, job, ms: Date.now() - t0, flags: JSON.stringify(S.flag_counts) });
    } catch (e) { process.send({ ok: false, job, error: String(e.stack ?? e).slice(0, 800) }); }
  });
  process.send({ ready: true });
}
