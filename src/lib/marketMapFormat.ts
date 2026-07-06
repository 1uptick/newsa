export function formatPct(n: number | null | undefined): string {
  if (n == null || typeof n !== "number" || !Number.isFinite(n)) return "";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function formatMarketPrice(n: number): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs === 0) return "0";
  let decimals: number;
  if (abs >= 10000) decimals = 0;
  else if (abs >= 100) decimals = 2;
  else if (abs >= 1) decimals = 4;
  else if (abs >= 0.01) decimals = 6;
  else if (abs >= 0.0001) decimals = 8;
  else return n.toExponential(2);
  const raw = n.toFixed(decimals);
  return decimals > 0 ? raw.replace(/\.?0+$/, "") || "0" : raw;
}

export function formatTradeVolume(n: number | null | undefined): string {
  if (n == null || typeof n !== "number" || !Number.isFinite(n) || n < 0) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

export function formatMarketLastUpdated(ts: number): string {
  if (!Number.isFinite(ts)) return "";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
