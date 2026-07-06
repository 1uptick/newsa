import React from "react";
import { useAuth } from "../../contexts/AuthContext";
import type { MarketMoverEntry, MarketsRightTab } from "../../lib/atfxMarketMoversService";
import { AtfxMarketsForexAddPairModal } from "./AtfxMarketsForexAddPairModal";
import { AtfxMarketsMoversTab } from "./AtfxMarketsMoversTab";
import { useAtfxForexTableState } from "./hooks/useAtfxForexTableState";
import type { useAtfxMarketMoversData } from "./hooks/useAtfxMarketMoversData";

type AtfxMarketsMoversSectionProps = {
  tab: MarketsRightTab;
  movers: ReturnType<typeof useAtfxMarketMoversData>;
  onMoverClick?: (row: MarketMoverEntry) => void;
};

/** Movers / forex / stocks tables — lazy-loaded so the map tab stays lean. */
export default function AtfxMarketsMoversSection({ tab, movers, onMoverClick }: AtfxMarketsMoversSectionProps) {
  const { authFetch } = useAuth();
  const forex = useAtfxForexTableState(authFetch, {
    enabled: tab === "forex",
    moversData: movers.moversData,
  });

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <AtfxMarketsMoversTab
        tab={tab}
        moversData={movers.moversData}
        moversLoading={movers.moversLoading}
        moversError={movers.moversError}
        indexLabel={movers.indexLabel}
        forexMajorRows={forex.forexMajorRows}
        forexCrossRows={forex.forexCrossRows}
        onRetry={movers.retryMovers}
        onForexOrderChange={forex.handleForexOrderChange}
        onAddForexPair={forex.openAddPairModal}
        onRemoveForexPair={forex.removeForexPair}
        onMoverClick={onMoverClick}
      />

      <AtfxMarketsForexAddPairModal
        kind={forex.addPairKind}
        input={forex.addPairInput}
        error={forex.addPairError}
        onInputChange={forex.setAddPairInput}
        onClearError={() => forex.setAddPairError(null)}
        onClose={forex.closeAddPairModal}
        onSubmit={forex.submitAddForexPair}
      />
    </div>
  );
}
