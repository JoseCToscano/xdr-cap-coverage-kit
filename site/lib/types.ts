export type ReaderKey = "js" | "go" | "rust";

export interface Finding {
  type: string;
  arm?: string;
  shape?: string;
  tx: string;
  ledger: number;
  close_time?: number;
  detected_at?: string;
  caps: string[];
  source?: string;
}

export interface Status {
  schema: number;
  generated_at: string;
  net: string;
  readers: Record<ReaderKey, { name: string; lib: string; ledgers_ok: number; roundtrip_ok: number; json_roundtrip_ok?: number }>;
  checker: {
    started_at: string;
    updated_at: string;
    restarts: number;
    first: number;
    cursor: number;
    last_ledger: { seq: number; close_time: number; source: string; txs: number } | null;
    ledgers: number;
    txs: number;
    segments: number;
    worker_hours: number;
    close_time_min: number;
    close_time_max: number;
    protocol: Record<string, number>;
    host_pauses?: { count: number; total_s: number; last: { from: string; to: string; s: number } | null };
    lag?: {
      cursor?: number;
      cursor_close_time?: string;
      workers?: number;
      network_tip?: number;
      network_tip_closed_at?: string;
      ledgers_behind?: number;
      minutes_behind?: number;
      eta_to_tip_min?: number | null;
      at_tip?: boolean;
      catchup_ledgers_per_min?: number;
      measured_at?: string;
      tip_source?: string;
    };
  };
  network: { source: string; ledger: number; closed_at: string; fetched_at: string; lag_ledgers?: number; lag_seconds?: number } | null;
  flags: Record<string, number>;
  flagged_txs: Record<string, number>;
  first_seen: Finding[];
  reader_findings: Finding[];
  bug_shapes: { shape: string; txs: number; caps: string[]; recent: Finding[] }[];
  long_tail: { arms: number; flags: number; txs: number; top: { arm: string; txs: number; caps: string[]; example: { tx: string; ledger: number } | null }[] };
}
