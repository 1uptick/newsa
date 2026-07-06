import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Sparkles, Coins } from "lucide-react";
import { BrandedSpinner } from "../../components/BrandedSpinner";
import { ContentAreaLoader } from "../../components/ContentAreaLoader";
import { useBrokerageTokenBalanceContext } from "../../contexts/BrokerageTokenBalanceContext";
import { formatBrokerageTokenCount } from "../../lib/brokerageTokens";
import { AtfxDashboardArticlesPanel } from "./components/AtfxDashboardArticlesPanel";
import { ATFX_PAGE_SHELL_CLASS } from "../../lib/atfxPageLayout";
import { prefetchResearchReportPageChunk } from "../../lib/prefetchResearchReportPage";
import { prefetchMarketsWorkspace } from "../../lib/prefetchMarketsPage";
import { useAuth } from "../../contexts/AuthContext";
import { useAtfxDashboardWorkspace } from "../../lib/useAtfxDashboardWorkspace";

function SummaryCard({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  value: string;
  loading?: boolean;
}) {
  return (
    <div className="relative rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-2 shadow-sm items-center justify-center text-center min-w-0 min-h-[6.5rem]">
      <div className="absolute top-3 left-3 shrink-0" aria-hidden>
        {icon}
      </div>
      <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider leading-snug">{label}</span>
      {loading ? (
        <BrandedSpinner size="sm" />
      ) : (
        <span className="text-2xl font-bold text-slate-900">{value}</span>
      )}
    </div>
  );
}

export default function AtfxDashboardPage() {
  const { authFetch, user } = useAuth();
  const navigate = useNavigate();
  const { balance: tokenBalance, loading: tokenBalanceLoading } = useBrokerageTokenBalanceContext();
  const { stats, researchReports, qaSessions, loading, error } = useAtfxDashboardWorkspace();

  useEffect(() => {
    prefetchResearchReportPageChunk();
    prefetchMarketsWorkspace(authFetch, user?.uid);
  }, [authFetch, user?.uid]);

  const current = stats?.current_period;
  const tokensRemaining = tokenBalance ? formatBrokerageTokenCount(tokenBalance.remaining) : "—";
  const statsLoading = loading && !stats;

  return (
    <div className={`${ATFX_PAGE_SHELL_CLASS} py-8 h-[calc(100vh-4rem)] min-h-0 flex flex-col lg:block`}>
      <div className="flex flex-col lg:flex-row gap-8 flex-1 min-h-0 lg:h-full">
        <aside className="lg:sticky lg:top-24 lg:self-start order-2 lg:order-1 flex flex-col w-full lg:w-[40%] lg:min-w-0 shrink-0 lg:h-full">
          <div className="flex items-center gap-3 mb-6 shrink-0">
            <img
              src="/profile/atfx.jpg"
              alt="ATFX"
              className="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-200 shadow-sm"
            />
            <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          </div>

          <div className="flex-1 min-h-0 flex flex-col gap-6">
            <div className="min-h-0 flex flex-col gap-4" style={{ flex: "2 1 0%" }}>
              <div className="grid grid-cols-3 gap-3">
                <SummaryCard
                  icon={<FileText className="w-5 h-5 shrink-0 text-[#ff7900]" aria-hidden />}
                  label={
                    <>
                      <span className="block">Research articles</span>
                      <span className="block normal-case">(current period)</span>
                    </>
                  }
                  value={current ? String(current.research_count) : "—"}
                  loading={statsLoading}
                />
                <SummaryCard
                  icon={<Sparkles className="w-5 h-5 shrink-0 text-[#ff7900]" aria-hidden />}
                  label={
                    <>
                      <span className="block">Quick analysis</span>
                      <span className="block normal-case">(current period)</span>
                    </>
                  }
                  value={current ? String(current.quick_analysis_count) : "—"}
                  loading={statsLoading}
                />
                <SummaryCard
                  icon={<Coins className="w-5 h-5 shrink-0 text-[#ff7900]" aria-hidden />}
                  label={
                    <>
                      <span className="block">Tokens remaining</span>
                      <span className="block normal-case">(current period)</span>
                    </>
                  }
                  value={tokensRemaining}
                  loading={tokenBalanceLoading && !tokenBalance}
                />
              </div>

              <div className="flex-1 min-h-0 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col overflow-hidden">
                <div className="shrink-0 px-4 py-3 border-b border-slate-100">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Usage by billing period</h3>
                  {current ? (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Current period: {current.period_label}
                    </p>
                  ) : null}
                </div>

                {statsLoading ? (
                  <ContentAreaLoader variant="inline" size="sm" />
                ) : error ? (
                  <p className="flex flex-1 items-center justify-center px-4 py-8 text-sm text-slate-500 text-center">
                    {error}
                  </p>
                ) : !stats?.monthly_history.length ? (
                  <p className="flex flex-1 items-center justify-center px-4 py-8 text-sm text-slate-400">No usage data</p>
                ) : (
                  <div className="flex-1 min-h-0 overflow-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-[1]">
                        <tr className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                          <th className="px-4 py-2.5">Billing period</th>
                          <th className="px-3 py-2.5 text-right">Research</th>
                          <th className="px-4 py-2.5 text-right">Quick analysis</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {[...stats.monthly_history].reverse().map((row) => {
                          const isCurrent = row.period_id === current?.period_id;
                          return (
                            <tr
                              key={row.period_id}
                              className={isCurrent ? "bg-orange-50/60" : "hover:bg-slate-50/80"}
                            >
                              <td className="px-4 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                                {row.period_label}
                                {isCurrent ? (
                                  <span className="ml-2 text-[10px] font-bold uppercase text-[#ff7900]">Current</span>
                                ) : null}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                                {row.research_count.toLocaleString()}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                                {row.quick_analysis_count.toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <div className="min-h-0" style={{ flex: "1 1 0%" }} aria-hidden />
          </div>
        </aside>

        <main className="w-full lg:w-[60%] lg:min-w-0 order-1 lg:order-2 flex flex-col flex-1 min-h-0 lg:h-full">
          <AtfxDashboardArticlesPanel
            navigate={navigate}
            researchReports={researchReports}
            qaSessions={qaSessions}
            loading={loading && researchReports.length === 0 && qaSessions.length === 0}
            error={error}
          />
        </main>
      </div>
    </div>
  );
}
