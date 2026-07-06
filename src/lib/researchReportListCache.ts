import type { ReportListItem } from "../pages/ATFX/researchReportUtils";

const CACHE_KEY_PREFIX = "atfx-research-report-list:v1:";
const CACHE_TTL_MS = 5 * 60 * 1000;

type CachedResearchReportList = {
  uid: string;
  fetchedAt: number;
  items: ReportListItem[];
};

function cacheKey(uid: string): string {
  return `${CACHE_KEY_PREFIX}${uid}`;
}

export function readResearchReportListCache(uid: string | undefined | null): ReportListItem[] | null {
  if (!uid || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedResearchReportList;
    if (parsed.uid !== uid || !Array.isArray(parsed.items)) return null;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed.items;
  } catch {
    return null;
  }
}

export function writeResearchReportListCache(uid: string | undefined | null, items: ReportListItem[]): void {
  if (!uid || typeof sessionStorage === "undefined") return;
  try {
    const payload: CachedResearchReportList = {
      uid,
      fetchedAt: Date.now(),
      items,
    };
    sessionStorage.setItem(cacheKey(uid), JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}
