import React, { useCallback, useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useDebouncedAtfxSymbolSearch } from "../../hooks/useDebouncedAtfxSymbolSearch";
import type { AtfxSymbolSearchItem } from "../../lib/atfxSymbolSearchService";

type AtfxSymbolSearchBarProps = {
  onSelect: (item: AtfxSymbolSearchItem) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
};

export function AtfxSymbolSearchBar({
  onSelect,
  disabled = false,
  placeholder = "Search symbol…",
  className = "",
  inputClassName = "",
}: AtfxSymbolSearchBarProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { results, isSearching } = useDebouncedAtfxSymbolSearch(query, {
    enabled: !disabled && open,
  });

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const handleSelect = useCallback(
    (item: AtfxSymbolSearchItem) => {
      onSelect(item);
      setQuery(item.symbol);
      setOpen(false);
    },
    [onSelect]
  );

  const handleClear = useCallback(() => {
    setQuery("");
    setOpen(false);
  }, []);

  const trimmed = query.trim();
  const showDropdown = open && !disabled && (isSearching || results.length > 0 || trimmed.length >= 2);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#ff7900] shrink-0 pointer-events-none"
        aria-hidden
      />
      <input
        type="text"
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (e.target.value.trim().length >= 2) setOpen(true);
        }}
        onFocus={() => {
          if (trimmed.length >= 2) setOpen(true);
        }}
        className={
          inputClassName ||
          "w-full bg-white border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-sm focus:ring-2 focus:ring-[#ff7900]/30 focus:border-[#ff7900] outline-none text-slate-900 disabled:opacity-50"
        }
        autoComplete="off"
        aria-label="Search symbol"
        aria-expanded={showDropdown}
        aria-haspopup="listbox"
      />
      {query && !disabled ? (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-slate-100 text-slate-400"
          aria-label="Clear search"
        >
          <X className="w-3.5 h-3.5" aria-hidden />
        </button>
      ) : null}

      {showDropdown ? (
        <ul
          className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg py-1"
          role="listbox"
        >
          {isSearching ? (
            <li className="px-3 py-2 text-xs text-slate-500">Searching…</li>
          ) : null}
          {!isSearching &&
            results.map((item) => (
              <li key={item.symbol}>
                <button
                  type="button"
                  role="option"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 text-slate-800"
                  onClick={() => handleSelect(item)}
                >
                  <span className="font-bold">{item.symbol}</span>
                  {item.name && item.name.toUpperCase() !== item.symbol.toUpperCase() ? (
                    <span className="text-slate-500 ml-2">{item.name}</span>
                  ) : null}
                  {item.exchange ? <span className="text-slate-400 ml-1 text-xs">({item.exchange})</span> : null}
                </button>
              </li>
            ))}
          {!isSearching && trimmed.length >= 2 && results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-slate-500">No symbols found</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
