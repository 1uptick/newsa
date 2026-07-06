import React, { lazy, Suspense } from "react";
import { BrandedSpinner } from "../BrandedSpinner";
import { AtfxMarketsMapSideColumn } from "./AtfxMarketsMapSideColumn";
import type { MarketMapIndex } from "../../lib/atfxMarketMapService";

const AtfxMarketMapWorldMap = lazy(() => import("./AtfxMarketMapWorldMap"));

type AtfxMarketsMapTabProps = {
  indexes: MarketMapIndex[];
  openIndexes: MarketMapIndex[];
  closedIndexes: MarketMapIndex[];
  hoveredIndex: string | null;
  onHoverIndex: (symbol: string | null) => void;
  onIndexClick: (index: MarketMapIndex) => void;
};

export const AtfxMarketsMapTab = React.memo(function AtfxMarketsMapTab({
  indexes,
  openIndexes,
  closedIndexes,
  hoveredIndex,
  onHoverIndex,
  onIndexClick,
}: AtfxMarketsMapTabProps) {
  return (
    <div className="flex-1 min-h-0 flex flex-col lg:flex-row min-w-0">
      <div className="flex-1 min-h-[220px] lg:min-h-0 relative overflow-hidden bg-slate-100 min-w-0">
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center text-slate-500 gap-3 flex-col sm:flex-row">
              <BrandedSpinner size="sm" />
              Loading map…
            </div>
          }
        >
          <AtfxMarketMapWorldMap
            indexes={indexes}
            hoveredIndex={hoveredIndex}
            onHoverIndex={onHoverIndex}
            onIndexClick={onIndexClick}
          />
        </Suspense>
      </div>

      <AtfxMarketsMapSideColumn
        openIndexes={openIndexes}
        closedIndexes={closedIndexes}
        hoveredIndex={hoveredIndex}
        onHoverIndex={onHoverIndex}
        onIndexClick={onIndexClick}
      />
    </div>
  );
});
