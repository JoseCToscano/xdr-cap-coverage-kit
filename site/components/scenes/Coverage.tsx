"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Scene } from "./Scene";
import { CountUp } from "../CountUp";
import data from "@/data/static.json";
import { fmt } from "@/lib/format";

type Mode = "freq" | "ledger" | "entry" | "tail";
const MODES: { m: Mode; label: string }[] = [
  { m: "freq", label: "Mainnet frequency" },
  { m: "ledger", label: "Corpus · ledger scope" },
  { m: "entry", label: "Corpus · entry scope" },
  { m: "tail", label: "Long tail with corpus" },
];

export function CoverageScene({ standalone = false }: { standalone?: boolean }) {
  const cv = data.coverage; const B = data.baseline;
  const arms = useMemo(() => data.types.flatMap((t) => t.arms.map((a) => ({ ...a, key: `${t.type}.${a.arm}` }))), []);
  const [mode, setMode] = useState<Mode>("freq");
  const [hover, setHover] = useState<(typeof arms)[number] | null>(null);
  const hit = (a: (typeof arms)[number]) => mode === "ledger" ? a.ledger > 0 : mode === "entry" ? a.entry > 0 : mode === "tail" ? a.entry > 0 && a.cls === "tail" : true;
  const tip = hover
    ? `${hover.key} · ${hover.cls === "never" ? "never seen on mainnet" : `${fmt(hover.txs)} tx${hover.txs === 1 ? "" : "s"} in ${fmt(B.txs)}`} · ${hover.entry ? `${hover.entry} corpus entr${hover.entry === 1 ? "y" : "ies"}` : "no corpus entry"}`
    : mode === "freq" ? `${cv.seen} of ${cv.universe} arms occur in ${fmt(B.ledgers)} mainnet ledgers. ${cv.never} never do.`
    : mode === "ledger" ? `Corpus overlay · arms present anywhere in a corpus ledger: ${cv.corpus_ledger_scope}`
    : mode === "entry" ? `Corpus overlay · arms inside a corpus entry's own transaction: ${cv.corpus_entry_scope}`
    : `Long-tail arms with a corpus entry: ${cv.tail_in_corpus} of ${cv.tail}. The rest are the work ahead.`;
  return (
    <Scene id="coverage" n={4} eyebrow="Coverage · every union arm in LedgerCloseMeta" className={standalone ? "standalone" : ""}>
      {(seen) => (
        <>
          <div className="covwrap">
            <div>
              <div className="modes" role="group" aria-label="Overlay">
                {MODES.map((x) => <button key={x.m} type="button" aria-pressed={mode === x.m} onClick={() => setMode(x.m)}>{x.label}</button>)}
              </div>
              <div className={`cgrid ${mode !== "freq" ? "ov" : ""}`} onMouseLeave={() => setHover(null)}>
                {arms.map((a, i) => (
                  <button type="button" key={a.key} className={`ccell ${a.cls} ${seen ? "on" : ""} ${hit(a) ? "hit" : ""}`} style={{ transitionDelay: seen ? `${i * 4}ms` : undefined }}
                    aria-label={`${a.key}: ${a.cls === "never" ? "never seen" : `${a.txs} baseline transactions`}, ${a.entry ? "in corpus" : "not in corpus"}`}
                    onMouseEnter={() => setHover(a)} onFocus={() => setHover(a)} onBlur={() => setHover(null)} />
                ))}
              </div>
              <p className="cvtip" aria-live="polite">{tip}</p>
            </div>
            <div className="covside">
              <div className="h">Mainnet frequency · {cv.universe} arms</div>
              <div className="item"><span><i className="sw frequent" />Frequent</span><b><CountUp to={cv.frequent} play={seen} /></b></div>
              <div className="item"><span><i className="sw tail" />Long-tail &lt;100/M</span><b><CountUp to={cv.tail} play={seen} /></b></div>
              <div className="item"><span><i className="sw ledger" />Ledger-level only</span><b><CountUp to={cv.ledger_only} play={seen} /></b></div>
              <div className="item"><span><i className="sw" />Never seen</span><b><CountUp to={cv.never} play={seen} /></b></div>
              <div className="h">Corpus coverage</div>
              <div className="item"><span>Ledger scope</span><b>{cv.corpus_ledger_scope} / {cv.universe}</b></div>
              <div className="item"><span>Entry scope</span><b>{cv.corpus_entry_scope} / {cv.universe}</b></div>
              <div className="item"><span>Long-tail arms</span><b>{cv.tail_in_corpus} / {cv.tail}</b></div>
              {!standalone && <p className="more"><Link href="/coverage/">Arms by union type →</Link></p>}
            </div>
          </div>
        </>
      )}
    </Scene>
  );
}
