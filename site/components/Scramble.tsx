"use client";
import { useEffect, useRef, useState, type ElementType } from "react";
import { reducedMotion } from "@/lib/useInView";

// Text-scramble decode, ported from the demo video: every character settles at its
// own random time. Runs when `play` turns true (default: on mount). Screen readers
// get the final text; reduced-motion users never see the effect.
const GLYPH = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=<>[]{}#*:";

export function Scramble({ text, className, as: Tag = "span", duration = 1700, play = true, onDone }: {
  text: string; className?: string; as?: ElementType; duration?: number; play?: boolean; onDone?: () => void;
}) {
  const [out, setOut] = useState(text);
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (!play || started.current === text) return;
    started.current = text;
    if (reducedMotion()) { setOut(text); onDone?.(); return; }
    const chars = [...text];
    const at = chars.map((c) => (/\s/.test(c) ? 0 : duration * (0.35 + 0.65 * Math.random())));
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = now - t0; let s = ""; let done = true;
      for (let i = 0; i < chars.length; i++) {
        if (t >= at[i]) s += chars[i];
        else { done = false; s += GLYPH[(Math.random() * GLYPH.length) | 0]; }
      }
      setOut(s);
      if (done) onDone?.(); else raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, text, duration]);
  return (
    <Tag className={className} aria-label={text}>
      <span aria-hidden="true">{out}</span>
    </Tag>
  );
}
