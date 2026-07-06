import React from "react";
import { Globe, X } from "lucide-react";
import { ResearchReportWordPressCategoriesSection } from "./ResearchReportWordPressCategoriesSection";
import type { AtfxWordPressCategory } from "../../../lib/atfxResearchWordPressSettings";

type ResearchReportWordPressSettingsPanelProps = {
  open: boolean;
  categories: AtfxWordPressCategory[];
  onCategoriesChange: (categories: AtfxWordPressCategory[]) => void;
  onClose: () => void;
};

export function ResearchReportWordPressSettingsPanel({
  open,
  categories,
  onCategoriesChange,
  onClose,
}: ResearchReportWordPressSettingsPanelProps) {
  return (
    <>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-900/25"
          aria-label="Close WordPress settings"
          onClick={onClose}
        />
      ) : null}

      <div
        id="research-wordpress-settings-panel"
        className={`fixed top-16 bottom-0 right-0 z-50 w-[min(100%,320px)] flex flex-col bg-white border-l border-slate-200 shadow-2xl transition-transform duration-200 ease-out ${
          open ? "translate-x-0" : "translate-x-full pointer-events-none"
        }`}
        aria-hidden={!open}
      >
        <div className="shrink-0 px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50/80">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Globe className="w-4 h-4 text-[#ff7900]" aria-hidden />
            WordPress
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-200/80 transition-colors"
            aria-label="Close WordPress settings panel"
          >
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          <section className="rounded-xl border border-slate-200/90 bg-slate-50 p-3 text-[11px] text-slate-600 leading-relaxed">
            <p className="font-semibold text-slate-800 mb-1">WordPress connection</p>
            <p>
              Site URL, username, and Application Password are configured on the server (
              <code className="font-mono text-[10px]">ATFX_WORDPRESS_*</code> in{" "}
              <code className="font-mono text-[10px]">.env</code>). Categories below are saved in this browser for
              the publish modal.
            </p>
          </section>
          <ResearchReportWordPressCategoriesSection
            categories={categories}
            onChange={onCategoriesChange}
          />
        </div>
      </div>
    </>
  );
}
