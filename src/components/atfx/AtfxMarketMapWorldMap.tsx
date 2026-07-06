import React, { useCallback } from "react";
import { ComposableMap, Line, Marker } from "react-simple-maps";
import { BrandedSpinner } from "../BrandedSpinner";
import { formatMarketPrice, formatPct } from "../../lib/marketMapFormat";
import { getFlagImageUrl } from "../../lib/atfxMarketMapFlags";
import { useAtfxMarketMapGeography } from "../../hooks/useAtfxMarketMapGeography";
import type { MarketMapIndex } from "../../lib/atfxMarketMapService";
import { AtfxMarketMapGeographies } from "./AtfxMarketMapGeographies";

const MAP_PROJECTION_CONFIG = { scale: 140, center: [20, 30] as [number, number] };

const BOX_OFFSETS: Record<string, { dLat: number; dLng: number }> = {
  "^DJI": { dLat: 14, dLng: -26 },
  "^GSPC": { dLat: 4, dLng: -24 },
  "^NDX": { dLat: -14, dLng: -24 },
  "^GSPTSE": { dLat: 24, dLng: -10 },
  "^FTSE": { dLat: 10, dLng: -20 },
  "^FCHI": { dLat: -10, dLng: 18 },
  "^GDAXI": { dLat: 10, dLng: 22 },
  "^N225": { dLat: 20, dLng: 26 },
  "^KS11": { dLat: -2, dLng: 20 },
  "^HSI": { dLat: -12, dLng: -22 },
  "^TWII": { dLat: -16, dLng: 18 },
  "000001.SS": { dLat: 14, dLng: -26 },
  "^STI": { dLat: -14, dLng: -18 },
  "^BSESN": { dLat: -14, dLng: -22 },
  "^AXJO": { dLat: -12, dLng: 20 },
  "^BVSP": { dLat: 12, dLng: -18 },
};

const BOX_HALF_WIDTH_DEGREES = 20;

function lineEndAtBoxMiddleLeftOrRight(
  anchorLng: number,
  _anchorLat: number,
  boxLng: number,
  boxLat: number
): [number, number] {
  const useLeft = anchorLng < boxLng;
  const edgeLng = useLeft ? boxLng - BOX_HALF_WIDTH_DEGREES : boxLng + BOX_HALF_WIDTH_DEGREES;
  return [edgeLng, boxLat];
}

export type AtfxMarketMapWorldMapProps = {
  indexes: MarketMapIndex[];
  hoveredIndex: string | null;
  onHoverIndex: (symbol: string | null) => void;
  onIndexClick?: (index: MarketMapIndex) => void;
};

interface IndexBubbleContentProps {
  index: MarketMapIndex;
  isHovered: boolean;
  onHover: () => void;
  onLeave: () => void;
  onIndexClick?: (index: MarketMapIndex) => void;
}

