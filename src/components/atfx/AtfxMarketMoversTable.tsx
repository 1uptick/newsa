import React, { useCallback, useState } from "react";
import {
  ArrowLeftRight,
  DollarSign,
  GripVertical,
  Plus,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { formatMarketPrice, formatPct } from "../../lib/marketMapFormat";
import { reorderForexRows } from "../../lib/atfxForexTableOrder";
import type { MarketMoverEntry } from "../../lib/atfxMarketMoversService";

const DISPLAY_ROWS = 20;

const MoversRow = React.memo(function MoversRow({
  rank,
  row,
  isGain,
  mode = "default",
  sortable = false,
  isDragOver = false,
  isDragging = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onRemove,
  onRowClick,
}: {
  rank: number;
  row: MarketMoverEntry;
  isGain: boolean;
  mode?: "default" | "forex";
  sortable?: boolean;
  isDragOver?: boolean;
  isDragging?: boolean;
  onDragStart?: React.DragEventHandler<HTMLElement>;
  onDragOver?: React.DragEventHandler<HTMLTableRowElement>;
  onDragLeave?: React.DragEventHandler<HTMLTableRowElement>;
  onDrop?: React.DragEventHandler<HTMLTableRowElement>;
  onDragEnd?: React.DragEventHandler<HTMLElement>;
  onRemove?: () => void;
  onRowClick?: (row: MarketMoverEntry) => void;
}) {
  const rowIsGain = mode === "forex" ? row.changesPercentage >= 0 : isGain;
  const pctClass = rowIsGain ? "text-emerald-700" : "text-rose-700";
  const displayName =
    mode === "forex"
      ? ""
      : row.name?.trim() && row.name.trim().toUpperCase() !== row.symbol.trim().toUpperCase()
        ? row.name.trim()
        : "";
  const title = displayName ? `${row.symbol} · ${displayName}` : row.symbol;
  const clickable = Boolean(onRowClick);

  const handleRowClick = useCallback(() => {
    onRowClick?.(row);
  }, [onRowClick, row]);

  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTableRowElement>) => {
      if (!onRowClick) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onRowClick(row);
      }
    },
    [onRowClick, row]
  );

  return (
    <tr
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={clickable ? handleRowClick : undefined}
      onKeyDown={clickable ? handleRowKeyDown : undefined}
      className={`border-b border-slate-100 hover:bg-slate-50/80 ${
        isDragging ? "opacity-40" : ""
      } ${isDragOver ? "bg-sky-50 ring-1 ring-inset ring-sky-200" : ""} ${
        clickable ? "cursor-pointer hover:bg-orange-50/60" : ""
      }`}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      title={clickable ? `Run quick analysis for ${title}` : undefined}
    >
      {sortable ? (
        <td className="px-1 py-2 w-7 text-slate-400">
          <span
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center cursor-grab active:cursor-grabbing touch-none"
            aria-label={`Drag to reorder ${row.symbol}`}
            title="Drag to reorder"
          >
            <GripVertical className="w-3.5 h-3.5 pointer-events-none" aria-hidden />
          </span>
        </td>
      ) : null}
      <td className="px-1.5 py-2 text-xs text-slate-400 tabular-nums">{rank}</td>
      <td className="px-1.5 py-2 min-w-0">
        {mode === "forex" ? (
          <span className="font-mono text-sm font-semibold text-slate-900" title={row.symbol}>
            {row.symbol}
          </span>
        ) : (
          <div className="flex items-baseline gap-2 min-w-0" title={title}>
            <span className="font-mono text-sm font-semibold text-slate-900 shrink-0">{row.symbol}</span>
            {displayName ? (
              <span className="text-sm text-slate-500 truncate min-w-0">{displayName}</span>
            ) : null}
          </div>
        )}
      </td>
      <td
        className={`px-1.5 py-2 text-right font-mono text-xs text-slate-600 whitespace-nowrap ${
          mode === "forex" ? "" : "hidden sm:table-cell"
        }`}
      >
        {formatMarketPrice(row.price)}
      </td>
      <td className={`px-1.5 py-2 text-right font-mono text-xs font-bold whitespace-nowrap ${pctClass}`}>
        {formatPct(row.changesPercentage)}
      </td>
      {onRemove ? (
        <td className="px-1 py-2 w-7 text-right">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="inline-flex items-center justify-center w-5 h-5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            aria-label={`Remove ${row.symbol}`}
            title="Remove pair"
          >
            <X className="w-3.5 h-3.5" aria-hidden />
          </button>
        </td>
      ) : null}
    </tr>
  );
});

