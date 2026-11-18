"use client";
import Link from "next/link";
import { Scene } from "./Scene";
import { CountUp } from "../CountUp";
import { useStatus } from "../StatusProvider";
import { HEALTH_LABEL, lagView } from "@/lib/lag";
import { duration, fmt, short, utc } from "@/lib/format";
import type { Finding, ReaderKey } from "@/lib/types";

const COLS: [ReaderKey, string, string][] = [["js", "JS", "js-stellar-sdk 17.4.0 · js-xdr 5"], ["go", "GO", "go-stellar-sdk 0.9.0 · xdr"], ["rust", "RUST", "rs-stellar-xdr 30.0.0"]];
const label = (f: Finding) => f.type === "first_seen" ? `FIRST SEEN  ${f.arm}` : f.type === "bug_shape" ? `BUG SHAPE   ${f.shape?.includes("#1785") ? "muxed id ≥ 2^53 (#1785)" : f.shape?.includes("#731") ? "nested SAC trust() (#731)" : f.shape}` : `${f.type.toUpperCase()}  ${f.arm ?? ""}`;

export function Readers() {
  const { status: s, source, tip, now } = useStatus();
  const lag = lagView(s, tip, now);
  const L = s.checker.ledgers;
  const hp = s.checker.host_pauses;
  const events = [...s.first_seen, ...s.reader_findings, ...s.bug_shapes.flatMap((b) => b.recent)].sort((a, b) => b.ledger - a.ledger).slice(0, 5);
  const fresh = source === "live" && lag.health !== "stale";
  return (
    <Scene id="readers" n={1} eyebrow="Three independent readers · same bytes · same answer">
      {(seen) => (
        <>
          <p className="sub">Live follower · ledgers {fmt(s.checker.first)} to {fmt(s.checker.last_ledger?.seq ?? s.checker.cursor)} · since {utc(s.checker.started_at)} · {s.checker.restarts} restarts, each resumed at the next ledger</p>
          <div className="cols3">
            {COLS.map(([k, n, lib]) => {
              const r = s.readers[k];
              const ok = r.ledgers_ok === L && r.roundtrip_ok === L;
              return (
                <div className="col" key={k}>
                  <div className="name">{n}</div>
                  <div className="lib">{lib}</div>
                  <div className="cstat">Ledgers decoded <b><CountUp to={r.ledgers_ok} play={seen} /></b></div>
                  <div className="cstat">Byte round-trip <b><CountUp to={r.roundtrip_ok} play={seen} /></b></div>
                  {k === "rust" ? <div className="cstat">SEP-51 JSON round-trip <b><CountUp to={r.json_roundtrip_ok ?? 0} play={seen} /></b></div>
                    : k === "js" ? <div className="cstat">JS precision hazards <b className={s.flags.js_precision ? "warn" : "ok"}>{fmt(s.flags.js_precision)}</b></div>
                    : <div className="cstat">Disagreements <b className={s.flags.disagreement ? "warn" : "ok"}>{fmt(s.flags.disagreement)}</b></div>}
                  <div className="cstat">Status <b className={ok ? "ok" : "warn"}>{ok ? "AGREE ✓" : "SEE FINDINGS"}</b></div>
                </div>
              );
            })}
          </div>
          <div className="ctrs">
            <div className="ctr"><div className="n"><CountUp to={s.checker.txs} play={seen} /></div><div className="t">Transactions checked × 3</div></div>
            <div className="ctr"><div className="n"><CountUp to={L} play={seen} /></div><div className="t">Ledgers</div></div>
            {(["disagreement", "decode_failure", "roundtrip_mismatch"] as const).map((k) => (
              <div className="ctr" key={k}><div className={`n ${s.flags[k] ? "warn" : "zero"}`}>{fmt(s.flags[k])}</div><div className="t">{k === "disagreement" ? "Disagreements" : k === "decode_failure" ? "Decode failures" : "Round-trip mismatches"}</div></div>
            ))}
          </div>
          <div className="ticker" aria-label="Latest flagged transactions">
            {events.map((f) => <div key={f.type + f.tx + (f.arm ?? f.shape)}>{`L ${fmt(f.ledger)}   ${short(f.tx, 10)}   ${label(f)}`}</div>)}
          </div>
          <div className={`livebar on h-${lag.health}`} role="status" aria-live="polite">
            <span>{fresh ? <><i className="dot" /><b>Live follower</b></> : <b>Live follower snapshot</b>}</span>
            <span><b className={lag.health === "at-tip" ? "ok" : lag.health === "stale" ? "bad" : "warn"}>{HEALTH_LABEL[lag.health]}</b></span>
            {lag.secondsBehind != null && <span>Lag <b>{fmt(lag.ledgersBehind)}</b> ledgers · <b>{duration(lag.secondsBehind)}</b></span>}
            {lag.tip && <span>Tip <b>{fmt(lag.tip.ledger)}</b></span>}
            {lag.health === "catching-up" && lag.ratePerMin != null && <span>Catch-up <b>{fmt(Math.round(lag.ratePerMin))}</b> ledgers/min{lag.etaMin != null && lag.etaMin > 0 ? <> · ETA <b>{duration(lag.etaMin * 60)}</b></> : null}</span>}
            {lag.workers != null && <span>Workers <b>{lag.workers}</b></span>}
            {hp && <span>Host pauses <b className={hp.count ? "warn" : "ok"}>{fmt(hp.count)}</b>{hp.count ? <> · <b>{duration(hp.total_s)}</b> total</> : null}</span>}
            <span>Status written <b>{duration(lag.feedAgeSec)}</b> ago</span>
            <Link href="/findings/">All findings →</Link>
          </div>
          {hp?.last && <p className="fine">Last host pause: {utc(hp.last.from)} to {utc(hp.last.to)} ({duration(hp.last.s)}). The follower cannot run while its host is suspended; on resume it continues from the next ledger, so no ledger is skipped.</p>}
          {source === "bundled" && <p className="fine">Showing the snapshot bundled at build time ({utc(s.generated_at)}). The lag above is measured against the current network tip, so it grows until the live feed is reachable.</p>}
        </>
      )}
    </Scene>
  );
}
