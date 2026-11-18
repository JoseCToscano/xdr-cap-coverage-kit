import type { Status } from "./types";

export interface Tip { ledger: number; closed_at: string; source: string; fetched_at: string }

export type Health = "at-tip" | "catching-up" | "behind" | "stale" | "unknown";

export interface LagView {
  health: Health;
  tip: { ledger: number; closed_at: string; source: string } | null;
  ledgersBehind: number | null;
  secondsBehind: number | null;
  feedAgeSec: number;
  etaMin: number | null;
  ratePerMin: number | null;
  workers: number | null;
  measuredBy: "browser" | "checker" | null;
}

// A ledger closes about every 5 to 6 s. "At tip" allows a few ledgers of slack.
const AT_TIP_SEC = 120;
// The checker host rewrites status.json every minute or two; older than this means it stopped publishing.
const STALE_FEED_SEC = 15 * 60;

export function lagView(s: Status, liveTip: Tip | null, now: number): LagView {
  const feedAgeSec = (now - Date.parse(s.generated_at)) / 1000;
  const last = s.checker.last_ledger;
  let tip: LagView["tip"] = null;
  const L = s.checker.lag;
  let measuredBy: LagView["measuredBy"] = null;
  // Prefer the tip this browser just read from Horizon; otherwise the checker's own measurement.
  if (liveTip) { tip = liveTip; measuredBy = "browser"; }
  else if (L?.network_tip && L.network_tip_closed_at) { tip = { ledger: L.network_tip, closed_at: L.network_tip_closed_at, source: L.tip_source ?? "checker" }; measuredBy = "checker"; }
  else if (s.network) { tip = { ledger: s.network.ledger, closed_at: s.network.closed_at, source: s.network.source }; measuredBy = "checker"; }
  let ledgersBehind: number | null = null;
  let secondsBehind: number | null = null;
  if (tip && last) {
    ledgersBehind = Math.max(0, tip.ledger - last.seq);
    secondsBehind = Math.max(0, Date.parse(tip.closed_at) / 1000 - last.close_time);
  }
  const eta = L?.eta_to_tip_min ?? null;
  let health: Health = "unknown";
  if (feedAgeSec > STALE_FEED_SEC) health = "stale";
  else if (secondsBehind == null) health = "unknown";
  else if (secondsBehind <= AT_TIP_SEC) health = "at-tip";
  else if ((eta != null && eta > 0) || (L?.catchup_ledgers_per_min ?? 0) > 12) health = "catching-up";
  else health = "behind";
  return { health, tip, ledgersBehind, secondsBehind, feedAgeSec, etaMin: eta, ratePerMin: L?.catchup_ledgers_per_min ?? null, workers: L?.workers ?? null, measuredBy };
}

export const HEALTH_LABEL: Record<Health, string> = {
  "at-tip": "At network tip",
  "catching-up": "Behind tip, catching up",
  behind: "Behind network tip",
  stale: "Feed is stale",
  unknown: "Tip unknown",
};
