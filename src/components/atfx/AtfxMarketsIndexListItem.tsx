import React from "react";
import { formatMarketPrice, formatPct } from "../../lib/marketMapFormat";
import type { MarketMapIndex } from "../../lib/atfxMarketMapService";

type AtfxMarketsIndexListItemProps = {
  index: MarketMapIndex;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onClick?: () => void;
};

export const AtfxMarketsIndexListItem = React.memo(function AtfxMarketsIndexListItem({
  index,
  isHovered,
  onHover,
  onLeave,
  onClick,
}: AtfxMarketsIndexListItemProps) {
  const isGain = index.changesPercentage >= 0;
  const hoverBg = isHovered
    ? isGain
      ? "bg-emerald-50 border-emerald-300"
      : "bg-rose-50 border-rose-300"
    : isGain
      ? "bg-emerald-50/60 border-emerald-200"
      : "bg-rose-50/60 border-rose-200";

  const inner = (
    <>
      <span
        className={`shrink-0 w-2 h-2 rounded-full ${index.isOpen ? "bg-emerald-500 market-open-pulse" : "bg-red-500"}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900 truncate leading-tight">{index.shortName}</p>
        <p className="text-[10px] text-slate-500 truncate leading-tight">
          {index.exchange} • {index.country}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs text-slate-600 font-mono leading-tight">{formatMarketPrice(index.price)}</p>
        <p className={`text-xs font-mono font-bold leading-tight ${isGain ? "text-emerald-700" : "text-rose-700"}`}>
          {formatPct(index.changesPercentage)}
        </p>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={onHover}
        onMouseLeave={onLeave}
        className={`w-full rounded-lg border px-3 py-2 flex items-center gap-2 transition-colors text-left cursor-pointer ${hoverBg}`}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      className={`rounded-lg border px-3 py-2 flex items-center gap-2 transition-colors ${hoverBg}`}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      {inner}
    </div>
  );
});
