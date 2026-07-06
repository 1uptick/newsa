import React, { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Coins, Loader2, RefreshCw, Save } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  BROKERAGE_ATFX,
  BROKERAGE_SOURCE_LABELS,
  formatBrokerageTokenCount,
  formatUsdMicro,
  type BrokerageTokenBalance,
  type BrokerageTokenConfig,
  type BrokerageTokenFeature,
  type BrokerageTokenUsageLog,
} from "../lib/brokerageTokens";
import { ContentAreaLoader } from "../components/ContentAreaLoader";

const FEATURES = Object.keys(BROKERAGE_SOURCE_LABELS) as BrokerageTokenFeature[];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

type AdminUsageResponse = {
  logs: BrokerageTokenUsageLog[];
  total: number;
  page: number;
  pageSize: number;
  totals: {
    billed_tokens: number;
    cost_usd: number;
    total_tokens: number;
  };
  balance: BrokerageTokenBalance;
  config: BrokerageTokenConfig | null;
  sourceLabels: Record<BrokerageTokenFeature, string>;
};

type AdminConfigResponse = {
  configs: BrokerageTokenConfig[];
  defaultMultipliers: Record<BrokerageTokenFeature, number>;
};

type AdminTab = "configuration" | "usage";

export default function AdminBrokerageTokensPage() {
  const { authFetch } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>("configuration");
  const [brokerageId, setBrokerageId] = useState(BROKERAGE_ATFX);
  const [configs, setConfigs] = useState<BrokerageTokenConfig[]>([]);
  const [displayName, setDisplayName] = useState("ATFX");
  const [monthlyLimit, setMonthlyLimit] = useState(500_000);
  const [cycleStart, setCycleStart] = useState("");
  const [multipliers, setMultipliers] = useState<Record<BrokerageTokenFeature, number>>({
    quick_analysis: 1.8,
    research_report: 1.8,
    translation: 1.0,
    article_generate: 1.8,
  });
  const [balance, setBalance] = useState<BrokerageTokenBalance | null>(null);
  const [logs, setLogs] = useState<BrokerageTokenUsageLog[]>([]);
  const [usageTotal, setUsageTotal] = useState(0);
  const [usageTotals, setUsageTotals] = useState({ billed: 0, cost: 0, llm: 0 });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [days, setDays] = useState(30);
  const [sourceFilter, setSourceFilter] = useState<BrokerageTokenFeature | "all">("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const loadConfigList = useCallback(async () => {
    const res = await authFetch("/api/admin/brokerage-tokens/config");
    if (!res.ok) throw new Error("Failed to load brokerage token config");
    const data = (await res.json()) as AdminConfigResponse;
    setConfigs(data.configs);
    return data;
  }, [authFetch]);

  const loadUsage = useCallback(async () => {
    const params = new URLSearchParams({
      brokerageId,
      days: String(days),
      page: String(page),
      pageSize: String(pageSize),
      ...(sourceFilter !== "all" ? { source: sourceFilter } : {}),
    });
    const res = await authFetch(`/api/admin/brokerage-tokens/usage?${params}`);
    if (!res.ok) throw new Error("Failed to load token usage");
    const data = (await res.json()) as AdminUsageResponse;
    setLogs(data.logs);
    setUsageTotal(data.total);
    setUsageTotals({
      billed: data.totals.billed_tokens,
      cost: data.totals.cost_usd,
      llm: data.totals.total_tokens,
    });
    setBalance(data.balance);
    if (data.config) {
      setDisplayName(data.config.display_name);
      setMonthlyLimit(data.config.monthly_token_limit);
      setCycleStart(data.config.billing_cycle_start_date);
      setMultipliers(data.config.multipliers);
    }
  }, [authFetch, brokerageId, days, page, pageSize, sourceFilter]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await loadConfigList();
      await loadUsage();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load token data");
    } finally {
      setLoading(false);
    }
  }, [loadConfigList, loadUsage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await authFetch(`/api/admin/brokerage-tokens/config/${encodeURIComponent(brokerageId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName,
          monthly_token_limit: monthlyLimit,
          billing_cycle_start_date: cycleStart,
          multipliers,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save config");
      }
      setToast("Token configuration saved.");
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save config");
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(usageTotal / pageSize));
  const pageStart = usageTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, usageTotal);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Coins className="w-6 h-6 text-[#ff7900]" />
          <h2 className="text-xl font-bold text-slate-900">Brokerage tokens</h2>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {toast ? <div className="rounded-lg bg-emerald-50 text-emerald-800 px-4 py-2 text-sm">{toast}</div> : null}
      {error ? <div className="rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div> : null}

      <div className="flex gap-0 border-b border-slate-200" role="tablist" aria-label="Brokerage token admin">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "configuration"}
          onClick={() => setActiveTab("configuration")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            activeTab === "configuration"
              ? "border-primary text-primary"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Configuration
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "usage"}
          onClick={() => setActiveTab("usage")}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            activeTab === "usage"
              ? "border-primary text-primary"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          Usage log
        </button>
      </div>

      {activeTab === "configuration" ? (
      <section className="card p-6 space-y-5">
        <p className="text-sm text-slate-600">
          Monthly token pool is shared across all users in the brokerage. Billed tokens = ceil(USD cost × 10,000 × feature multiplier), same as 1uptick.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Brokerage</span>
            <select
              value={brokerageId}
              onChange={(e) => {
                setBrokerageId(e.target.value);
                setPage(1);
              }}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {(configs.length ? configs : [{ brokerage_id: BROKERAGE_ATFX, display_name: "ATFX" } as BrokerageTokenConfig]).map(
                (c) => (
                  <option key={c.brokerage_id} value={c.brokerage_id}>
                    {c.display_name} ({c.brokerage_id})
                  </option>
                )
              )}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Display name</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Monthly token limit</span>
            <input
              type="number"
              min={0}
              value={monthlyLimit}
              onChange={(e) => setMonthlyLimit(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">Billing cycle start date</span>
            <input
              type="date"
              value={cycleStart}
              onChange={(e) => setCycleStart(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <span className="text-xs text-slate-500 mt-1 block">Monthly periods renew on this day each month.</span>
          </label>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Feature multipliers</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FEATURES.map((feature) => (
              <label key={feature} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
                <span className="text-sm text-slate-700">{BROKERAGE_SOURCE_LABELS[feature]}</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={multipliers[feature]}
                  onChange={(e) =>
                    setMultipliers((prev) => ({ ...prev, [feature]: Number(e.target.value) }))
                  }
                  className="w-24 rounded border border-slate-200 px-2 py-1 text-sm text-right"
                />
              </label>
            ))}
          </div>
        </div>

        {balance ? (
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-700">
            Current period <strong>{balance.period_id}</strong>: {formatBrokerageTokenCount(balance.used)} used ·{" "}
            {formatBrokerageTokenCount(balance.remaining)} remaining of {formatBrokerageTokenCount(balance.limit)}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !cycleStart}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save configuration
        </button>
      </section>
      ) : (
      <section className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center gap-3 justify-between">
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium text-slate-700">Brokerage</span>
            <select
              value={brokerageId}
              onChange={(e) => {
                setBrokerageId(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              {(configs.length ? configs : [{ brokerage_id: BROKERAGE_ATFX, display_name: "ATFX" } as BrokerageTokenConfig]).map(
                (c) => (
                  <option key={c.brokerage_id} value={c.brokerage_id}>
                    {c.display_name} ({c.brokerage_id})
                  </option>
                )
              )}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={String(days)}
              onChange={(e) => {
                setDays(Number(e.target.value));
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              {[7, 30, 90].map((d) => (
                <option key={d} value={d}>
                  Last {d} days
                </option>
              ))}
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value as BrokerageTokenFeature | "all");
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              <option value="all">All sources</option>
              {FEATURES.map((f) => (
                <option key={f} value={f}>
                  {BROKERAGE_SOURCE_LABELS[f]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <ContentAreaLoader variant="card" size="sm" />
        ) : (
          <>
            <div className="px-6 py-3 bg-slate-50 text-sm text-slate-600 border-b border-slate-200">
              {usageTotal.toLocaleString()} rows · {formatBrokerageTokenCount(usageTotals.billed)} billed tokens ·{" "}
              {formatUsdMicro(usageTotals.cost)} LLM cost · {usageTotals.llm.toLocaleString()} LLM tokens
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-600">
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Model</th>
                    <th className="px-4 py-3 font-medium">Symbol</th>
                    <th className="px-4 py-3 font-medium text-right">Tokens (in → out)</th>
                    <th className="px-4 py-3 font-medium text-right">Cost</th>
                    <th className="px-4 py-3 font-medium text-right">Billed</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">{BROKERAGE_SOURCE_LABELS[row.source as BrokerageTokenFeature] ?? row.source}</td>
                      <td className="px-4 py-3 font-mono text-xs">{row.model}</td>
                      <td className="px-4 py-3">{row.symbol || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {row.prompt_tokens.toLocaleString()} → {row.completion_tokens.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatUsdMicro(row.cost_usd)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">{row.billed_tokens.toLocaleString()}</td>
                    </tr>
                  ))}
                  {!logs.length ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                        No token usage in this range yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                {usageTotal === 0
                  ? "No rows"
                  : `Showing ${pageStart.toLocaleString()}–${pageEnd.toLocaleString()} of ${usageTotal.toLocaleString()}`}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <span>Rows per page</span>
                  <select
                    value={String(pageSize)}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <span className="text-sm text-slate-600 tabular-nums min-w-[5.5rem] text-center">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
      )}
    </div>
  );
}
