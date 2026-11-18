"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Scene } from "./Scene";
import { Scramble } from "../Scramble";
import { useStatus } from "../StatusProvider";
import data from "@/data/static.json";
import { ISSUES, fmt, ledgerUrl, txUrl, utc } from "@/lib/format";
import { reducedMotion } from "@/lib/useInView";

const big = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// Plain names for the XDR envelope types, so the first screen reads without a spec open.
const ENVELOPE: Record<string, string> = {
  envelopeTypeTxFeeBump: "Fee-bump transaction",
  envelopeTypeTx: "Transaction",
  envelopeTypeTxV0: "Transaction (v0)",
};

type Row = { k: string; gloss: string; v: string; sub: string | null; big: boolean; tag?: { label: string; title: string; url: string } };

export function Decode() {
  const h = data.hero;
  const { status: s } = useStatus();
  const bad = (s.flags.disagreement ?? 0) + (s.flags.decode_failure ?? 0) + (s.flags.roundtrip_mismatch ?? 0);
  // Why this transaction is on the first screen: the bug shape the live checker flagged on it.
  const issue = ISSUES[h.shape] ?? null;
  const drift = Number(h.drift);
  const rows: Row[] = [
    { k: "Type", gloss: "kind of envelope", v: ENVELOPE[h.envType] ?? h.envType, sub: `TransactionEnvelope · ${h.envType}`, big: false },
    { k: "Operation", gloss: "what it does", v: `${h.op} · ${h.amount} ${h.asset}`, sub: null, big: false },
    { k: "Destination", gloss: "muxed M address", v: h.destination, sub: `base account ${h.base}`, big: false },
    { k: "Union arm", gloss: "which variant of the XDR type", v: h.arm, sub: `muxed id ${big(h.muxedId)}`, big: true, tag: issue ? { label: `Bug shape · ${issue.label.split(" ").pop()}`, title: `This shape broke an SDK before: ${issue.label}`, url: issue.url } : undefined },
    { k: "CAP", gloss: "protocol change that added it", v: h.cap, sub: "muxed accounts", big: false },
    { k: "Seen on mainnet", gloss: "how common this variant is", v: `${fmt(h.seenTxs)} txs`, sub: `in ${fmt(data.baseline.ledgers)} baseline ledgers · ${fmt(data.baseline.txs)} txs`, big: true },
  ];
  const [shown, setShown] = useState(0);
  const [go, setGo] = useState(false);
  const [raw, setRaw] = useState(false);
  useEffect(() => {
    if (!go) return;
    if (reducedMotion()) { setShown(rows.length); return; }
    let i = 0; const t = setInterval(() => { i++; setShown(i); if (i >= rows.length) clearInterval(t); }, 420);
    return () => clearInterval(t);
  }, [go, rows.length]);
  return (
    <Scene id="decode" n={0} eyebrow="Decode · one real mainnet transaction">
      {(seen) => (
        <>
          <div className="hero-head">
            <h1 className="hero-h">Three Stellar SDKs read every new mainnet transaction. We check that they agree.</h1>
            <p className="hero-sub">
              A live differential checker for Stellar XDR: <span className="nw">js-stellar-sdk</span>, <span className="nw">go-stellar-sdk</span> and <span className="nw">rs-stellar-xdr</span> decode the same ledgers.
              Any disagreement, or a rare shape that has broken an SDK before, is flagged and saved so it can be replayed.
            </p>
          </div>
          <div className="tagline" role="note">
            <span>Live mainnet</span><span>3 SDKs</span><span><b className={bad === 0 ? "ok" : "warn"}>{fmt(bad)}</b> disagreements</span>
            <span><b>{fmt(s.checker.txs)}</b> live txs</span><span><Link href="/backfill/"><b>{fmt(data.backfill.txs)}</b> backfilled</Link></span>
          </div>
          <div className="grid2">
            <div>
              {issue && (
                <aside className="why" aria-label="Why this transaction">
                  <div className="why-h"><span className="badge">Why this one</span> <span>This shape broke an SDK before: muxed account ids (<a className="nw" href={issue.url} target="_blank" rel="noopener noreferrer">{issue.label}</a>)</span></div>
                  <p>
                    Its muxed id, <b className="mono">{big(h.muxedId)}</b>, is above 2^53, where JavaScript numbers stop being exact.
                    {Number.isFinite(drift) && drift !== 0 && <> Read as a JS number it becomes <b className="mono">{big(h.asNumber)}</b>, off by {fmt(Math.abs(drift))}.</>}
                  </p>
                  {data.repro1785 && <p className="why-f">Repro in this repo · {data.repro1785.before} · {data.repro1785.after}</p>}
                </aside>
              )}
              <div className="rawhead">
                <div className="label">Input <span className="dim">· TransactionEnvelope · base64 · {h.base64.length} chars</span></div>
                <button type="button" className="rawtoggle" aria-expanded={raw} aria-controls="decode-raw" onClick={() => setRaw((o) => !o)}>
                  {raw ? "Hide raw XDR" : "Show raw XDR"}
                </button>
              </div>
              <div id="decode-raw" className={`b64wrap ${raw ? "open" : "closed"}`}>
                <Scramble as="pre" className="b64" text={h.base64} duration={1800} play={seen} onDone={() => setGo(true)} />
              </div>
              <div className="label mt">Tx <a className="mono dim" href={txUrl(h.tx)} target="_blank" rel="noopener noreferrer">{h.tx}</a></div>
              <div className="label">Ledger <a className="mono dim" href={ledgerUrl(h.ledger)} target="_blank" rel="noopener noreferrer">{fmt(h.ledger)}</a> <span className="dim">· closed {utc(h.close)}</span></div>
              <div className="label dim small-l">Checker segment {h.segment} <span className="gl">(the unit all three readers hash and compare)</span></div>
            </div>
            <dl className="decoded">
              {rows.map((r, i) => (
                <div className={`row ${i < shown ? "on" : ""}`} key={r.k}>
                  <dt className="k">{r.k}<span className="gl">{r.gloss}</span></dt>
                  <dd className={`v ${r.big ? "big" : ""}`}>
                    {r.big && r.v.includes(".")
                      ? r.v.split(/(?<=\.)/).map((part, j) => <span className="nb" key={j}><Scramble text={part} duration={1000} play={i < shown} /></span>)
                      : <Scramble text={r.v} duration={1000} play={i < shown} />}
                    {r.sub && <small>{r.sub}</small>}
                    {r.tag && <a className="shape-tag" href={r.tag.url} title={r.tag.title} aria-label={r.tag.title} target="_blank" rel="noopener noreferrer">{r.tag.label}</a>}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="lede">
            Every new Stellar mainnet ledger is decoded by <b>js-stellar-sdk 17.4.0</b>, <b>go-stellar-sdk 0.9.0</b> and <b>rs-stellar-xdr 30.0.0</b>, projected
            to one canonical form and compared value by value. This envelope is one the live checker flagged: a muxed ID above 2^53.
          </p>
        </>
      )}
    </Scene>
  );
}
