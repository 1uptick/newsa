import {
  readAtfxDashboardWorkspaceCache,
  writeAtfxDashboardWorkspaceCache,
  type AtfxDashboardWorkspaceCache,
} from "./atfxDashboardCache";
import { writeResearchReportListCache } from "./researchReportListCache";
import { mergeLiteQuickAnalysisHistoryCache } from "./atfxQuickAnalysisHistoryCache";

type AuthFetch = (url: string, opts?: RequestInit & { forceRefresh?: boolean }) => Promise<Response>;

let dashboardChunkPrefetched = false;
let workspaceWarmPromise: Promise<void> | null = null;

/** Preload the ATFX dashboard route chunk. */
export function prefetchAtfxDashboardPageChunk(): void {
  if (dashboardChunkPrefetched) return;
  dashboardChunkPrefetched = true;
  void import("../pages/ATFX/atfxDashboard");
}

type WorkspacePayload = Omit<AtfxDashboardWorkspaceCache, "uid" | "fetchedAt">;

/** Warm dashboard workspace API + session cache (nav hover or sibling ATFX pages). */
export function prefetchAtfxDashboardWorkspace(authFetch: AuthFetch, uid: string | undefined | null): void {
  if (!uid) return;
  if (workspaceWarmPromise) return;

  workspaceWarmPromise = (async () => {
    try {
      const res = await authFetch("/api/atfx/dashboard/workspace");
      if (!res.ok) return;
      const data = (await res.json()) as WorkspacePayload;
      writeAtfxDashboardWorkspaceCache(uid, data);
      writeResearchReportListCache(uid, data.researchReports);
      mergeLiteQuickAnalysisHistoryCache(uid, data.quickAnalysis);
    } catch {
      /* ignore */
    } finally {
      workspaceWarmPromise = null;
    }
  })();
}

export function warmAtfxDashboardNavLink(to: string): (() => void) | undefined {
  if (!to.includes("/atfx/dashboard")) return undefined;
  return () => prefetchAtfxDashboardPageChunk();
}

/** Returns cached workspace if still fresh (for instant paint without waiting on hook). */
export function peekAtfxDashboardWorkspaceCache(uid: string | undefined | null) {
  return readAtfxDashboardWorkspaceCache(uid);
}
