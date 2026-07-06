import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAtfxHistoryUids } from "./atfxGroupScope.js";
import { BROKERAGE_ATFX, getAtfxDashboardBillingStats, type AtfxDashboardBillingStats } from "./brokerageTokenBilling.js";
import { listAtfxQuickAnalysisSummaries, rowToQuickAnalysisSummary } from "./atfxQuickAnalysisDb.js";
import type { AtfxQuickAnalysisResult } from "./atfxQuickAnalysis.js";
import { fetchResearchReportListItems } from "./routes/atfxResearchReport.js";
import type { ReportLanguage } from "./atfxResearchReportOptions.js";

export type AtfxDashboardWorkspacePayload = {
  stats: AtfxDashboardBillingStats;
  researchReports: Array<{
    id: string;
    title: string;
    updated_at: string;
    created_at: string;
    languages: ReportLanguage[];
    owner_uid: string;
    owner_email: string | null;
  }>;
  quickAnalysis: Array<AtfxQuickAnalysisResult & { id: string }>;
};

export async function loadAtfxDashboardWorkspace(
  supabase: SupabaseClient,
  uid: string
): Promise<AtfxDashboardWorkspacePayload> {
  const group = await resolveAtfxHistoryUids(supabase, uid);
  const [stats, researchReports, qaRows] = await Promise.all([
    getAtfxDashboardBillingStats(BROKERAGE_ATFX),
    fetchResearchReportListItems(supabase as Parameters<typeof fetchResearchReportListItems>[0], group),
    listAtfxQuickAnalysisSummaries(supabase, group.uids),
  ]);

  return {
    stats,
    researchReports,
    quickAnalysis: qaRows.map((row) =>
      rowToQuickAnalysisSummary(row, group.emailByUid.get(row.firebase_uid) ?? null)
    ),
  };
}
