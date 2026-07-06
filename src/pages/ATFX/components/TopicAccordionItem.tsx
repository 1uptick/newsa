import React from "react";
import { ChevronDown, ChevronRight, Pencil, RefreshCw, Sparkles } from "lucide-react";
import { topicSourcePillClass } from "../../../lib/topicSourcePill";
import type { CapitalKeywordItem } from "../../Capital/types";

function TopicAccordionItemInner({
  item,
  isOpen,
  onToggle,
  onStartReport,
  onCustomize,
  onRegenerate,
  disabled,
  regenerating,
  active,
}: {
  item: CapitalKeywordItem;
  isOpen: boolean;
  onToggle: () => void;
  onStartReport: () => void;
  onCustomize?: () => void;
  onRegenerate?: () => void;
  disabled?: boolean;
  regenerating?: boolean;
  active?: boolean;
}) {
  const keywords = [item.keyword1, item.keyword2, item.keyword3, item.keywordTag].filter(Boolean);
  return (
    <div
      className={`border rounded-lg overflow-hidden ${
        active ? "border-[#ff7900] ring-1 ring-[#ff7900]/30" : "border-slate-200"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-2 px-3 py-2.5 text-left bg-white hover:bg-slate-50 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
        ) : (
          <ChevronRight className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
        )}
        <span className="text-sm font-semibold text-slate-800 leading-snug flex-1 min-w-0">
          {item.title}
          {item.custom === "yes" ? (
            <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-[#c45f00]">
              Customized
            </span>
          ) : null}
        </span>
      </button>
      {isOpen ? (
        <div className="px-3 pb-3 pt-1 bg-white border-t border-slate-100 space-y-2.5">
          {item.source ? (
            <span className={topicSourcePillClass(item.source)}>{item.source}</span>
          ) : null}
          {item.summary ? (
            <p className="text-sm text-slate-600 leading-relaxed">{item.summary}</p>
          ) : null}
          {item.socialHook ? (
            <p className="text-xs text-slate-500 italic">{item.socialHook}</p>
          ) : null}
          {keywords.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {keywords.map((kw) => (
                <span
                  key={kw}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium"
                >
                  {kw}
                </span>
              ))}
            </div>
          ) : null}
          {(item.psyTrigger || item.stockTag) && (
            <div className="text-xs text-slate-500 space-y-0.5">
              {item.psyTrigger ? <p>Trigger: {item.psyTrigger}</p> : null}
              {item.stockTag ? <p>Tag: {item.stockTag}</p> : null}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <button
              type="button"
              onClick={onStartReport}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#ff7900] hover:bg-[#e66d00] rounded-lg transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Start Article
            </button>
            {onCustomize ? (
              <button
                type="button"
                onClick={onCustomize}
                disabled={disabled || regenerating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors disabled:opacity-50"
              >
                <Pencil className="w-3.5 h-3.5" />
                Customize
              </button>
            ) : null}
            {onRegenerate ? (
              <button
                type="button"
                onClick={onRegenerate}
                disabled={disabled || regenerating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? "animate-spin" : ""}`} />
                {regenerating ? "Generating…" : "Another topic"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export const TopicAccordionItem = React.memo(TopicAccordionItemInner);
