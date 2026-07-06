export type ResearchToolEvent = {
  name: string;
  summary: string;
  detail?: string;
};

const TOOL_LABELS: Record<string, string> = {
  get_market_news_research: "Market news research",
  get_fmp_quote: "Live quote",
  get_fmp_economic_calendar: "Economic calendar",
  get_fmp_economic_indicator: "Economic indicator",
  get_fmp_treasury_rates: "Treasury rates",
  get_fmp_company_profile: "Company profile",
  get_fmp_ratios: "Valuation ratios",
  get_fmp_financial_statements: "Financial statements",
  get_fmp_technical_indicator: "Technical indicator",
  get_chart_image: "Price chart",
  get_economic_chart: "Economic chart",
};

function humanizeToolName(name: string): string {
  const stripped = name
    .trim()
    .replace(/^get_fmp_/, "")
    .replace(/^get_/, "")
    .replace(/_/g, " ");
  if (!stripped) return name;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

function detailFromSummary(name: string, summary: string): string | null {
  if (name === "get_fmp_quote") {
    const m = summary.match(/Live quote for ([A-Z0-9./^:-]+)/i);
    return m?.[1]?.toUpperCase() ?? null;
  }
  if (name === "get_chart_image") {
    const m = summary.match(/Chart image: ([A-Z0-9]+)_/i);
    return m?.[1]?.toUpperCase() ?? null;
  }
  return null;
}

function resolveToolDetail(name: string, detail?: string, summary?: string): string | null {
  const d = detail?.trim();
  if (d && d !== "…") return d;
  const s = summary?.trim();
  if (!s || s === "…") return null;
  if (s.length <= 32 && !s.includes("\n") && !/^Live quote/i.test(s) && !/^Chart image/i.test(s)) {
    return s;
  }
  return detailFromSummary(name, s);
}

/** User-facing label for research pipeline tool pills (no API provider names). */
export function researchToolLabel(name: string, detailOrSummary?: string, summary?: string): string {
  const base = TOOL_LABELS[name] ?? humanizeToolName(name);
  const detail = resolveToolDetail(name, detailOrSummary, summary);
  return detail ? `${base} - ${detail}` : base;
}

/** Label from a persisted or live tool event row. */
export function researchToolEventLabel(event: Pick<ResearchToolEvent, "name" | "summary" | "detail">): string {
  return researchToolLabel(event.name, event.detail, event.summary);
}