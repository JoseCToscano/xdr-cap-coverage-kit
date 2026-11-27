export const fmt = (n: number | undefined | null) => (n == null ? "-" : n.toLocaleString("en-US"));
export const short = (h: string, n = 12) => `${h.slice(0, n)}…`;
export const txUrl = (tx: string, net = "pubnet") => `https://stellar.expert/explorer/${net === "testnet" ? "testnet" : "public"}/tx/${tx}`;
export const ledgerUrl = (l: number, net = "pubnet") => `https://stellar.expert/explorer/${net === "testnet" ? "testnet" : "public"}/ledger/${l}`;
export const REPO = "https://github.com/JoseCToscano/xdr-cap-coverage-kit";
export const repoFile = (p: string) => `${REPO}/blob/main/${p}`;

export function utc(t: number | string | undefined | null): string {
  if (t == null) return "-";
  const d = typeof t === "number" ? new Date(t * 1000) : new Date(t);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

export function duration(sec: number): string {
  if (!Number.isFinite(sec)) return "-";
  const s = Math.max(0, Math.round(sec));
  if (s < 90) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

export const ISSUES: Record<string, { label: string; url: string; note: string }> = {
  "muxed.id_ge_2^53 (JS-unsafe, #1785 shape)": {
    label: "js-stellar-sdk #1785",
    url: "https://github.com/stellar/js-stellar-sdk/issues/1785",
    note: "Muxed account ID at or above 2^53. Unsafe if it passes through a JS number.",
  },
  "soroban.creates_trustline (#731 shape)": {
    label: "wallet-backend #731",
    url: "https://github.com/stellar/wallet-backend/issues/731",
    note: "Soroban transaction that creates a trustline through a SAC trust() call nested in the auth tree.",
  },
  "sac.trust_creates_trustline (#731 exact)": {
    label: "wallet-backend #731",
    url: "https://github.com/stellar/wallet-backend/issues/731",
    note: "The same creates_trustline shape as #731, in the SAC trust form: the host function itself is trust().",
  },
};
