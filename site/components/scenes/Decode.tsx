"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Scene } from "./Scene";
import { Scramble } from "../Scramble";
import { useStatus } from "../StatusProvider";
import data from "@/data/static.json";
import { fmt, ledgerUrl, txUrl, utc } from "@/lib/format";
import { reducedMotion } from "@/lib/useInView";

const big = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export function Decode() {
  const h = data.hero;
  const { status: s } = useStatus();
  const bad = (s.flags.disagreement ?? 0) + (s.flags.decode_failure ?? 0) + (s.flags.roundtrip_mismatch ?? 0);
  const rows: [string, string, string | null, boolean][] = [
    ["Type", "TransactionEnvelope", `${h.envType} · segment ${h.segment}`, false],
    ["Operation", `${h.op} · ${h.amount} ${h.asset}`, null, false],
    ["Destination", h.destination, `base ${h.base}`, false],
    ["Union arm", h.arm, `muxed id ${big(h.muxedId)}`, true],
    ["CAP", h.cap, "muxed accounts", false],
    ["Seen on mainnet", `${fmt(h.seenTxs)} txs`, `in ${fmt(data.baseline.ledgers)} baseline ledgers · ${fmt(data.baseline.txs)} txs`, true],
  ];
  const [shown, setShown] = useState(0);
  const [go, setGo] = useState(false);
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
          <div className="tagline" role="note">
            <span>Live mainnet</span><span>3 SDKs</span><span><b className={bad === 0 ? "ok" : "warn"}>{fmt(bad)}</b> disagreements</span>
            <span><b>{fmt(s.checker.txs)}</b> live txs</span><span><Link href="/backfill/"><b>{fmt(data.backfill.txs)}</b> backfilled</Link></span>
          </div>
          <div className="grid2">
            <div>
              <div className="label">Input <span className="dim">· TransactionEnvelope · base64 · {h.base64.length} chars</span></div>
              <Scramble as="pre" className="b64" text={h.base64} duration={1800} play={seen} onDone={() => setGo(true)} />
              <div className="label mt">Tx <a className="mono dim" href={txUrl(h.tx)} target="_blank" rel="noopener noreferrer">{h.tx}</a></div>
              <div className="label">Ledger <a className="mono dim" href={ledgerUrl(h.ledger)} target="_blank" rel="noopener noreferrer">{fmt(h.ledger)}</a> <span className="dim">· closed {utc(h.close)}</span></div>
            </div>
            <dl className="decoded">
              {rows.map(([k, v, sub, isBig], i) => (
                <div className={`row ${i < shown ? "on" : ""}`} key={k}>
                  <dt className="k">{k}</dt>
                  <dd className={`v ${isBig ? "big" : ""}`}>
                    <Scramble text={v} duration={1000} play={i < shown} />
                    {sub && <small>{sub}</small>}
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
