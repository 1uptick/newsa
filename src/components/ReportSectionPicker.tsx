import React, { useMemo, useState } from "react";
import { Layers, Merge, Pencil, Plus, Scissors, Trash2 } from "lucide-react";
import { sectionReferenceToken } from "../lib/reportHtmlSections";

type ReportSectionPickerProps = {
  sections: string[];
  disabled?: boolean;
  onApplyPrompt: (prompt: string) => void;
};

export function ReportSectionPicker({ sections, disabled, onApplyPrompt }: ReportSectionPickerProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggleSection = (title: string) => {
    setSelected((prev) => {
      if (prev.includes(title)) return prev.filter((t) => t !== title);
      if (prev.length >= 2) return [prev[1], title];
      return [...prev, title];
    });
  };

  const selectedTokens = useMemo(
    () => selected.map((title) => sectionReferenceToken(title)),
    [selected]
  );

  if (!sections.length) return null;

  return (
    <div className="rounded-lg border border-[#ff7900] bg-slate-100 px-3 py-2.5 mb-2 shrink-0">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Layers className="w-3.5 h-3.5 text-[#ff7900] shrink-0" />
        <p className="text-[11px] font-semibold text-slate-700">Section Modification</p>
        <span className="text-[10px] text-slate-500">Click to select · use quick actions below</span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2 max-h-24 overflow-y-auto">
        {sections.map((title) => {
          const isSelected = selected.includes(title);
          return (
            <button
              key={title}
              type="button"
              disabled={disabled}
              onClick={() => toggleSection(title)}
              className={`max-w-full truncate text-left text-[11px] px-2 py-1 rounded-full border transition-colors ${
                isSelected
                  ? "border-[#ff7900] bg-orange-50 text-[#c45a00] font-medium"
                  : "border-slate-200 bg-white text-slate-700 hover:border-[#ff7900]/40 hover:bg-orange-50/40"
              } disabled:opacity-50`}
              title={title}
            >
              {title}
            </button>
          );
        })}
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.length === 1 ? (
            <>
              <QuickAction
                disabled={disabled}
                icon={Pencil}
                label="Revise"
                onClick={() =>
                  onApplyPrompt(`Revise ${selectedTokens[0]}: `)
                }
              />
              <QuickAction
                disabled={disabled}
                icon={Plus}
                label="Add after"
                onClick={() =>
                  onApplyPrompt(`Add a new section after ${selectedTokens[0]}: `)
                }
              />
              <QuickAction
                disabled={disabled}
                icon={Scissors}
                label="Split"
                onClick={() =>
                  onApplyPrompt(`Split ${selectedTokens[0]} into `)
                }
              />
              <QuickAction
                disabled={disabled}
                icon={Trash2}
                label="Remove"
                onClick={() => onApplyPrompt(`Remove ${selectedTokens[0]} section`)}
              />
            </>
          ) : (
            <QuickAction
              disabled={disabled}
              icon={Merge}
              label="Merge"
              onClick={() =>
                onApplyPrompt(
                  `Merge ${selectedTokens[0]} and ${selectedTokens[1]} into `
                )
              }
            />
          )}
        </div>
      ) : (
        <p className="text-[10px] text-slate-400">
          Select a section for revise, split, remove, or add. Select two to merge.
        </p>
      )}
    </div>
  );
}

function QuickAction({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-[#ff7900]/50 hover:text-[#ff7900] disabled:opacity-50 transition-colors"
    >
      <Icon className="w-3 h-3 shrink-0" />
      {label}
    </button>
  );
}
