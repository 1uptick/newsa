import React, { lazy, Suspense, useCallback, useState } from "react";
import { Clock, Coins, DollarSign, Gem, Globe, LineChart, Loader2, type LucideIcon } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { formatMarketLastUpdated } from "../../lib/marketMapFormat";
import {
  DEFAULT_STOCK_INDEX_SYMBOL,
  MARKET_MOVERS_CATEGORIES,
  type MarketsRightTab,
} from "../../lib/atfxMarketMoversService";
import type { MarketMapIndex } from "../../lib/atfxMarketMapService";
import type { MarketMoverEntry } from "../../lib/atfxMarketMoversService";
import { prefetchMarketsMoversSection } from "../../lib/atfxMarketMapGeography";
import { AtfxMarketIndexPicker } from "./AtfxMarketIndexPicker";
import { AtfxMarketsMapTab } from "./AtfxMarketsMapTab";
import { useAtfxMarketMoversData } from "./hooks/useAtfxMarketMoversData";

const AtfxMarketsMoversSection = lazy(() => import("./AtfxMarketsMoversSection"));

function MarketLastUpdatedLabel({ ts }: { ts: number }) {
  return (
    <span className="text-sm text-slate-600 flex items-center gap-1.5 shrink-0 whitespace-nowrap">
      <Clock className="w-4 h-4" aria-hidden />
      Updated {formatMarketLastUpdated(ts)}
    </span>
  );
}

function AtfxMarketsMoversSectionFallback() {
  return (
    <div className="flex-1 flex items-center justify-center text-slate-500 gap-2 text-sm min-h-[200px]">
      <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
      Loading panel…
    </div>
  );
}

export const MARKETS_RIGHT_TABS: { id: MarketsRightTab; label: string }[] = [
  { id: "map", label: "World Indices" },
  ...MARKET_MOVERS_CATEGORIES,
];

const MARKETS_TAB_ICONS: Record<MarketsRightTab, LucideIcon> = {
  map: Globe,
  forex: DollarSign,
  commodities: Gem,
  stocks: LineChart,
  crypto: Coins,
};

type AtfxMarketsRightPanelProps = {
  className?: string;
  indexes: MarketMapIndex[];
  openIndexes: MarketMapIndex[];
  closedIndexes: MarketMapIndex[];
  hoveredIndex: string | null;
  onHoverIndex: (symbol: string | null) => void;
  onIndexClick: (index: MarketMapIndex) => void;
  onMoverClick?: (row: MarketMoverEntry) => void;
  mapLastUpdated?: number | null;
};

export const AtfxMarketsRightPanel = React.memo(function AtfxMarketsRightPanel({
  className = "",
  indexes,
  openIndexes,
  closedIndexes,
  hoveredIndex,
  onHoverIndex,
  onIndexClick,
  onMoverClick,
  mapLastUpdated = null,
}: AtfxMarketsRightPanelProps) {
  const [tab, setTab] = useState<MarketsRightTab>("map");
  const { authFetch } = useAuth();
  const movers = useAtfxMarketMoversData(authFetch, tab);

  const selectTab = useCallback((next: MarketsRightTab) => {
    setTab(next);
    if (next !== "map") prefetchMarketsMoversSection();
  }, []);

  const lastUpdatedTs =
    tab === "map" ? mapLastUpdated : movers.moversData?.lastUpdated ?? null;

  return (
    <section className={`flex flex-col min-h-0 bg-white ${className}`}>
      <div className="shrink-0 px-3 py-2 border-b border-slate-200 flex items-center gap-2 w-full">
        <div className="flex flex-1 min-w-0 gap-1 overflow-x-auto scrollbar-hide" role="tablist" aria-label="Markets panel">
          {MARKETS_RIGHT_TABS.map((item) => {
            const selected = tab === item.id;
            const TabIcon = MARKETS_TAB_ICONS[item.id];
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onMouseEnter={() => {
                  if (item.id !== "map") prefetchMarketsMoversSection();
                }}
                onFocus={() => {
                  if (item.id !== "map") prefetchMarketsMoversSection();
                }}
                onClick={() => selectTab(item.id)}
                className={`shrink-0 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors inline-flex items-center gap-1 ${
                  selected
                    ? "bg-[#ff7900] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800"
                }`}
              >
                <TabIcon className="w-3 h-3 shrink-0" aria-hidden />
                {item.label}
              </button>
            );
          })}
        </div>

        {tab === "stocks" || lastUpdatedTs ? (
          <div className="shrink-0 flex items-center gap-2 ml-auto">
            {tab === "stocks" ? (
              <AtfxMarketIndexPicker
                indexes={
                  movers.indexOptions.length > 0
                    ? movers.indexOptions
                    : [{ symbol: DEFAULT_STOCK_INDEX_SYMBOL, shortName: "S&P 500", country: "US" }]
                }
                selectedIndex={movers.stockIndex}
                onIndexChange={movers.setStockIndex}
                loading={movers.moversLoading && !movers.moversData}
              />
            ) : null}
            {lastUpdatedTs ? <MarketLastUpdatedLabel ts={lastUpdatedTs} /> : null}
          </div>
        ) : null}
      </div>

      {tab === "map" ? (
        <AtfxMarketsMapTab
          indexes={indexes}
          openIndexes={openIndexes}
          closedIndexes={closedIndexes}
          hoveredIndex={hoveredIndex}
          onHoverIndex={onHoverIndex}
          onIndexClick={onIndexClick}
        />
      ) : (
        <Suspense fallback={<AtfxMarketsMoversSectionFallback />}>
          <AtfxMarketsMoversSection tab={tab} movers={movers} onMoverClick={onMoverClick} />
        </Suspense>
      )}
    </section>
  );
});

/** @deprecated Import from `./AtfxMarketsRightPanel` instead. */
export { AtfxMarketsRightPanel as default };
