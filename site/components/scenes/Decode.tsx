"use client";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Scene } from "./Scene";
import { Scramble } from "../Scramble";
import { useStatus } from "../StatusProvider";
import data from "@/data/static.json";
import { ISSUES, fmt, ledgerUrl, txUrl, utc } from "@/lib/format";
import { reducedMotion } from "@/lib/useInView";
import type { ReaderKey } from "@/lib/types";

// Plain names for the XDR envelope types.
const ENVELOPE: Record<string, string> = {
  envelopeTypeTxFeeBump: "Fee-bump transaction",
  envelopeTypeTx: "Transaction",
  envelopeTypeTxV0: "Transaction (v0)",
};
const READERS: ReaderKey[] = ["js", "go", "rust"];
const mid = (s: string, a = 8, b = 8) => (s.length > a + b + 1 ? `${s.slice(0, a)}…${s.slice(-b)}` : s);

// Split two digit strings at the first differing character, so the wrong digits can be marked.
function split(a: string, b: string): [string, string, string] {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return [a.slice(0, i), a.slice(i), b.slice(i)];
}

// Label with a plain-language note on hover and keyboard focus.
function Tip({ k, note }: { k: string; note: string }) {
  const id = useId();
  return (
    <span className="tipw">
      <span className="tip" tabIndex={0} aria-describedby={id}>{k}</span>
      <span role="tooltip" id={id} className="tipbox">{note}</span>
    </span>
  );
}

type Row = { k: string; note: string; v: string; title?: string; href?: string; strong?: boolean };

