"use client";
import { useMemo, useState } from "react";
import { fmt } from "@/lib/format";

type Cls = "frequent" | "tail" | "ledger" | "never";
interface Arm { arm: string; cls: string; txs: number; entry: number; ledger: number }
interface T { type: string; arms: Arm[] }

const LEGEND: { cls: Cls; label: string }[] = [
  { cls: "frequent", label: "Frequent" },
  { cls: "tail", label: "Long tail (<100 per M txs)" },
  { cls: "ledger", label: "Ledger level only" },
  { cls: "never", label: "Never seen" },
];

export function CoverageGrid({ types, baselineTxs }: { types: T[]; baselineTxs: number }) {
  const [filter, setFilter] = useState<Cls | "corpus" | null>(null);
  const [focus, setFocus] = useState<{ t: string; a: Arm } | null>(null);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of types) for (const a of t.arms) c[a.cls] = (c[a.cls] ?? 0) + 1;
    c.corpus = types.reduce((n, t) => n + t.arms.filter((a) => a.entry > 0).length, 0);
    return c;
  }, [types]);
  const dimmed = (a: Arm) => filter != null && (filter === "corpus" ? a.entry === 0 : a.cls !== filter);

  return (
    <div className="cov">
      <div className="legend" role="group" aria-label="Filter arms">
        {LEGEND.map((l) => (
          <button key={l.cls} type="button" aria-pressed={filter === l.cls} onClick={() => setFilter(filter === l.cls ? null : l.cls)}>
            <span className={`sw c-${l.cls}`} aria-hidden="true" /> {l.label} <b>{counts[l.cls] ?? 0}</b>
          </button>
        ))}
        <button type="button" aria-pressed={filter === "corpus"} onClick={() => setFilter(filter === "corpus" ? null : "corpus")}>
          <span className="sw corpus" aria-hidden="true" /> In corpus (entry scope) <b>{counts.corpus}</b>
        </button>
      </div>
      <div className="readout" aria-live="polite">
        {focus ? (
          <>
            <span className="mono">{focus.t}.{focus.a.arm}</span>
            <span>{focus.a.cls === "never" ? "never seen on mainnet" : `${fmt(focus.a.txs)} baseline txs (${((focus.a.txs * 1e6) / baselineTxs).toFixed(focus.a.txs * 1e6 / baselineTxs < 10 ? 2 : 0)} per M)`}</span>
            <span>{focus.a.entry > 0 ? `${focus.a.entry} corpus entries` : "no corpus entry"}</span>
          </>
        ) : <span className="dim">Hover or focus a cell for details.</span>}
      </div>
      <div className="types">
        {types.map((t) => (
          <div className="type" key={t.type}>
            <div className="tname" title={t.type}>{t.type}</div>
            <div className="cells">
              {t.arms.map((a) => (
                <button
                  type="button"
                  key={a.arm}
                  className={`cell c-${a.cls} ${a.entry > 0 ? "corpus" : ""} ${dimmed(a) ? "dimmed" : ""}`}
                  aria-label={`${t.type}.${a.arm}: ${a.cls === "never" ? "never seen" : `${a.txs} baseline transactions`}, ${a.entry > 0 ? "in corpus" : "not in corpus"}`}
                  onMouseEnter={() => setFocus({ t: t.type, a })}
                  onFocus={() => setFocus({ t: t.type, a })}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
