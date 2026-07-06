import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { getFlagImageUrl } from "../../lib/atfxMarketMapFlags";
import type { GainersLosersIndexOption } from "../../lib/atfxMarketMoversService";

function MarketIndexFlag({ country, className = "" }: { country: string; className?: string }) {
  const flagUrl = getFlagImageUrl(country, 20);
  if (!flagUrl) return null;
  return (
    <span
      className={`inline-flex h-[14px] w-5 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-slate-200 ${className}`}
      aria-hidden
    >
      <img src={flagUrl} alt="" className="block h-full w-full object-cover" width={20} height={14} />
    </span>
  );
}

type AtfxMarketIndexPickerProps = {
  indexes: GainersLosersIndexOption[];
  selectedIndex: string;
  onIndexChange: (symbol: string) => void;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
};

export function AtfxMarketIndexPicker({
  indexes,
  selectedIndex,
  onIndexChange,
  loading = false,
  disabled = false,
  className = "",
}: AtfxMarketIndexPickerProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; right: number; width: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownPortalRef = useRef<HTMLDivElement>(null);

  const currentMeta = indexes.find((i) => i.symbol === selectedIndex);
  const currentLabel = currentMeta?.shortName ?? selectedIndex;
  const currentCountry = currentMeta?.country ?? "";

  useLayoutEffect(() => {
    if (!dropdownOpen || !dropdownRef.current) {
      setDropdownRect(null);
      return;
    }
    const rect = dropdownRef.current.getBoundingClientRect();
    setDropdownRect({
      top: rect.bottom + 4,
      right: rect.right,
      width: Math.max(rect.width, 280),
    });
  }, [dropdownOpen]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownRef.current?.contains(target) || dropdownPortalRef.current?.contains(target)) return;
      setDropdownOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [dropdownOpen]);

  const handlePick = (symbol: string) => {
    onIndexChange(symbol);
    setDropdownOpen(false);
  };

  const isDisabled = disabled || (loading && !currentMeta);

  return (
    <div className={`relative shrink-0 ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setDropdownOpen((o) => !o)}
        disabled={isDisabled}
        className="flex min-w-[140px] max-w-[180px] items-center gap-2 rounded-md border border-slate-200 bg-white py-1 pl-2 pr-7 text-left text-[11px] font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#ff7900]/40 disabled:cursor-wait disabled:opacity-90"
        aria-haspopup="listbox"
        aria-expanded={dropdownOpen}
        aria-label="Select stock index"
        aria-busy={loading}
      >
        {currentCountry ? <MarketIndexFlag country={currentCountry} /> : null}
        <span className="flex-1 truncate">{currentLabel}</span>
        <ChevronDown
          className={`absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {dropdownOpen && dropdownRect && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={dropdownPortalRef}
              role="listbox"
              className="fixed z-[200] grid max-h-[70vh] min-w-[280px] grid-cols-2 gap-0 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
              style={{
                top: dropdownRect.top,
                right: typeof window !== "undefined" ? window.innerWidth - dropdownRect.right : 0,
                width: dropdownRect.width,
              }}
            >
              {indexes.map((idx) => (
                <button
                  key={idx.symbol}
                  type="button"
                  role="option"
                  aria-selected={idx.symbol === selectedIndex}
                  onClick={() => handlePick(idx.symbol)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-slate-100 ${
                    idx.symbol === selectedIndex ? "bg-orange-50 text-[#ff7900]" : "text-slate-800"
                  }`}
                >
                  <MarketIndexFlag country={idx.country} />
                  <span className="truncate">{idx.shortName}</span>
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
