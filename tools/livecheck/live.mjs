// Live follower: polls SDF's public ledger archive (Galexie layout on AWS Open
// Data) for each new mainnet ledger as its object lands, runs the three-reader
// check on it, appends every flag to findings.jsonl, writes corpus candidates
// for flagged transactions, and keeps a rolling latest.md. The cursor is
// checkpointed after every ledger, so a restart resumes where it stopped.
//
//   node tools/livecheck/live.mjs [--net pubnet] [--dir ~/.local/share/xck-livecheck] [--from SEQ]
//
// Ledgers are fetched and checked by XCK_LIVE_WORKERS worker processes (default
// 3, each with its own JS checker and Go and Rust reader processes), up to
// XCK_LIVE_WINDOW ledgers ahead of the cursor, and committed strictly in order:
// no ledger is skipped, findings and candidates are written in ledger order, and
// first-seen is decided at commit time exactly as a single sequential reader
// would. Behind the tip this catches up several times faster than the network
// closes ledgers; at the tip it polls for the next object.
//
// Lag is measured, not assumed: every XCK_TIP_EVERY_S seconds (default 60) the
// network tip is read from Horizon (XCK_TIP_URL, default horizon.stellar.org)
// and state.json / latest.md record the cursor, the tip, ledgers and minutes
// behind (from the cursor ledger's own close time), the catch-up rate, and any
// host pauses (wall-clock gaps where the process did not run at all).
//
// Optional fallback: XCK_RPC_URL=<stellar rpc> uses getLedgers when the archive
// object has not appeared after XCK_RPC_AFTER_S seconds (default 120).
import { fork } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { fetchObject, lcmOf, urlOf } from "./lake.mjs";

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const net = arg("--net", "pubnet");
const RPC = process.env.XCK_RPC_URL;

async function rpcLedger(seq) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLedgers", params: { startLedger: seq, pagination: { limit: 1 }, xdrFormat: "base64" } }) });
  const j = await r.json(); const l = j.result?.ledgers?.find((x) => x.sequence === seq);
  return l ? Buffer.from(l.metadataXdr, "base64") : null;
}

// ---------------------------------------------------------------- worker ----
// Messages in: { job: seq, rpc } fetch + check; { seen: [arm] } extend the
// first-seen set; { cand: seq, list } write candidates for a committed ledger
// and drop its LCM; "exit". Messages out: { seq, r, source } | { seq, missing }
// | { seq, error } | { seq, fetchError }. Handled one at a time, in order.
if (argv.includes("--worker")) {
  const { createChecker } = await import("./check.mjs");
  const { writeCandidate } = await import("./candidates.mjs");
  const liveSeen = new Set(JSON.parse(process.env.XCK_LIVE_SEEN ?? "[]"));
  const checker = await createChecker({ net, liveSeen });
  const held = new Map();
  let chain = Promise.resolve();
  const handle = async (m) => {
    if (m === "exit") { checker.close(); process.exit(0); }
    if (m.seen) { for (const a of m.seen) liveSeen.add(a); return; }
    if (m.cand != null) {
      const h = held.get(m.cand); held.delete(m.cand);
      for (const c of m.list ?? []) {
        if (!h) { process.send({ log: `candidate ${c.tx}: LCM for ${m.cand} not held` }); continue; }
        try { await writeCandidate(m.dir, checker, { net, seq: m.cand, lcm: h, ...c }); }
        catch (err) { process.send({ log: `candidate ${c.tx}: ${err.message}` }); }
      }
      return;
    }
    const seq = m.job; let lcm = null, source = "archive";
    try {
      const obj = await fetchObject(net, seq, { cache: false, retries: 2 });
      if (obj) lcm = lcmOf(obj);
      else if (m.rpc && RPC) { lcm = await rpcLedger(seq); source = "rpc"; }
    } catch (e) { return process.send({ seq, fetchError: e.message }); }
    if (!lcm) return process.send({ seq, missing: true });
    try {
      const r = await checker.check(seq, lcm); delete r.txArms;
      held.set(seq, lcm);
      process.send({ seq, r, source });
    } catch (e) { process.send({ seq, error: String(e.stack ?? e).slice(0, 500), source }); }
  };
  process.on("message", (m) => { chain = chain.then(() => handle(m)).catch((e) => process.send({ log: `worker: ${e.message}` })); });
  process.send({ ready: true });
} else {
  await main();
}