export function AtfxMarketMoversTable({
  title,
  rows,
  isGain,
  emptyLabel,
  mode = "default",
  forexVariant,
  sortable = false,
  onSortableOrderChange,
  onAddPair,
  onRemovePair,
  onRowClick,
}: {
  title: string;
  rows: MarketMoverEntry[];
  isGain: boolean;
  emptyLabel: string;
  mode?: "default" | "forex";
  forexVariant?: "major" | "cross";
  sortable?: boolean;
  onSortableOrderChange?: (order: string[]) => void;
  onAddPair?: () => void;
  onRemovePair?: (symbol: string) => void;
  onRowClick?: (row: MarketMoverEntry) => void;
}) {
  const isForex = mode === "forex";
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const displayRows = rows.slice(0, DISPLAY_ROWS);

  const finishDrag = useCallback(() => {
    setDragFromIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback(
    (dropIndex: number) => {
      if (dragFromIndex === null || dragFromIndex === dropIndex || !onSortableOrderChange) {
        finishDrag();
        return;
      }
      const reordered = reorderForexRows(displayRows, dragFromIndex, dropIndex);
      onSortableOrderChange(reordered.map((r) => r.symbol));
      finishDrag();
    },
    [displayRows, dragFromIndex, finishDrag, onSortableOrderChange]
  );

  let borderClass: string;
  let headerBgClass: string;
  let HeaderIcon: typeof TrendingUp;

  if (isForex && forexVariant === "major") {
    borderClass = "border-sky-200";
    headerBgClass = "bg-sky-700 border-sky-800";
    HeaderIcon = DollarSign;
  } else if (isForex && forexVariant === "cross") {
    borderClass = "border-violet-200";
    headerBgClass = "bg-violet-700 border-violet-800";
    HeaderIcon = ArrowLeftRight;
  } else {
    borderClass = isGain ? "border-emerald-200" : "border-rose-200";
    headerBgClass = isGain ? "bg-emerald-600 border-emerald-700" : "bg-rose-600 border-rose-700";
    HeaderIcon = isGain ? TrendingUp : TrendingDown;
  }

  const symbolHeader = isForex ? "Pair" : "Symbol";

  return (
    <div className={`flex flex-col min-h-0 min-w-0 flex-1 border rounded-lg bg-white ${borderClass}`}>
      <div className={`shrink-0 px-2.5 py-1.5 border-b flex items-center gap-1.5 text-white ${headerBgClass}`}>
        <HeaderIcon className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <h3 className="text-[11px] font-bold uppercase tracking-wider">{title}</h3>
        <div className="ml-auto flex items-center gap-1.5">
          {onAddPair ? (
            <button
              type="button"
              onClick={onAddPair}
              className="inline-flex items-center justify-center w-5 h-5 rounded bg-white/15 hover:bg-white/25 text-white transition-colors"
              aria-label={`Add pair to ${title}`}
              title="Add FX pair"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden />
            </button>
          ) : null}
          <span className="text-[10px] text-white/80 tabular-nums">{rows.length}</span>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="p-3 text-xs text-slate-400 text-center">{emptyLabel}</p>
        ) : (
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-white/95 backdrop-blur-sm z-[1]">
              <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-100">
                {sortable ? <th className="px-1 py-1.5 font-semibold w-7" aria-label="Reorder" /> : null}
                <th className="px-1.5 py-1.5 font-semibold w-6">#</th>
                <th className="px-1.5 py-1.5 font-semibold">{symbolHeader}</th>
                <th
                  className={`px-1.5 py-1.5 font-semibold text-right ${
                    isForex ? "" : "hidden sm:table-cell"
                  }`}
                >
                  Price
                </th>
                <th className="px-1.5 py-1.5 font-semibold text-right">Chg</th>
                {onRemovePair ? <th className="px-1 py-1.5 font-semibold w-7" aria-label="Remove" /> : null}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row, i) => (
                <MoversRow
                  key={row.symbol}
                  rank={i + 1}
                  row={row}
                  isGain={isGain}
                  mode={mode}
                  sortable={sortable}
                  isDragOver={sortable && dragOverIndex === i && dragFromIndex !== i}
                  isDragging={sortable && dragFromIndex === i}
                  onDragStart={
                    sortable
                      ? (e) => {
                          setDragFromIndex(i);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", row.symbol);
                        }
                      : undefined
                  }
                  onDragOver={
                    sortable
                      ? (e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          if (dragOverIndex !== i) setDragOverIndex(i);
                        }
                      : undefined
                  }
                  onDragLeave={
                    sortable
                      ? () => {
                          if (dragOverIndex === i) setDragOverIndex(null);
                        }
                      : undefined
                  }
                  onDrop={
                    sortable
                      ? (e) => {
                          e.preventDefault();
                          handleDrop(i);
                        }
                      : undefined
                  }
                  onDragEnd={sortable ? finishDrag : undefined}
                  onRemove={onRemovePair ? () => onRemovePair(row.symbol) : undefined}
                  onRowClick={onRowClick}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
