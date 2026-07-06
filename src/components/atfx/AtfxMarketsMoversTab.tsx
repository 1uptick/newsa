import React from "react";
import { Loader2 } from "lucide-react";
import { AtfxMarketMoversTable } from "./AtfxMarketMoversTable";
import type { ForexTableKind } from "../../lib/atfxForexTableOrder";
import type { MarketMoverEntry, MarketMoversData, MarketsRightTab } from "../../lib/atfxMarketMoversService";

type AtfxMarketsMoversTabProps = {
  tab: MarketsRightTab;
  moversData: MarketMoversData | null;
  moversLoading: boolean;
  moversError: string | null;
  indexLabel: string;
  forexMajorRows: MarketMoverEntry[];
  forexCrossRows: MarketMoverEntry[];
  onRetry: () => void;
  onForexOrderChange: (kind: ForexTableKind, order: string[]) => void;
  onAddForexPair: (kind: ForexTableKind) => void;
  onRemoveForexPair: (kind: ForexTableKind, symbol: string) => void;
  onMoverClick?: (row: MarketMoverEntry) => void;
};

export const AtfxMarketsMoversTab = React.memo(function AtfxMarketsMoversTab({
  tab,
  moversData,
  moversLoading,
  moversError,
  indexLabel,
  forexMajorRows,
  forexCrossRows,
  onRetry,
  onForexOrderChange,
  onAddForexPair,
  onRemoveForexPair,
  onMoverClick,
}: AtfxMarketsMoversTabProps) {
  return (
    <>
      {moversError ? (
        <div className="shrink-0 mx-3 mt-2 p-2 rounded-lg bg-red-50 text-red-800 text-xs border border-red-200 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate">{moversError}</span>
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 px-2 py-0.5 rounded bg-red-100 hover:bg-red-200 font-semibold"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 p-2 relative">
        {moversLoading && !moversData ? (
          <div className="absolute inset-0 flex items-center justify-center text-slate-500 gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            Loading movers…
          </div>
        ) : null}

        {moversData && !moversError ? (
          <div className="h-full flex flex-col sm:flex-row gap-2 min-h-0">
            {tab === "forex" ? (
              <>
                <AtfxMarketMoversTable
                  title="Major currencies"
                  rows={forexMajorRows}
                  isGain
                  mode="forex"
                  forexVariant="major"
                  sortable
                  onSortableOrderChange={(order) => onForexOrderChange("major", order)}
                  onAddPair={() => onAddForexPair("major")}
                  onRemovePair={(symbol) => onRemoveForexPair("major", symbol)}
                  onRowClick={onMoverClick}
                  emptyLabel="No major pairs"
                />
                <AtfxMarketMoversTable
                  title="Cross currencies"
                  rows={forexCrossRows}
                  isGain={false}
                  mode="forex"
                  forexVariant="cross"
                  sortable
                  onSortableOrderChange={(order) => onForexOrderChange("cross", order)}
                  onAddPair={() => onAddForexPair("cross")}
                  onRemovePair={(symbol) => onRemoveForexPair("cross", symbol)}
                  onRowClick={onMoverClick}
                  emptyLabel="No cross pairs"
                />
              </>
            ) : (
              <>
                <AtfxMarketMoversTable
                  title="Top gainers"
                  rows={moversData.gainers}
                  isGain
                  emptyLabel="No gainers yet"
                  onRowClick={onMoverClick}
                />
                <AtfxMarketMoversTable
                  title="Top losers"
                  rows={moversData.losers}
                  isGain={false}
                  emptyLabel="No losers yet"
                  onRowClick={onMoverClick}
                />
              </>
            )}
          </div>
        ) : null}

        {moversLoading && moversData ? (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[1px] rounded-lg"
            aria-busy="true"
          >
            <Loader2 className="w-4 h-4 animate-spin text-slate-500" aria-hidden />
          </div>
        ) : null}
      </div>

      {tab === "stocks" && moversData && !moversLoading ? (
        <p className="shrink-0 px-3 pb-2 text-[10px] text-slate-400">{indexLabel} · top movers by daily change</p>
      ) : null}
      {tab === "forex" && moversData && !moversLoading ? (
        <p className="shrink-0 px-3 pb-2 text-[10px] text-slate-400">
          Drag the grip icon to reorder · click a row for quick analysis · + to add · × to remove
        </p>
      ) : null}
    </>
  );
});
