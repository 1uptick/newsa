import React, { useCallback, useState } from "react";
import { AtfxMarketsIndexListItem } from "./AtfxMarketsIndexListItem";
import type { MarketMapIndex } from "../../lib/atfxMarketMapService";

type MarketStatusSectionProps = {
  title: string;
  countLabel: string;
  dotClassName: string;
  indexes: MarketMapIndex[];
  hoveredIndex: string | null;
  onHoverIndex: (symbol: string | null) => void;
  onIndexClick: (index: MarketMapIndex) => void;
  defaultOpen?: boolean;
  bordered?: boolean;
};

const MarketStatusSection = React.memo(function MarketStatusSection({
  title,
  countLabel,
  dotClassName,
  indexes,
  hoveredIndex,
  onHoverIndex,
  onIndexClick,
  defaultOpen = true,
  bordered = false,
}: MarketStatusSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  const handleHover = useCallback((symbol: string) => () => onHoverIndex(symbol), [onHoverIndex]);
  const handleLeave = useCallback(() => onHoverIndex(null), [onHoverIndex]);
  const handleClick = useCallback((index: MarketMapIndex) => () => onIndexClick(index), [onIndexClick]);

  if (indexes.length === 0) return null;

  return (
    <div className={`min-h-0 flex flex-col ${bordered ? "border-t border-slate-200" : ""}`}>
      <div className="shrink-0 px-3 py-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="w-full flex items-center gap-2 text-left"
          aria-expanded={open}
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${dotClassName}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{title}</h2>
            <p className="text-[10px] text-slate-500">{indexes.length} {countLabel}</p>
          </div>
        </button>
      </div>
      {open ? (
        <div className="flex-1 min-h-0 overflow-y-auto p-2 max-h-[180px] lg:max-h-none">
          <ul className="space-y-1.5">
            {indexes.map((index) => (
              <li key={index.symbol} className="list-none">
                <AtfxMarketsIndexListItem
                  index={index}
                  isHovered={hoveredIndex === index.symbol}
                  onHover={handleHover(index.symbol)}
                  onLeave={handleLeave}
                  onClick={handleClick(index)}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
});

type AtfxMarketsMapSideColumnProps = {
  openIndexes: MarketMapIndex[];
  closedIndexes: MarketMapIndex[];
  hoveredIndex: string | null;
  onHoverIndex: (symbol: string | null) => void;
  onIndexClick: (index: MarketMapIndex) => void;
};

export const AtfxMarketsMapSideColumn = React.memo(function AtfxMarketsMapSideColumn({
  openIndexes,
  closedIndexes,
  hoveredIndex,
  onHoverIndex,
  onIndexClick,
}: AtfxMarketsMapSideColumnProps) {
  if (openIndexes.length === 0 && closedIndexes.length === 0) return null;

  return (
    <aside className="w-full lg:w-56 shrink-0 min-h-0 flex flex-col border-t lg:border-t-0 lg:border-l border-slate-200 bg-white">
      <MarketStatusSection
        title="Market open"
        countLabel="markets"
        dotClassName="bg-emerald-500 market-open-pulse"
        indexes={openIndexes}
        hoveredIndex={hoveredIndex}
        onHoverIndex={onHoverIndex}
        onIndexClick={onIndexClick}
      />
      <MarketStatusSection
        title="Market closed"
        countLabel="markets"
        dotClassName="bg-red-500"
        indexes={closedIndexes}
        hoveredIndex={hoveredIndex}
        onHoverIndex={onHoverIndex}
        onIndexClick={onIndexClick}
        defaultOpen={false}
        bordered
      />
    </aside>
  );
});