const IndexBubbleContent = React.memo<IndexBubbleContentProps>(function IndexBubbleContent({
  index,
  isHovered,
  onHover,
  onLeave,
  onIndexClick,
}) {
  const isGain = index.changesPercentage >= 0;
  const bubbleBg = isGain ? "rgba(125,227,19,0.32)" : "rgba(255,51,102,0.32)";
  const bubbleBorder = isGain ? "rgba(125,227,19,0.8)" : "rgba(255,51,102,0.8)";
  const pctTextColor = isGain ? "#4da006" : "#c71649";
  const scale = isHovered ? 1.15 : 1;
  const tooltipBg = "rgba(255,255,255,0.95)";
  const tooltipStroke = isGain ? "rgba(125,227,19,0.55)" : "rgba(255,51,102,0.55)";
  const h = 38;
  const w = (index.shortName?.length ?? 0) >= 9 ? 128 : 102;
  const flagCdnUrl = getFlagImageUrl(index.country, 20);
  const showFlag = Boolean(flagCdnUrl);

  const handleClick = (e: React.MouseEvent<SVGGElement>) => {
    e.stopPropagation();
    onIndexClick?.(index);
    e.currentTarget.blur();
  };

  return (
    <g
      className="market-map-index-bubble"
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onMouseDown={onIndexClick ? (e) => e.preventDefault() : undefined}
      onClick={handleClick}
      style={{
        cursor: onIndexClick ? "pointer" : "default",
        transform: `scale(${scale})`,
        transition: "transform 0.15s ease",
        outline: "none",
      }}
      role={onIndexClick ? "button" : undefined}
      tabIndex={onIndexClick ? 0 : undefined}
      onKeyDown={
        onIndexClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onIndexClick(index);
              }
            }
          : undefined
      }
    >
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        rx={8}
        ry={8}
        fill={bubbleBg}
        stroke={bubbleBorder}
        strokeWidth={1}
      />
      {showFlag ? (
        <image
          href={flagCdnUrl}
          x={-w / 2 + 8}
          y={-h / 2 + 6}
          width={18}
          height={14}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : null}
      <text
        x={-w / 2 + (showFlag ? 30 : 10)}
        y={-4}
        textAnchor="start"
        fill="#1e293b"
        fontSize={10}
        fontWeight={700}
        fontFamily="system-ui, sans-serif"
      >
        {index.shortName}
      </text>
      <text
        x={0}
        y={10}
        textAnchor="middle"
        fill={pctTextColor}
        fontSize={8}
        fontWeight={700}
        fontFamily="'SF Mono', 'Cascadia Code', monospace"
      >
        {formatPct(index.changesPercentage)}
      </text>
      {isHovered ? (
        <g>
          <rect
            x={-60}
            y={-h / 2 - 32}
            width={120}
            height={26}
            rx={6}
            ry={6}
            fill={tooltipBg}
            stroke={tooltipStroke}
            strokeWidth={0.8}
          />
          {showFlag ? (
            <image
              href={flagCdnUrl}
              x={-56}
              y={-h / 2 - 28}
              width={14}
              height={10}
              preserveAspectRatio="xMidYMid slice"
            />
          ) : null}
          <text
            x={showFlag ? -38 : 0}
            y={-h / 2 - 20}
            textAnchor={showFlag ? "start" : "middle"}
            fill="#64748b"
            fontSize={6}
            fontFamily="system-ui, sans-serif"
          >
            {index.name}
          </text>
          <text
            x={0}
            y={-h / 2 - 11}
            textAnchor="middle"
            fill="#1e293b"
            fontSize={7}
            fontWeight={600}
            fontFamily="'SF Mono', monospace"
          >
            {formatMarketPrice(index.price)} ({index.isOpen ? "OPEN" : "CLOSED"})
          </text>
        </g>
      ) : null}
    </g>
  );
});

const IndexMapMarker = React.memo(function IndexMapMarker({
  index,
  isHovered,
  onHoverIndex,
  onIndexClick,
}: {
  index: MarketMapIndex;
  isHovered: boolean;
  onHoverIndex: (symbol: string | null) => void;
  onIndexClick?: (index: MarketMapIndex) => void;
}) {
  const offset = BOX_OFFSETS[index.symbol] ?? { dLat: 0, dLng: 0 };
  const boxLng = index.lng + offset.dLng;
  const boxLat = index.lat + offset.dLat;
  const lineEnd = lineEndAtBoxMiddleLeftOrRight(index.lng, index.lat, boxLng, boxLat);
  const lineStroke = "#94a3b8";

  const onHover = useCallback(() => onHoverIndex(index.symbol), [onHoverIndex, index.symbol]);
  const onLeave = useCallback(() => onHoverIndex(null), [onHoverIndex]);

  return (
    <React.Fragment>
      <Line from={[index.lng, index.lat]} to={lineEnd} stroke={lineStroke} strokeWidth={0.8} />
      <Marker coordinates={[boxLng, boxLat]}>
        <IndexBubbleContent
          index={index}
          isHovered={isHovered}
          onHover={onHover}
          onLeave={onLeave}
          onIndexClick={onIndexClick}
        />
      </Marker>
    </React.Fragment>
  );
});

export default React.memo(function AtfxMarketMapWorldMap({
  indexes,
  hoveredIndex,
  onHoverIndex,
  onIndexClick,
}: AtfxMarketMapWorldMapProps) {
  const { geography, loading, error } = useAtfxMarketMapGeography();
  const mapBg = "#f8fafc";

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-red-600 text-sm px-4 text-center">
        {error}
      </div>
    );
  }

  if (loading || !geography) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-slate-500 gap-3 flex-col sm:flex-row">
        <BrandedSpinner size="sm" />
        Loading map…
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={MAP_PROJECTION_CONFIG}
        width={900}
        height={500}
        style={{
          background: mapBg,
          width: "100%",
          height: "auto",
          maxHeight: "100%",
        }}
      >
        <AtfxMarketMapGeographies geography={geography} />

        {indexes.map((idx) => (
          <IndexMapMarker
            key={idx.symbol}
            index={idx}
            isHovered={hoveredIndex === idx.symbol}
            onHoverIndex={onHoverIndex}
            onIndexClick={onIndexClick}
          />
        ))}
      </ComposableMap>
    </div>
  );
});
