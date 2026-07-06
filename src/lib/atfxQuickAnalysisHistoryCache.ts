import type { AtfxQuickAnalysisResult } from "./atfxQuickAnalysisService";

const CACHE_KEY_PREFIX = "atfx:quick-analysis-history:v2:";
const CACHE_TTL_MS = 5 * 60 * 1000;

type CachedQuickAnalysisHistory = {
  uid: string;
  fetchedAt: number;
  items: AtfxQuickAnalysisResult[];
};

function cacheKey(uid: string): string {
  return `${CACHE_KEY_PREFIX}${uid}`;
}

export function readQuickAnalysisHistoryCache(uid: string | undefined | null): AtfxQuickAnalysisResult[] | null {
  if (!uid || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedQuickAnalysisHistory;
    if (parsed.uid !== uid || !Array.isArray(parsed.items)) return null;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed.items;
  } catch {
    return null;
  }
}

export function writeQuickAnalysisHistoryCache(
  uid: string | undefined | null,
  items: AtfxQuickAnalysisResult[]
): void {
  if (!uid || typeof sessionStorage === "undefined") return;
  try {
    const payload: CachedQuickAnalysisHistory = {
      uid,
      fetchedAt: Date.now(),
      items,
    };
    sessionStorage.setItem(cacheKey(uid), JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

/** Merge lite list rows into cache without wiping already-hydrated report bodies. */
export function mergeLiteQuickAnalysisHistoryCache(
  uid: string | undefined | null,
  liteItems: AtfxQuickAnalysisResult[]
): void {
  if (!uid || liteItems.length === 0) return;
  const existing = readQuickAnalysisHistoryCache(uid) ?? [];
  const byId = new Map<string, AtfxQuickAnalysisResult>();
  for (const item of existing) {
    if (item.id) byId.set(item.id, item);
  }
  for (const item of liteItems) {
    if (!item.id) continue;
    const prev = byId.get(item.id);
    byId.set(item.id, {
      ...prev,
      ...item,
      report: prev?.report?.trim() ? prev.report : item.report,
      reportTc: prev?.reportTc?.trim() ? prev.reportTc : item.reportTc,
      reportSc: prev?.reportSc?.trim() ? prev.reportSc : item.reportSc,
      reportTh: prev?.reportTh?.trim() ? prev.reportTh : item.reportTh,
      reportVi: prev?.reportVi?.trim() ? prev.reportVi : item.reportVi,
    });
  }
  const merged = [...byId.values()].sort((a, b) => b.timestamp - a.timestamp);
  writeQuickAnalysisHistoryCache(uid, merged);
}

export function upsertQuickAnalysisHistoryCacheItem(
  uid: string | undefined | null,
  item: AtfxQuickAnalysisResult
): void {
  if (!uid || !item.id) return;
  const existing = readQuickAnalysisHistoryCache(uid) ?? [];
  const idx = existing.findIndex((entry) => entry.id === item.id);
  const next = [...existing];
  if (idx === -1) next.unshift(item);
  else next[idx] = { ...next[idx], ...item };
  writeQuickAnalysisHistoryCache(uid, next);
}
