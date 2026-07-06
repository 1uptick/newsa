/**
 * ATFX orange header bar overlay for OHLC chart PNGs (research + articles only).
 */

import sharp from "sharp";
import { isGoldChartInput } from "./chartSymbolHelpers.js";

export const ATFX_CHART_BRAND_ORANGE = "#f2682a";
const BANNER_HEIGHT = 32;
const BANNER_FONT_SIZE = 14;
/** Covers TradingView logo at bottom-left on chart-img snapshots (light theme). */
const TV_LOGO_COVER_WIDTH = 180;
const TV_LOGO_COVER_HEIGHT = 34;
const CHART_LIGHT_BG = "#ffffff";
const CHART_DARK_BG = "#131722";

export type AtfxChartBrandOverlayOptions = {
  /** Paint over the TradingView logo (chart-img / TV branding at bottom-left). Default true. */
  hideTradingViewLogo?: boolean;
  theme?: "light" | "dark";
};

/** User-facing symbol for the brand strip e.g. ATFX · DXY */
export function formatAtfxChartBrandLabel(rawInput?: string, tradingViewSymbol?: string): string {
  const raw = (rawInput ?? "").trim().toUpperCase();
  if (raw && !raw.includes(":") && raw.length <= 20) {
    return raw.replace(/\s+/g, "");
  }

  const tv = (tradingViewSymbol ?? raw).toUpperCase();
  if (/DXY/.test(tv)) return "DXY";
  if (isGoldChartInput(raw) || isGoldChartInput(tv)) return "XAUUSD";

  const tail = tv.includes(":") ? (tv.split(":").pop() ?? tv) : tv;
  const cleaned = tail.replace(/[^A-Z0-9/!.-]/g, "").slice(0, 20);
  return cleaned || "CHART";
}

function buildBannerSvg(width: number, text: string): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${BANNER_HEIGHT}">
  <rect width="100%" height="100%" fill="${ATFX_CHART_BRAND_ORANGE}"/>
  <text x="12" y="21" fill="#ffffff" font-family="system-ui,Segoe UI,Arial,sans-serif" font-size="${BANNER_FONT_SIZE}" font-weight="700">${escapeXml(text)}</text>
</svg>`;
  return Buffer.from(svg);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildTradingViewLogoCoverSvg(width: number, height: number, fill: string): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="${fill}"/>
</svg>`;
  return Buffer.from(svg);
}

/** Composite orange ATFX banner on top of a Chart-IMG PNG. */
export async function applyAtfxChartBrandOverlay(
  png: Buffer,
  bannerText: string,
  opts?: AtfxChartBrandOverlayOptions
): Promise<Buffer> {
  const meta = await sharp(png).metadata();
  const width = meta.width ?? 800;
  const height = meta.height ?? 500;
  const banner = buildBannerSvg(width, bannerText);
  const theme = opts?.theme ?? "light";
  const hideTradingViewLogo = opts?.hideTradingViewLogo !== false;

  const composites: sharp.OverlayOptions[] = [{ input: banner, top: 0, left: 0 }];

  if (hideTradingViewLogo) {
    const coverW = Math.min(TV_LOGO_COVER_WIDTH, width);
    const coverH = TV_LOGO_COVER_HEIGHT;
    const fill = theme === "dark" ? CHART_DARK_BG : CHART_LIGHT_BG;
    composites.push({
      input: buildTradingViewLogoCoverSvg(coverW, coverH, fill),
      top: Math.max(BANNER_HEIGHT, height - coverH - 2),
      left: 0,
    });
  }

  return sharp(png)
    .composite(composites)
    .png()
    .toBuffer();
}
