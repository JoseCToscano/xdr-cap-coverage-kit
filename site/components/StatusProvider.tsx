"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Status } from "@/lib/types";
import type { Tip } from "@/lib/lag";

// Live data: NEXT_PUBLIC_STATUS_URL (status.json published by the checker host),
// falling back to the snapshot bundled at build time (/status.json).
const REMOTE = process.env.NEXT_PUBLIC_STATUS_URL ?? "";
const HORIZON = process.env.NEXT_PUBLIC_HORIZON_URL ?? "https://horizon.stellar.org/";
const POLL_MS = 60_000;
const TIP_MS = 30_000;

export type Source = "live" | "bundled";
interface Ctx { status: Status; source: Source; tip: Tip | null; now: number; error: string | null }
const C = createContext<Ctx | null>(null);

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store", headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`${r.status}`);
  return (await r.json()) as T;
}

export function StatusProvider({ initial, children }: { initial: Status; children: ReactNode }) {
  const [status, setStatus] = useState(initial);
  const [source, setSource] = useState<Source>("bundled");
  const [tip, setTip] = useState<Tip | null>(null);
  const [now, setNow] = useState(() => Date.parse(initial.generated_at));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    const load = async () => {
      if (REMOTE) {
        try {
          const s = await getJSON<Status>(REMOTE);
          if (!dead && s?.schema === 1) { setStatus(s); setSource("live"); setError(null); }
          return;
        } catch (e) { if (!dead) setError(`live feed unreachable (${(e as Error).message}); showing the bundled snapshot`); }
      }
      try {
        const s = await getJSON<Status>("/status.json");
        if (!dead && s?.schema === 1) { setStatus(s); setSource("bundled"); }
      } catch { /* keep the server-rendered snapshot */ }
    };
    const loadTip = async () => {
      try {
        const j = await getJSON<{ history_latest_ledger: number; history_latest_ledger_closed_at: string }>(HORIZON);
        if (!dead) setTip({ ledger: j.history_latest_ledger, closed_at: j.history_latest_ledger_closed_at, source: new URL(HORIZON).host, fetched_at: new Date().toISOString() });
      } catch { /* lag falls back to the tip recorded in status.json */ }
    };
    setNow(Date.now());
    load(); loadTip();
    const a = setInterval(load, POLL_MS), b = setInterval(loadTip, TIP_MS), c = setInterval(() => setNow(Date.now()), 5_000);
    return () => { dead = true; clearInterval(a); clearInterval(b); clearInterval(c); };
  }, []);

  return <C.Provider value={{ status, source, tip, now, error }}>{children}</C.Provider>;
}

export function useStatus(): Ctx {
  const v = useContext(C);
  if (!v) throw new Error("useStatus outside StatusProvider");
  return v;
}
