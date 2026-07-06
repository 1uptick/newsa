export const BROKERAGE_ATFX = "atfx";

export type BrokerageTokenFeature = "quick_analysis" | "research_report" | "translation" | "article_generate";

export type BrokerageTokenBalance = {
  brokerage_id: string;
  display_name: string;
  limit: number;
  used: number;
  remaining: number;
  period_id: string;
  period_start: string;
  period_end: string;
  billing_cycle_start_date: string;
};

export type BrokerageTokenConfig = {
  brokerage_id: string;
  display_name: string;
  monthly_token_limit: number;
  billing_cycle_start_date: string;
  multipliers: Record<BrokerageTokenFeature, number>;
  updated_at?: string;
};

export type BrokerageTokenUsageLog = {
  id: string;
  brokerage_id: string;
  charge_id: string;
  firebase_uid: string | null;
  source: string;
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  billed_tokens: number;
  symbol: string | null;
  reference_id: string | null;
  created_at: string;
};

export const BROKERAGE_SOURCE_LABELS: Record<BrokerageTokenFeature, string> = {
  quick_analysis: "Quick analysis",
  research_report: "Research report",
  translation: "Translation",
  article_generate: "Article generate",
};

export function formatBrokerageTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens >= 10_000_000 ? 0 : 1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toLocaleString();
}

export function formatUsdMicro(cost: number): string {
  const n = Number(cost);
  if (!Number.isFinite(n) || n <= 0) return "$0.0000";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}