// ------------------------------------------------------------------ main ----
async function main() {
  const { newSummary, addResult } = await import("./summary.mjs");
  const { renderSummary } = await import("./report.mjs");
  const DIR = arg("--dir", process.env.XCK_LIVE_DIR ?? join(homedir(), ".local/share/xck-livecheck", net));
  const POLL_MS = Number(process.env.XCK_POLL_MS ?? 2500);
  const RPC_AFTER = Number(process.env.XCK_RPC_AFTER_S ?? 120) * 1000;
  const W = Math.max(1, Number(process.env.XCK_LIVE_WORKERS ?? 3));
  const WINDOW = Math.max(W, Number(process.env.XCK_LIVE_WINDOW ?? W * 4));
  const TIP_URL = process.env.XCK_TIP_URL ?? (net === "pubnet" ? "https://horizon.stellar.org/" : "https://horizon-testnet.stellar.org/");
  const TIP_EVERY = Number(process.env.XCK_TIP_EVERY_S ?? 60) * 1000;
  const CAND_PER_ARM = 3, CAND_PER_TYPE = 50;
  mkdirSync(DIR, { recursive: true });
  const STATE = join(DIR, "state.json"), FINDINGS = join(DIR, "findings.jsonl"), MD = join(DIR, "latest.md"), CAND = join(DIR, "candidates");
  const log = (...a) => console.log(new Date().toISOString(), ...a);

  const exists = async (seq) => (await fetch(urlOf(net, seq), { method: "HEAD", signal: AbortSignal.timeout(15000) })).status === 200;
  async function findLatest(from) {
    let lo = from, step = 64;
    if (!(await exists(lo))) {
      while (!(await exists(lo - step))) step *= 2;
      let a = lo - step, b = lo; while (b - a > 1) { const m = Math.floor((a + b) / 2); if (await exists(m)) a = m; else b = m; } return a;
    }
    while (await exists(lo + step)) { lo += step; step *= 2; }
    let a = lo, b = lo + step; while (b - a > 1) { const m = Math.floor((a + b) / 2); if (await exists(m)) a = m; else b = m; }
    return a;
  }

  let state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : null;
  if (!state) {
    const guess = Number(arg("--from", 0)) || null;
    const latest = guess ? guess - 1 : await findLatest(65500000 + Math.floor((Date.now() / 1000 - 1794786037) / 5.9));
    state = { net, started_at: new Date().toISOString(), first: latest + 1, cursor: latest, summary: newSummary(), live_seen: [], cand: {}, restarts: 0 };
    log(`fresh start at ledger ${latest + 1}`);
  } else { state.restarts++; log(`resuming after ledger ${state.cursor} (restart #${state.restarts})`); }
  const liveSeen = new Set(state.live_seen);
  state.host_pauses ??= { count: 0, total_s: 0, last: null };
  let stop = false;
  for (const s of ["SIGTERM", "SIGINT"]) process.on(s, () => { stop = true; wake(); });

  // Network tip and lag.
  let tip = state.lag?.network_tip ?? null, tipAt = null, tipClosedAt = null, lastTipTry = 0;
  async function refreshTip() {
    lastTipTry = Date.now();
    try {
      const j = await (await fetch(TIP_URL, { signal: AbortSignal.timeout(10000) })).json();
      const t = Number(j.core_latest_ledger ?? j.history_latest_ledger);
      if (t > 0) { tip = t; tipAt = new Date().toISOString(); tipClosedAt = j.history_latest_ledger_closed_at ?? null; }
    } catch (e) { log(`tip ${TIP_URL}: ${e.message}`); }
  }
  const rate = []; // [ms, cursor] samples for the catch-up rate
  function lagNow() {
    const now = Date.now();
    rate.push([now, state.cursor]); while (rate.length > 2 && now - rate[0][0] > 10 * 60 * 1000) rate.shift();
    const [t0, c0] = rate[0];
    const perMin = now - t0 >= 30000 ? ((state.cursor - c0) * 60000) / (now - t0) : null;
    const ct = state.last?.close_time ?? null;
    const behind = tip != null ? Math.max(0, tip - state.cursor) : null;
    const net_per_min = 60 / 5.9; // ~10.2 ledgers/min closed by the network
    return {
      cursor: state.cursor, cursor_close_time: ct ? new Date(ct * 1000).toISOString() : null,
      network_tip: tip, network_tip_closed_at: tipClosedAt, tip_source: TIP_URL, tip_checked_at: tipAt,
      ledgers_behind: behind, minutes_behind: ct ? Math.round(((now / 1000 - ct) / 60) * 10) / 10 : null,
      catchup_ledgers_per_min: perMin != null ? Math.round(perMin * 10) / 10 : null,
      eta_to_tip_min: behind != null && perMin != null && perMin > net_per_min + 0.5 && behind > 12 ? Math.round(behind / (perMin - net_per_min)) : null,
      at_tip: behind != null ? behind <= 12 : null, // within ~1 minute of ledgers
      workers: W, measured_at: new Date(now).toISOString(),
    };
  }

  // Host pauses: the box this runs on can be suspended; a heartbeat that misses
  // by more than 30 s means the process did not run for that long.
  let beat = Date.now();
  setInterval(() => {
    const now = Date.now(), gap = now - beat; beat = now;
    if (gap > 30000) {
      const s = Math.round(gap / 1000); state.host_pauses.count++; state.host_pauses.total_s += s;
      state.host_pauses.last = { from: new Date(now - gap).toISOString(), to: new Date(now).toISOString(), s };
      log(`host paused ~${s} s (process did not run); pauses ${state.host_pauses.count}, total ${Math.round(state.host_pauses.total_s / 60)} min`);
      lastTipTry = 0;
    }
  }, 5000).unref();

  function save() {
    state.live_seen = [...liveSeen]; state.updated_at = new Date().toISOString();
    writeFileSync(STATE + ".tmp", JSON.stringify(state)); renameSync(STATE + ".tmp", STATE);
  }
  function writeMd() {
    const S = state.summary, L = state.lag ?? {}, P = state.host_pauses;
    const lagLine = L.network_tip != null
      ? `**Lag behind tip:** cursor ${L.cursor} (closed ${L.cursor_close_time}), network tip ${L.network_tip} (Horizon, checked ${L.tip_checked_at}): ${L.ledgers_behind} ledgers, ${L.minutes_behind} min behind${L.at_tip ? " (at tip)" : ""}. Catch-up rate ${L.catchup_ledgers_per_min ?? "n/a"} ledgers/min with ${L.workers} workers (the network closes ~10.2/min)${L.eta_to_tip_min != null ? `; ETA to tip ~${L.eta_to_tip_min} min of run time` : ""}.`
      : `**Lag behind tip:** network tip not yet read; cursor ${state.cursor}.`;
    const pauseLine = `Host pauses observed: ${P.count} (${Math.round(P.total_s / 60)} min total; the follower cannot run while its host is suspended and catches up on resume).`;
    const intro = `Rolling summary of the live checker on ${net}. Started ${state.started_at} at ledger ${state.first}; cursor ${state.cursor}; updated ${new Date().toISOString()}; restarts ${state.restarts}.\n\n${lagLine}\n\n${pauseLine}\n\nFindings log: \`${FINDINGS}\`; candidates: \`${CAND}\`.\n\n`;
    writeFileSync(MD + ".tmp", renderSummary(S, { title: `Live checker: ${net} (live)`, intro })); renameSync(MD + ".tmp", MD);
  }

  // Workers.
  const HERE = new URL(import.meta.url).pathname;
  const workers = new Set();
  const results = new Map();   // seq -> { r, source, w } | { error, source, w }
  const inflight = new Map();  // seq -> worker
  const retry = new Map();     // seq -> retry-at ms (missing / fetch error)
  let nextSeq = state.cursor + 1, waitingSince = null, wakeFn = null;
  const wake = () => { const f = wakeFn; wakeFn = null; f?.(); };
  function spawnWorker() {
    const w = fork(HERE, ["--worker", "--net", net], { serialization: "advanced", execArgv: ["--max-old-space-size=768"],
      env: { ...process.env, XCK_LIVE_SEEN: JSON.stringify([...liveSeen]) } });
    w.busy = true; w.ready = false; workers.add(w);
    w.on("message", (m) => {
      if (m.ready) { w.ready = true; w.busy = false; return wake(); }
      if (m.log) return log(m.log);
      inflight.delete(m.seq); w.busy = false;
      if (m.missing || m.fetchError) {
        if (m.fetchError) log(`fetch ${m.seq}: ${m.fetchError}`);
        retry.set(m.seq, Date.now() + POLL_MS);
      } else results.set(m.seq, { ...m, w });
      wake();
    });
    w.on("exit", (code) => {
      workers.delete(w);
      for (const [s, x] of inflight) if (x === w) { inflight.delete(s); retry.set(s, Date.now()); }
      for (const [s, x] of results) if (x.w === w) { results.delete(s); retry.set(s, Date.now()); }
      if (!stop) { log(`worker exited (${code}); respawning`); setTimeout(spawnWorker, 2000); }
      wake();
    });
  }
  for (let i = 0; i < W; i++) spawnWorker();

  function dispatch() {
    const now = Date.now();
    for (const w of workers) {
      if (!w.ready || w.busy) continue;
      let seq = null;
      for (const [s, at] of [...retry].sort((a, b) => a[0] - b[0])) if (at <= now && !inflight.has(s)) { seq = s; break; }
      const tipFresh = tip != null && tipAt && now - Date.parse(tipAt) < 5 * 60 * 1000; // a stale tip never blocks progress
      if (seq == null && nextSeq <= state.cursor + WINDOW && (!tipFresh || nextSeq <= tip + 1)) seq = nextSeq++;
      if (seq == null) break;
      retry.delete(seq); inflight.set(seq, w); w.busy = true;
      const rpc = seq === state.cursor + 1 && !!RPC && waitingSince != null && Date.now() - waitingSince > RPC_AFTER;
      w.send({ job: seq, rpc });
    }
  }

  function commit(seq, x) {
    const { r, source, w } = x;
    if (x.error) {
      appendFileSync(FINDINGS, JSON.stringify({ ts: new Date().toISOString(), net, source, type: "checker_error", ledger: seq, err: x.error }) + "\n");
      log(`checker_error at ${seq}: ${x.error.split("\n")[0]}`);
      state.cursor = seq; state.checker_errors = (state.checker_errors ?? 0) + 1; w.send({ cand: seq, list: [] }); return;
    }
    // First-seen is decided here, in ledger order: an arm a worker flagged as
    // first-seen that an earlier ledger already introduced is "seen_live"
    // (not flagged), exactly as in a sequential run.
    const fresh = [];
    r.flags = r.flags.filter((f) => {
      if (f.type !== "first_seen") return true;
      if (liveSeen.has(f.arm)) return false;
      liveSeen.add(f.arm); fresh.push(f.arm); return true;
    });
    if (fresh.length) for (const o of workers) o.send({ seen: fresh });
    addResult(state.summary, r);
    const byTx = new Map();
    for (const f of r.flags) {
      appendFileSync(FINDINGS, JSON.stringify({ ts: new Date().toISOString(), net, source, close_time: r.close_time, ...f }) + "\n");
      const capKey = f.arm ? `${f.type}:${f.arm}` : f.type;
      const lim = f.arm ? CAND_PER_ARM : CAND_PER_TYPE;
      if (!f.tx || (state.cand[capKey] ?? 0) >= lim) continue;
      state.cand[capKey] = (state.cand[capKey] ?? 0) + 1;
      const e = byTx.get(f.tx) ?? { flags: [], segments: new Set() };
      e.flags.push(f); for (const s of f.segments ?? [f.segment]) e.segments.add(s);
      for (const [k, v] of Object.entries(r.segOf)) if (v === f.tx) e.segments.add(k);
      byTx.set(f.tx, e);
    }
    const list = [...byTx].map(([tx, e]) => ({ tx, closeTime: r.close_time, segments: [...e.segments], flags: e.flags, caps: [...new Set(e.flags.flatMap((f) => f.caps ?? []))].sort() }));
    w.send({ cand: seq, list, dir: CAND });
    state.cursor = seq; state.last = { seq, close_time: r.close_time, ms: r.ms, txs: r.txs, flags: r.flags.length, source };
    if (r.flags.some((f) => f.type !== "long_tail")) log(`ledger ${seq}: ${r.flags.filter((f) => f.type !== "long_tail").map((f) => f.type + (f.arm ? ":" + f.arm : "")).join(", ")}`);
  }

  let lastMd = 0;
  await refreshTip();
  while (!stop) {
    if (Date.now() - lastTipTry > TIP_EVERY) await refreshTip();
    let n = 0;
    while (results.has(state.cursor + 1)) { const s = state.cursor + 1; commit(s, results.get(s)); results.delete(s); n++; }
    if (n) { waitingSince = null; save(); }
    else if (retry.has(state.cursor + 1)) {
      waitingSince ??= Date.now();
      const wt = Date.now() - waitingSince;
      if (wt > 10 * 60 * 1000 && wt % (10 * 60 * 1000) < POLL_MS) log(`still waiting for ledger ${state.cursor + 1} (${Math.round(wt / 1000)} s)`);
    }
    if (Date.now() - lastMd > 60000) {
      state.lag = lagNow(); writeMd(); save(); lastMd = Date.now();
      const L = state.lag;
      log(`cursor ${state.cursor} (${state.last?.txs ?? 0} txs, ${state.last?.ms ?? 0} ms); tip ${L.network_tip}, behind ${L.ledgers_behind} ledgers / ${L.minutes_behind} min, ${L.catchup_ledgers_per_min ?? "n/a"} ledgers/min; totals ${state.summary.ledgers} ledgers ${state.summary.txs} txs ${JSON.stringify(state.summary.flag_counts)}`);
    }
    dispatch();
    await new Promise((res) => { wakeFn = res; setTimeout(wake, Math.min(POLL_MS, 1000)); });
  }
  state.lag = lagNow(); writeMd(); save();
  for (const w of workers) { try { w.send("exit"); } catch {} }
  log("stopped");
  setTimeout(() => process.exit(0), 3000).unref();
}
