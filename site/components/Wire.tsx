"use client";
import { useEffect, useRef } from "react";
import { reducedMotion } from "@/lib/useInView";

type M = { v: number[][]; e: number[][] };
const cube: M = (() => { const v: number[][] = []; for (const a of [-1, 1]) for (const b of [-1, 1]) for (const d of [-1, 1]) v.push([a, b, d]); const e: number[][] = []; for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) { const dd = v[i].reduce((s, q, k) => s + (q !== v[j][k] ? 1 : 0), 0); if (dd === 1) e.push([i, j]); } return { v, e }; })();
const knot: M = (() => { const v: number[][] = [], e: number[][] = []; const N = 220; for (let i = 0; i < N; i++) { const t = (i / N) * Math.PI * 2, r = Math.cos(3 * t) + 2; v.push([(r * Math.cos(2 * t)) / 3, (r * Math.sin(2 * t)) / 3, -Math.sin(3 * t) * 0.55]); e.push([i, (i + 1) % N]); } return { v, e }; })();
const ico: M = (() => { const f = (1 + Math.sqrt(5)) / 2; const v = [[-1, f, 0], [1, f, 0], [-1, -f, 0], [1, -f, 0], [0, -1, f], [0, 1, f], [0, -1, -f], [0, 1, -f], [f, 0, -1], [f, 0, 1], [-f, 0, -1], [-f, 0, 1]].map((p) => p.map((q) => q / 1.9)); const e: number[][] = []; for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) { const d = Math.hypot(...v[i].map((q, k) => q - v[j][k])); if (d < 1.1) e.push([i, j]); } return { v, e }; })();

// The close scene's rotating wireframes (cube, 2,3 torus knot, icosahedron), drawn on a 2D canvas.
export function Wire() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!; const x = c.getContext("2d")!; const W = 560, H = 960; const dpr = Math.min(2, devicePixelRatio || 1);
    c.width = W * dpr; c.height = H * dpr; x.scale(dpr, dpr);
    const shapes = [{ m: cube, cx: 330, cy: 190, s: 82, sp: 0.4 }, { m: knot, cx: 280, cy: 500, s: 150, sp: -0.3 }, { m: ico, cx: 140, cy: 760, s: 78, sp: 0.55 }];
    let raf = 0; let on = true;
    const draw = (n: number) => {
      const t = n / 1000; x.clearRect(0, 0, W, H); x.strokeStyle = "rgba(22,24,27,.72)"; x.lineWidth = 1;
      for (const S of shapes) {
        const a = t * S.sp, b = t * S.sp * 0.7 + 0.6;
        const P = S.m.v.map(([X, Y, Z]) => { const y = Y * Math.cos(b) - Z * Math.sin(b); let z = Y * Math.sin(b) + Z * Math.cos(b); const x2 = X * Math.cos(a) + z * Math.sin(a); z = -X * Math.sin(a) + z * Math.cos(a); const k = 3.2 / (3.2 + z); return [S.cx + x2 * S.s * k, S.cy + y * S.s * k]; });
        x.beginPath(); for (const [i, j] of S.m.e) { x.moveTo(P[i][0], P[i][1]); x.lineTo(P[j][0], P[j][1]); } x.stroke();
      }
      x.fillStyle = "rgba(22,24,27,.5)"; x.font = "12px var(--f-mono), monospace";
      x.fillText("[ FIG. 01 : CUBE ]", 265, 340); x.fillText("[ FIG. 02 : KNOT 2,3 ]", 330, 660); x.fillText("[ FIG. 03 : ICOSA ]", 75, 880);
      if (on && !reducedMotion()) raf = requestAnimationFrame(draw);
    };
    const io = new IntersectionObserver(([e]) => { on = e.isIntersecting; cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); });
    io.observe(c);
    return () => { on = false; cancelAnimationFrame(raf); io.disconnect(); };
  }, []);
  return <canvas ref={ref} className="wire" aria-hidden="true" />;
}
