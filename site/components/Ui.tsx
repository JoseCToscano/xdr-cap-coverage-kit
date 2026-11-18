import type { ReactNode } from "react";
import { fmt, short, txUrl } from "@/lib/format";

export function Panel({ label, corner, children, className }: { label?: string; corner?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className ?? ""}`}>
      {(label || corner) && (
        <header className="panel-h">
          {label && <h2 className="label">{label}</h2>}
          {corner && <span className="corner">{corner}</span>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ n, t, zero, sub }: { n: number | string; t: string; zero?: boolean; sub?: string }) {
  return (
    <div className="stat">
      <div className={`n ${zero ? "zero" : ""}`}>{typeof n === "number" ? fmt(n) : n}</div>
      <div className="t">{t}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}

export function Tx({ tx, net, n = 12 }: { tx: string; net?: string; n?: number }) {
  return (
    <a className="tx" href={txUrl(tx, net)} target="_blank" rel="noopener noreferrer" title={`Transaction ${tx} on stellar.expert`}>
      {short(tx, n)}
    </a>
  );
}

export function Caps({ caps }: { caps: string[] }) {
  if (!caps?.length) return <span className="dim">-</span>;
  return <span className="caps">{caps.map((c) => <span key={c} className="cap">{c}</span>)}</span>;
}

export function PageHead({ eyebrow, title, children }: { eyebrow: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="title">{title}</h1>
      {children && <div className="lede">{children}</div>}
    </div>
  );
}
