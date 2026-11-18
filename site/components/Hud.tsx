"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useStatus } from "./StatusProvider";
import { fmt, utc } from "@/lib/format";

export const SCENES = ["Decode", "Three readers", "The catch", "First sighting", "Coverage", "Reproduce"];
const PAGES: Record<string, string> = { "/findings/": "Findings feed", "/backfill/": "Backfill", "/coverage/": "Coverage", "/reproduce/": "Reproduce" };
const NAV = [
  { href: "/#decode", label: "01 Decode" },
  { href: "/#readers", label: "02 Live" },
  { href: "/#catch", label: "03 Catch" },
  { href: "/#first", label: "04 First seen" },
  { href: "/#coverage", label: "05 Coverage" },
  { href: "/#reproduce", label: "06 Reproduce" },
];
const MORE = [
  { href: "/findings/", label: "Findings" },
  { href: "/backfill/", label: "Backfill" },
  { href: "/coverage/", label: "Arms" },
];

export function Hud() {
  const { status, source } = useStatus();
  const path = usePathname() || "/";
  const norm = path.endsWith("/") ? path : path + "/";
  const [scene, setScene] = useState(0);
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>("[data-scene]")];
    if (!els.length) return;
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) setScene(Number(e.target.getAttribute("data-scene")));
    }, { rootMargin: "-45% 0px -50% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [path]);
  const home = norm === "/";
  const ledger = status.checker.last_ledger?.seq ?? status.checker.cursor;
  const lm = home && scene === 5 ? " lightmode" : "";
  return (
    <>
      <header className={`hud-top${lm}`}>
        <Link className="hud-brand" href="/"><span className="br">[</span> XDR/CAP COVERAGE KIT <span className="sep">:</span> <span className="hide-s">LIVE DIFFERENTIAL CHECKER</span> <span className="br">]</span></Link>
        <nav className="hud-nav" aria-label="Sections">
          <ul>
            {NAV.map((n, i) => <li key={n.href}><a href={n.href} className={home && scene === i ? "on" : undefined} aria-current={home && scene === i ? "location" : undefined}>{n.label}</a></li>)}
            <li className="sepl" aria-hidden="true">/</li>
            {MORE.map((n) => <li key={n.href} className="more-l"><Link href={n.href} className={norm === n.href ? "on" : undefined} aria-current={norm === n.href ? "page" : undefined}>{n.label}</Link></li>)}
          </ul>
        </nav>
        <span className="hud-r">[ {status.net.toUpperCase()} : LEDGER <span className="br">{fmt(ledger)}</span> ]</span>
      </header>
      <div className={`hud-bot${lm}`} aria-hidden="true">
        <span>{home ? `0${scene + 1} / 06 · ${SCENES[scene].toUpperCase()}` : (PAGES[norm] ?? "").toUpperCase()}</span>
        <span>{source === "live" ? <><i className="dot" /> LIVE FEED · {utc(status.generated_at)}</> : <>DATA SNAPSHOT · {utc(status.generated_at)}</>}</span>
      </div>
      <span className={`crosses${lm}`} aria-hidden="true"><span className="cross c-tl" aria-hidden="true">+</span><span className="cross c-tr" aria-hidden="true">+</span>
      <span className="cross c-bl" aria-hidden="true">+</span><span className="cross c-br" aria-hidden="true">+</span>
      <span className="cross c-tm" aria-hidden="true">+</span><span className="cross c-bm" aria-hidden="true">+</span></span>
    </>
  );
}