export function Decode() {
  const h = data.hero;
  const { status: s } = useStatus();
  const bad = (s.flags.disagreement ?? 0) + (s.flags.decode_failure ?? 0) + (s.flags.roundtrip_mismatch ?? 0);
  const issue = ISSUES[h.shape] ?? null;
  const [same, want, got] = split(h.muxedId, h.asNumber);
  const repro = data.repro1785;
  const rows: Row[] = [
    { k: "Type", note: `Kind of envelope: ${h.envType}`, v: ENVELOPE[h.envType] ?? h.envType },
    { k: "Op", note: `What the transaction does. Destination ${h.destination}`, v: `${h.op} · ${h.amount} ${h.asset}` },
    { k: "Arm", note: `Which variant of the XDR union this value uses. Seen in ${fmt(h.seenTxs)} mainnet txs across ${fmt(data.baseline.ledgers)} baseline ledgers`, v: h.arm, strong: true },
    { k: "CAP", note: "Protocol change that added muxed accounts", v: h.cap },
  ];
  const [shown, setShown] = useState(0);
  const [go, setGo] = useState(false);
  const [raw, setRaw] = useState(false);
  useEffect(() => {
    if (!go) return;
    if (reducedMotion()) { setShown(rows.length); return; }
    let i = 0; const t = setInterval(() => { i++; setShown(i); if (i >= rows.length) clearInterval(t); }, 160);
    return () => clearInterval(t);
  }, [go, rows.length]);
  const L = s.checker.ledgers;
  return (
    <Scene id="decode" n={0} eyebrow="Decode · one real mainnet transaction">
      {(seen) => (
        <>
          <h1 className="hero-h">Three Stellar SDKs read every new mainnet transaction. We check that they agree.</h1>
          <div className="tagline" role="note">
            <span>Live mainnet</span><span>3 SDKs</span><span><b className={bad === 0 ? "ok" : "warn"}>{fmt(bad)}</b> disagreements</span>
            <span><b>{fmt(s.checker.txs)}</b> live txs</span><span><Link href="/backfill/"><b>{fmt(data.backfill.txs)}</b> backfilled</Link></span>
          </div>
          <div className="grid2">
            <div>
              {issue && (
                <figure className="diff" aria-label={`Muxed id ${h.muxedId} read as a JavaScript number becomes ${h.asNumber}`}>
                  <figcaption className="diff-h">
                    <span className="verdict">JS number loses precision</span>
                    <a className="chip accent" href={issue.url} target="_blank" rel="noopener noreferrer" title={issue.label}>#{issue.label.split("#").pop()}</a>
                  </figcaption>
                  <div className="diff-s">Bug shape · muxed id &gt; 2^53</div>
                  <div className="dl"><span className="dk">expected</span><span className="dv">{same}<b className="okd">{want}</b></span></div>
                  <div className="dl"><span className="dk">js number</span><span className="dv">{same}<b className="badd">{got}</b></span></div>
                  <div className="chips">
                    {repro && <>
                      <span className="chip"><span className="dim">{repro.before.split(":")[0]}</span> <b className="bad">{repro.before.split(":")[1]?.trim()}</b></span>
                      <span className="chip"><span className="dim">{repro.after.split(":")[0]}</span> <b className="ok">{repro.after.split(":")[1]?.trim()}</b></span>
                    </>}
                    <Link className="next" href="/findings/">See all findings →</Link>
                  </div>
                </figure>
              )}
              <div className="agree" role="group" aria-labelledby="agree-h">
                <div className="agree-h" id="agree-h">All three agree</div>
                {READERS.map((k) => {
                  const r = s.readers[k];
                  const ok = r && L > 0 && r.ledgers_ok === L && r.roundtrip_ok === L;
                  return (
                    <div className="rd" key={k} title={r ? `${r.lib}: ${fmt(r.ledgers_ok)} / ${fmt(L)} ledgers decoded, ${fmt(r.roundtrip_ok)} round-tripped` : undefined}>
                      <span className="rn">{r?.name ?? k} <b className={ok ? "ok" : "warn"} aria-label={ok ? "agrees" : "check"}>{ok ? "✓" : "!"}</b></span>
                      <span className="rl">{r?.lib ?? "-"}</span>
                    </div>
                  );
                })}
                <div className="agree-f">
                  <span title="sha256 of the envelope bytes all three readers decoded">sha256 <b className="mono">{mid(h.sha256, 8, 4)}</b></span>
                  <span>decode <b className={(s.flags.decode_failure ?? 0) === 0 ? "ok" : "warn"}>✓</b></span>
                  <span>round-trip <b className={(s.flags.roundtrip_mismatch ?? 0) === 0 ? "ok" : "warn"}>✓</b></span>
                  <span>same tokens <b className={(s.flags.disagreement ?? 0) === 0 ? "ok" : "warn"}>✓</b></span>
                </div>
              </div>
              <button type="button" className="rawtoggle" aria-expanded={raw} aria-controls="decode-raw" onClick={() => setRaw((o) => !o)}>
                {raw ? "Hide raw XDR" : "Show raw XDR"} · {h.base64.length} chars
              </button>
              <div id="decode-raw" className="b64wrap" hidden={!raw}>
                <Scramble as="pre" className="b64" text={h.base64} duration={1800} play={seen} onDone={() => setGo(true)} />
                <dl className="rawkv">
                  <div><dt>Tx</dt><dd>{h.tx}</dd></div>
                  <div><dt>To</dt><dd>{h.destination}</dd></div>
                  <div><dt>Base</dt><dd>{h.base}</dd></div>
                  <div><dt>Segment</dt><dd>{h.segment}</dd></div>
                  <div><dt>Sha256</dt><dd>{h.sha256}</dd></div>
                </dl>
              </div>
            </div>
            <div className="hkv">
              <dl>
              {rows.map((r, i) => (
                <div className={`kvr ${i < shown ? "on" : ""}`} key={r.k}>
                  <dt><Tip k={r.k} note={r.note} /></dt>
                  <dd className={r.strong ? "strong" : undefined} title={r.title}>
                    {r.href
                      ? <a href={r.href} target="_blank" rel="noopener noreferrer"><Scramble text={r.v} duration={700} play={i < shown} /></a>
                      : <Scramble text={r.v} duration={700} play={i < shown} />}
                  </dd>
                </div>
              ))}
              </dl>
              <div className={`prov ${shown >= rows.length ? "on" : ""}`}>
                <a href={ledgerUrl(h.ledger)} target="_blank" rel="noopener noreferrer" title={`Closed ${utc(h.close)}`}>Ledger {fmt(h.ledger)}</a>
                <span className="dim"> · </span>
                <a href={txUrl(h.tx)} target="_blank" rel="noopener noreferrer" title={h.tx}>Tx {h.tx.slice(0, 8)}…</a>
              </div>
            </div>
          </div>
        </>
      )}
    </Scene>
  );
}
