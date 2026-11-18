"use client";
import type { ReactNode } from "react";
import { Scramble } from "../Scramble";
import { useInView } from "@/lib/useInView";

// One section of the home page, laid out like a scene of the demo video.
export function Scene({ id, n, eyebrow, children, light, className }: { id: string; n: number; eyebrow: string; children: (seen: boolean) => ReactNode; light?: boolean; className?: string }) {
  const [ref, seen] = useInView<HTMLElement>(0.2);
  return (
    <section ref={ref} id={id} data-scene={n} className={`scene ${light ? "light" : ""} ${seen ? "seen" : ""} ${className ?? ""}`} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className={`eyebrow ${light ? "dark" : ""}`}>
        <Scramble text={`0${n + 1} · ${eyebrow}`} duration={1200} play={seen} />
      </h2>
      {children(seen)}
    </section>
  );
}
