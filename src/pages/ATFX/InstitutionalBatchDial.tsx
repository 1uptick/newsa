import React from "react";

const INSTITUTIONAL_BATCH_DIAL_ANGLES: Record<1 | 2 | 3, number> = { 1: -56, 2: 0, 3: 56 };
const INSTITUTIONAL_BATCH_DIAL_RADIUS_PX = 78;

export function InstitutionalBatchDial({
  value,
  onChange,
}: {
  value: 1 | 2 | 3;
  onChange: (n: 1 | 2 | 3) => void;
}) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      if (value < 3) onChange((value + 1) as 1 | 2 | 3);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      if (value > 1) onChange((value - 1) as 1 | 2 | 3);
    }
  };

  const angle = INSTITUTIONAL_BATCH_DIAL_ANGLES[value];

  return (
    <div
      className="mx-auto flex w-full max-w-[26rem] flex-col items-center rounded-xl pt-1 pb-2 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      role="radiogroup"
      aria-label="Number of topics to generate"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="relative h-[11rem] w-full">
        <div className="absolute bottom-[0.7rem] left-1/2 h-0 w-0 -translate-x-1/2">
          <div
            className="pointer-events-none absolute bottom-0 left-1/2 h-[5.25rem] w-1.5 origin-bottom rounded-full bg-primary/95 shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)]"
            style={{ transform: `translateX(-50%) rotate(${angle}deg)` }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute bottom-0 left-1/2 z-[1] h-7 w-7 -translate-x-1/2 translate-y-1/2 rounded-full border-[3px] border-white bg-slate-800 shadow-md ring-2 ring-slate-400/50"
            aria-hidden
          />
          {([1, 2, 3] as const).map((n) => {
            const deg = INSTITUTIONAL_BATCH_DIAL_ANGLES[n];
            const rad = (deg * Math.PI) / 180;
            const r = INSTITUTIONAL_BATCH_DIAL_RADIUS_PX;
            const x = Math.sin(rad) * r;
            const y = -Math.cos(rad) * r;
            const selected = value === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${n} topic${n === 1 ? "" : "s"}`}
                onClick={() => onChange(n)}
                className={`absolute z-[2] flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-lg font-bold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${
                  selected
                    ? "scale-105 bg-primary text-white shadow-md ring-2 ring-primary/30"
                    : "border-[3px] border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50"
                }`}
                style={{ left: x, top: y }}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-sm text-slate-500 tabular-nums" aria-live="polite">
        Selected: <span className="font-semibold text-slate-800">{value}</span>
      </p>
    </div>
  );
}
