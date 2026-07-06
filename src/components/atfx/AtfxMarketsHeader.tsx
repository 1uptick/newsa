import React from "react";
import { Globe, LayoutGrid, Settings } from "lucide-react";
import { AtfxSymbolSearchBar } from "./AtfxSymbolSearchBar";
import type { AtfxSymbolSearchItem } from "../../lib/atfxSymbolSearchService";

type AtfxMarketsHeaderProps = {
  onSymbolSelect: (item: AtfxSymbolSearchItem) => void;
  onOpenOverallMarketReport: () => void;
  onOpenSettings: () => void;
  searchDisabled?: boolean;
  overallReportDisabled?: boolean;
};

export function AtfxMarketsHeader({
  onSymbolSelect,
  onOpenOverallMarketReport,
  onOpenSettings,
  searchDisabled = false,
  overallReportDisabled = false,
}: AtfxMarketsHeaderProps) {
  return (
    <div className="shrink-0 border-b border-slate-200 bg-white px-4 sm:px-6 lg:px-8 py-3 relative z-20">
      <div className="flex items-center gap-4 min-w-0 w-full">
        <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2 shrink-0">
          <Globe className="w-5 h-5 text-[#ff7900]" aria-hidden />
          Markets
        </h1>
        <div className="flex-1 min-w-0 max-w-2xl">
          <AtfxSymbolSearchBar
            onSelect={onSymbolSelect}
            disabled={searchDisabled}
            placeholder="Search symbol for quick analysis…"
            inputClassName="w-full bg-white border-t-0 border-l-0 border-r-0 border-b-2 border-[#ff7900] rounded-none pl-10 pr-10 py-2 text-sm shadow-none focus:ring-0 focus:border-[#ff7900] outline-none text-slate-900 disabled:opacity-50"
          />
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenOverallMarketReport}
            disabled={overallReportDisabled}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-[#ff7900] hover:bg-[#e66d00] border border-[#e66d00] shadow-sm transition-colors disabled:opacity-50"
          >
            <LayoutGrid className="w-4 h-4" aria-hidden />
            <span className="hidden sm:inline">Overall market report</span>
            <span className="sm:hidden">Overall</span>
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:text-[#ff7900] hover:bg-orange-50 border border-slate-200 hover:border-[#ff7900]/30 transition-colors"
            aria-controls="atfx-markets-settings-panel"
          >
            <Settings className="w-4 h-4" aria-hidden />
            Settings
          </button>
        </div>
      </div>
    </div>
  );
}
