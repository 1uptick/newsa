import { useCallback, useEffect, useRef, useState } from "react";
import type { QuickAnalysisSession } from "../components/atfx/AtfxQuickAnalysisSidebar";
import { useAuth } from "../contexts/AuthContext";
import {
  quickAnalysisResultToSession,
  type AtfxQuickAnalysisResult,
} from "./atfxQuickAnalysisService";
import { mergeLiteQuickAnalysisHistoryCache } from "./atfxQuickAnalysisHistoryCache";
import { writeResearchReportListCache } from "./researchReportListCache";
import {
  readAtfxDashboardWorkspaceCache,
  writeAtfxDashboardWorkspaceCache,
  type DashboardBillingStats,
} from "./atfxDashboardCache";
import type { ReportListItem } from "../pages/ATFX/researchReportUtils";

type WorkspaceResponse = {
  stats: DashboardBillingStats;
  researchReports: ReportListItem[];
  quickAnalysis: AtfxQuickAnalysisResult[];
};

function workspaceFromCache(uid: string | undefined | null) {
  const cached = readAtfxDashboardWorkspaceCache(uid);
  if (!cached) return null;
  return {
    stats: cached.stats,
    researchReports: cached.researchReports,
    qaSessions: cached.quickAnalysis.map(quickAnalysisResultToSession),
  };
}

export function useAtfxDashboardWorkspace() {
  const { authFetch, user } = useAuth();
  const uid = user?.uid;

  const initial = workspaceFromCache(uid);
  const [stats, setStats] = useState<DashboardBillingStats | null>(initial?.stats ?? null);
  const [researchReports, setResearchReports] = useState<ReportListItem[]>(initial?.researchReports ?? []);
  const [qaSessions, setQaSessions] = useState<QuickAnalysisSession[]>(initial?.qaSessions ?? []);
  const [loading, setLoading] = useState(!initial);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasDataRef = useRef(Boolean(initial));

  const applyWorkspace = useCallback(
    (data: WorkspaceResponse) => {
      hasDataRef.current = true;
      setStats(data.stats);
      setResearchReports(data.researchReports);
      setQaSessions(data.quickAnalysis.map(quickAnalysisResultToSession));
      writeAtfxDashboardWorkspaceCache(uid, {
        stats: data.stats,
        researchReports: data.researchReports,
        quickAnalysis: data.quickAnalysis,
      });
      writeResearchReportListCache(uid, data.researchReports);
      mergeLiteQuickAnalysisHistoryCache(uid, data.quickAnalysis);
    },
    [uid]
  );

  const load = useCallback(
    async (opts?: { forceRefresh?: boolean }) => {
      if (!uid) return;
      if (hasDataRef.current) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await authFetch("/api/atfx/dashboard/workspace", {
          ...(opts?.forceRefresh ? { forceRefresh: true } : {}),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error || `Failed to load dashboard (${res.status})`);
        }
        applyWorkspace((await res.json()) as WorkspaceResponse);
      } catch (err) {
        if (!hasDataRef.current) {
          setError(err instanceof Error ? err.message : "Could not load dashboard");
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [applyWorkspace, authFetch, uid]
  );

  useEffect(() => {
    const cached = workspaceFromCache(uid);
    hasDataRef.current = Boolean(cached);
    if (cached) {
      setStats(cached.stats);
      setResearchReports(cached.researchReports);
      setQaSessions(cached.qaSessions);
      setLoading(false);
    } else {
      setLoading(true);
    }
    void load();
  }, [load, uid]);

  return {
    stats,
    researchReports,
    qaSessions,
    loading,
    refreshing,
    error,
    refresh: () => load({ forceRefresh: true }),
  };
}
