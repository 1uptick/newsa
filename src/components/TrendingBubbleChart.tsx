import React, { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

export type TrendBubbleVariant = "HK" | "Global";

const BUBBLE_COLORS: Record<TrendBubbleVariant, string> = {
  HK: "rgba(220, 38, 38, 0.75)",
  Global: "rgba(37, 99, 235, 0.75)",
};

export function TrendingBubbleChart({
  items,
  variant = "HK",
}: {
  items: { keyword: string; score: number }[];
  variant?: TrendBubbleVariant;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 380, h: 240 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const { clientWidth, clientHeight } = el;
      if (clientWidth > 0 && clientHeight > 0) setSize({ w: clientWidth, h: clientHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (items.length === 0) return null;

  const minScore = Math.min(...items.map((i) => i.score));
  const maxScore = Math.max(...items.map((i) => i.score));
  const range = maxScore - minScore || 1;

  const containerW = size.w;
  const containerH = size.h;
  const scale = Math.min(containerW / 380, containerH / 240, 2);
  const padding = 8;
  const usableW = containerW - padding * 2;
  const usableH = containerH - padding * 2;
  const cx = containerW / 2;
  const cy = containerH / 2;
  const maxDist = Math.min(usableW, usableH) * 0.42;

  const minPx = Math.round(28 * scale);
  const maxPx = Math.round(115 * scale);
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const positions: { keyword: string; score: number; size: number; x: number; y: number }[] = [];

  const inBounds = (x: number, y: number, r: number) =>
    x - r >= padding && x + r <= containerW - padding && y - r >= padding && y + r <= containerH - padding;

  sorted.forEach((item, i) => {
    const sizePx = minPx + ((item.score - minScore) / range) * (maxPx - minPx);
    const radius = sizePx / 2;

    if (i === 0) {
      const clampedX = Math.max(padding + radius, Math.min(containerW - padding - radius, cx));
      const clampedY = Math.max(padding + radius, Math.min(containerH - padding - radius, cy));
      positions.push({ ...item, size: sizePx, x: clampedX, y: clampedY });
    } else {
      let placed = false;
      let angle = i * 0.7;
      let dist = 15;

      while (!placed && dist < maxDist) {
        const x = cx + dist * Math.cos(angle);
        const y = cy + dist * Math.sin(angle);

        if (!inBounds(x, y, radius)) {
          angle += 0.12;
          dist += 0.35;
          continue;
        }

        const hasCollision = positions.some((p) => {
          const dx = x - p.x;
          const dy = y - p.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          return d < radius + p.size / 2 - 1;
        });

        if (!hasCollision) {
          positions.push({ ...item, size: sizePx, x, y });
          placed = true;
        } else {
          angle += 0.1;
          dist += 0.35;
        }
      }
    }
  });

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden flex items-center justify-center bg-slate-50/30 rounded-xl"
    >
      <div className="relative w-full h-full overflow-hidden rounded-xl" style={{ width: containerW, height: containerH }}>
        {positions.map((item, i) => (
          <motion.div
            key={`${item.keyword}-${i}`}
            draggable
            onDragStart={(e: unknown) => {
              const de = e as { dataTransfer?: DataTransfer | null };
              de.dataTransfer?.setData("text/plain", item.keyword);
              if (de.dataTransfer) de.dataTransfer.effectAllowed = "copy";
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.05, type: "spring", stiffness: 100 }}
            className="absolute rounded-full flex flex-col items-center justify-center text-center shadow-md border border-white/20 backdrop-blur-[2px] cursor-grab active:cursor-grabbing text-[#000] font-normal"
            style={{
              width: item.size,
              height: item.size,
              left: item.x - item.size / 2,
              top: item.y - item.size / 2,
              backgroundColor: BUBBLE_COLORS[variant],
              padding: Math.max(4, Math.min(8, item.size * 0.1)),
              zIndex: 10 - i,
            }}
            title={`${item.keyword} — drag to Generate box`}
          >
            <span
              className="font-normal leading-tight line-clamp-2 pointer-events-none"
              style={{
                fontSize: item.size < 44 ? 9 : item.size < 60 ? 10 : item.size < 80 ? 11 : 12,
              }}
            >
              {item.keyword}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
