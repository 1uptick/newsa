import type { AtfxQuickAnalysisResult } from "./atfxQuickAnalysisService";
import type { ReportListItem } from "../pages/ATFX/researchReportUtils";

const CACHE_KEY_PREFIX = "atfx:dashboard-workspace:v1:";
const CACHE_TTL_MS = 5 * 60 * 1000;

export type DashboardBillingStats = {
  current_period: {
    period_id: string;
    period_label: string;
    period_start: string;
    period_end: string;
    research_count: number;
    quick_analysis_count: number;
  };
  monthly_history: Array<{
    period_id: string;
    period_label: string;
    period_start: string;
    period_end: string;
    research_count: number;
    quick_analysis_count: number;
  }>;
};

export type AtfxDashboardWorkspaceCache = {
  uid: string;
  fetchedAt: number;
  stats: DashboardBillingStats;
  researchReports: ReportListItem[];
  quickAnalysis: AtfxQuickAnalysisResult[];
};

function cacheKey(uid: string): string {
  return `${CACHE_KEY_PREFIX}${uid}`;
}

export function readAtfxDashboardWorkspaceCache(uid: string | undefined | null): AtfxDashboardWorkspaceCache | null {
  if (!uid || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AtfxDashboardWorkspaceCache;
    if (parsed.uid !== uid || !parsed.stats || !Array.isArray(parsed.researchReports) || !Array.isArray(parsed.quickAnalysis)) {
      return null;
    }
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeAtfxDashboardWorkspaceCache(
  uid: string | undefined | null,
  payload: Omit<AtfxDashboardWorkspaceCache, "uid" | "fetchedAt">
): void {
  if (!uid || typeof sessionStorage === "undefined") return;
  try {
    const data: AtfxDashboardWorkspaceCache = {
      uid,
      fetchedAt: Date.now(),
      stats: payload.stats,
      researchReports: payload.researchReports,
      quickAnalysis: payload.quickAnalysis,
    };
    sessionStorage.setItem(cacheKey(uid), JSON.stringify(data));
  } catch {
    /* quota / private mode */
  }
}
