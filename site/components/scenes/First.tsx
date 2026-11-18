"use client";
import { useState } from "react";
import { Scene } from "./Scene";
import { Scramble } from "../Scramble";
import { useStatus } from "../StatusProvider";
import data from "@/data/static.json";
import { fmt, ledgerUrl, txUrl, utc } from "@/lib/format";

export function First() {
  const { status: s } = useStatus();
  const list = [...s.first_seen].sort((a, b) => b.ledger - a.ledger);
  const [i, setI] = useState(0);
  const f = list[Math.min(i, list.length - 1)];
  if (!f) return null;
  const [type] = (f.arm ?? "").split(".");
  const t = data.types.find((x) => x.type === type);
  const BA = data.baseline_arms as Record<string, number>;
  const TA = data.testnet_arms as Record<string, number>;
  const EA = (data.enum_arms as Record<string, string[]>)[type] ?? [];
  const names = new Set<string>([f.arm ?? "", ...(t?.arms ?? []).map((a) => `${type}.${a.arm}`), ...EA.map((a) => `${type}.${a}`), ...Object.keys(BA).filter((k) => k.startsWith(`${type}.`))]);
  const sib = [...names].map((arm) => ({ arm, txs: BA[arm] ?? 0 })).sort((a, b) => b.txs - a.txs || a.arm.localeCompare(b.arm));
  const mx = Math.log10(Math.max(1, ...sib.map((a) => a.txs)) + 1);
  const liveN = s.first_seen.filter((x) => x.arm === f.arm).length;
  return (
    <Scene id="first" n={3} eyebrow="First sighting · an arm the baseline never saw">
      {(seen) => (
        <>
          {list.length > 1 && (
            <div className="tabs" role="tablist" aria-label="First sightings">
              {list.map((x, k) => (
                <button key={x.tx + x.arm} role="tab" aria-selected={k === i} className={k === i ? "on" : undefined} onClick={() => setI(k)}>
                  {String(k + 1).padStart(2, "0")} · L{fmt(x.ledger)}
                </button>
              ))}
            </div>
          )}
          <Scramble as="div" className="bigarm" text={f.arm ?? ""} duration={1900} play={seen} />
          <div className="grid2">
            <div>
              <div className="label">{type} arms · baseline {fmt(data.baseline.ledgers)} ledgers · {fmt(data.baseline.txs)} txs <span className="dim">· log scale</span></div>
              <div className="bars">
                {sib.map((a) => (
                  <div className={`b ${a.arm === f.arm ? "hit" : ""}`} key={a.arm}>
                    <div className="an" title={a.arm}>{a.arm.slice(type.length + 1)}{a.arm === f.arm ? <span className="dim"> · baseline</span> : null}</div>
                    <div className="track"><div className="fill" style={{ width: seen && a.txs ? `${(Math.log10(a.txs + 1) / mx) * 100}%` : 0 }} /></div>
                    <div className="n">{fmt(a.txs)}</div>
                  </div>
                ))}
                <div className={`b hit reveal ${seen ? "on" : ""}`}>
                  <div className="an" title={f.arm}>{(f.arm ?? "").slice(type.length + 1)}<span className="dim"> · live follower</span></div>
                  <div className="track"><div className="fill" style={{ width: seen ? "6%" : 0 }} /></div>
                  <div className="n">{fmt(liveN)}</div>
                </div>
              </div>
            </div>
            <div className={`reveal d2 ${seen ? "on" : ""}`}>
              <dl>
                <div className="ckv"><dt>Tx</dt><dd><a href={txUrl(f.tx, s.net)} target="_blank" rel="noopener noreferrer">{f.tx}</a></dd></div>
                <div className="ckv"><dt>Ledger</dt><dd><a href={ledgerUrl(f.ledger, s.net)} target="_blank" rel="noopener noreferrer">{fmt(f.ledger)}</a></dd></div>
                <div className="ckv"><dt>Closed</dt><dd>{utc(f.close_time)}</dd></div>
                <div className="ckv"><dt>Flagged</dt><dd>{utc(f.detected_at)} · first_seen</dd></div>
                <div className="ckv"><dt>CAP</dt><dd>{f.caps.length ? `${f.caps.join(", ")} (inferred)` : "-"}</dd></div>
                <div className="ckv"><dt>Testnet sample</dt><dd>{fmt(TA[f.arm ?? ""] ?? 0)} txs</dd></div>
              </dl>
              <p className="cnote">All three readers agreed on it. The checker wrote it out as a corpus candidate with its bytes and archive source, ready for review.</p>
            </div>
          </div>
        </>
      )}
    </Scene>
  );
}
