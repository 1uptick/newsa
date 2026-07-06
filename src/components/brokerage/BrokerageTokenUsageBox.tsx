import React, { useMemo } from "react";
import { Coins, Loader2 } from "lucide-react";
import { formatBrokerageTokenCount, type BrokerageTokenBalance } from "../../lib/brokerageTokens";

type BrokerageTokenUsageBoxProps = {
  balance: BrokerageTokenBalance | null;
  loading?: boolean;
  className?: string;
  compact?: boolean;
  /** `navbar` = dark top menu; `light` = white page headers (default). */
  theme?: "light" | "navbar";
};

export function BrokerageTokenUsageBox({
  balance,
  loading = false,
  className = "",
  compact = false,
  theme = "light",
}: BrokerageTokenUsageBoxProps) {
  const { remainingPct, barColor, total, remaining, label } = useMemo(() => {
    const displayName = balance?.display_name ?? "ATFX";
    const limit = balance?.limit ?? 0;
    const rem = Math.max(0, balance?.remaining ?? 0);
    const pct = limit > 0 ? Math.min(100, Math.max(0, (rem / limit) * 100)) : 0;
    const color = pct <= 10 ? "bg-red-500" : pct <= 25 ? "bg-amber-500" : "bg-[#ff7900]";
    return {
      remainingPct: pct,
      barColor: color,
      total: limit,
      remaining: rem,
      label: displayName,
    };
  }, [balance]);

  const iconSize = compact ? "w-3.5 h-3.5" : "w-4 h-4";
  const padding = compact ? "px-2 py-1" : "px-2.5 py-1.5";
  const isNavbar = theme === "navbar";

  if (loading && !balance) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 ${padding} rounded-lg shrink-0 ${
          isNavbar
            ? "border border-white/15 bg-white/5 text-slate-400"
            : "border border-slate-200 bg-slate-50 text-slate-500"
        } ${className}`}
      >
        <Loader2 className={`${iconSize} animate-spin ${isNavbar ? "text-slate-400" : "text-slate-400"}`} />
        <span className="text-xs">Tokens…</span>
      </div>
    );
  }

  if (!balance) return null;

  return (
    <div
      className={`inline-flex items-center gap-2 ${padding} rounded-lg shrink-0 ${
        isNavbar
          ? "border border-white/15 bg-white/5"
          : "border border-slate-200 bg-white"
      } ${className}`}
      title={`${label} billing period · ${balance.period_id} · ${balance.used.toLocaleString()} used`}
    >
      <Coins className={`${iconSize} text-[#ff7900] shrink-0`} aria-hidden />
      <span
        className={`text-[10px] font-bold uppercase shrink-0 hidden sm:inline ${
          isNavbar ? "text-slate-400" : "text-slate-500"
        }`}
      >
        {label}
      </span>
      <div
        className={`${compact ? "h-1 w-10" : "h-1.5 w-14"} rounded-full overflow-hidden shrink-0 ${
          isNavbar ? "bg-white/20" : "bg-slate-200"
        }`}
        title={`${Math.round(remainingPct)}% remaining`}
      >
        <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${remainingPct}%` }} />
      </div>
      <span
        className={`text-xs font-semibold tabular-nums whitespace-nowrap ${
          isNavbar ? "text-white" : "text-slate-800"
        }`}
      >
        {formatBrokerageTokenCount(remaining)}
        <span className={`font-medium ${isNavbar ? "text-slate-400" : "text-slate-400"}`}>
          {" "}
          / {formatBrokerageTokenCount(total)}
        </span>
      </span>
    </div>
  );
}
