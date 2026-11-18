"use client";
import { useEffect, useRef, useState } from "react";
import { reducedMotion } from "@/lib/useInView";
import { fmt } from "@/lib/format";

// Ease-out count from the last shown value to `to` (from 0 the first time `play` is true).
export function CountUp({ to, play = true, ms = 2200, className }: { to: number; play?: boolean; ms?: number; className?: string }) {
  const [v, setV] = useState(to);
  const from = useRef<number | null>(null);
  useEffect(() => {
    if (!play) return;
    const start = from.current ?? 0;
    from.current = to;
    if (reducedMotion() || start === to) { setV(to); return; }
    const t0 = performance.now(); let raf = 0;
    const s = (n: number) => { const k = Math.min(1, (n - t0) / ms); setV(Math.round(start + (to - start) * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(s); };
    raf = requestAnimationFrame(s);
    return () => cancelAnimationFrame(raf);
  }, [to, play, ms]);
  return <span className={className}>{fmt(v)}</span>;
}
