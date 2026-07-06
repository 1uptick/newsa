import { writeResearchReportListCache } from "./researchReportListCache";
import type { ReportListItem } from "../pages/ATFX/researchReportUtils";
import { fetchAtfxQuickAnalysisHistoryLite } from "./atfxQuickAnalysisService";
import { mergeLiteQuickAnalysisHistoryCache } from "./atfxQuickAnalysisHistoryCache";
import { prefetchAtfxDashboardWorkspace } from "./prefetchAtfxDashboard";

type AuthFetch = (
  input: RequestInfo | URL,
  init?: RequestInit & { forceRefresh?: boolean }
) => Promise<Response>;

let chunkPrefetched = false;
let listWarmPromise: Promise<void> | null = null;

/** Preload the Research Article route chunk (call from nav hover or ATFX dashboard). */
export function prefetchResearchReportPageChunk(): void {
  if (chunkPrefetched) return;
  chunkPrefetched = true;
  void import("../pages/ATFX/atfxResearchReport");
}

/** Warm the report list API and session cache before navigating to Research Article. */
export function prefetchResearchReportList(authFetch: AuthFetch, uid: string | undefined | null): void {
  if (!uid) return;
  if (listWarmPromise) return;

  listWarmPromise = (async () => {
    try {
      const res = await authFetch("/api/atfx/research-report");
      if (!res.ok) return;
      const data = await res.json();
      const items = Array.isArray(data) ? (data as ReportListItem[]) : [];
      writeResearchReportListCache(uid, items);
    } catch {
      /* ignore */
    } finally {
      listWarmPromise = null;
    }
  })();
}

export function prefetchResearchReportWorkspace(authFetch: AuthFetch, uid: string | undefined | null): void {
  prefetchResearchReportPageChunk();
  prefetchResearchReportList(authFetch, uid);
  prefetchAtfxDashboardWorkspace(authFetch, uid);
  if (uid) {
    void fetchAtfxQuickAnalysisHistoryLite(authFetch)
      .then((items) => mergeLiteQuickAnalysisHistoryCache(uid, items))
      .catch(() => {});
  }
}

export function warmResearchReportNavLink(to: string): (() => void) | undefined {
  if (!to.includes("/atfx/research-report")) return undefined;
  return () => prefetchResearchReportPageChunk();
}
