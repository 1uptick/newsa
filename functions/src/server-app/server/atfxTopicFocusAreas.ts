export type AtfxTopicAudience = "institutional" | "retail";

export type AtfxFocusArea = {
  id: number;
  label: string;
  detail: string;
};

export const ATFX_INSTITUTIONAL_FOCUS_AREAS: AtfxFocusArea[] = [
  {
    id: 1,
    label: "Macro divergence & rates",
    detail:
      "Central bank policy divergence (Fed, ECB, BoJ, PBoC), real yields, curve shape (2s10s, 5s30s), term premium, and cross-asset rate transmission.",
  },
  {
    id: 2,
    label: "FX, carry & cross-border flows",
    detail:
      "DXY, G10 and EM FX, carry trades, corporate hedging, cross-currency basis, and sovereign reserve flows.",
  },
  {
    id: 3,
    label: "Credit, funding & liquidity",
    detail:
      "IG/HY spreads, primary issuance, funding markets, RRP/TGA dynamics, bank reserves, and liquidity stress indicators.",
  },
  {
    id: 4,
    label: "Commodities & energy complex",
    detail:
      "Oil, gas, LNG, industrial metals, gold, inventory cycles, OPEC+ policy, and commodity–FX linkages.",
  },
  {
    id: 5,
    label: "Geopolitics, trade & sanctions",
    detail:
      "Tariffs, sanctions, supply-chain rerouting, regional FX volatility, and commodity shock channels.",
  },
  {
    id: 6,
    label: "Equity indices, vol & positioning",
    detail:
      "Index dispersion, vol surface / skew, dealer gamma, COT and ETF flows, sector rotation, and risk-premia shifts.",
  },
  {
    id: 7,
    label: "China & Asia macro",
    detail:
      "PBoC stance, credit/property, fiscal impulse, HK/connect flows, Asia ex-Japan growth, and regional policy surprises.",
  },
  {
    id: 8,
    label: "Europe & UK macro",
    detail:
      "ECB/BoE paths, energy security, EUR/GBP crosses, gilt dynamics, and European industrial/competitiveness themes.",
  },
  {
    id: 9,
    label: "Digital assets, RWA & market structure",
    detail:
      "Tokenized RWAs, institutional stablecoin rails, digital-asset regulation, and market-structure innovation (not retail crypto hype).",
  },
  {
    id: 10,
    label: "Operational alpha & execution",
    detail:
      "TCA, liquidity aggregation, smart order routing, FIX/API adoption, and best-execution / compliance mechanics.",
  },
];

export const ATFX_RETAIL_FOCUS_AREAS: AtfxFocusArea[] = [
  {
    id: 1,
    label: "FX & rates for traders",
    detail:
      "Major pairs, crosses, DXY, central-bank decisions, carry, and volatility spikes — tradable FX/CFD angles.",
  },
  {
    id: 2,
    label: "Commodities (energy & metals)",
    detail: "Gold, silver, oil, gas, copper — catalyst-led moves, ranges, and inventory/data releases.",
  },
  {
    id: 3,
    label: "Global equity indices",
    detail: "US, Europe, and Asia benchmarks — index CFD narratives, sector index moves, and risk-on/off tone.",
  },
  {
    id: 4,
    label: "US stocks & earnings",
    detail: "Megacap, momentum, sector leaders, earnings/guidance surprises, and ETF flow stories.",
  },
  {
    id: 5,
    label: "Volatility & event trading",
    detail: "VIX, gap risk, event calendars (CPI, FOMC, payrolls), and short-term risk-management angles.",
  },
  {
    id: 6,
    label: "Technical levels & breakouts",
    detail:
      "Support/resistance and pattern stories **only when tied to a verified catalyst** — no invented levels.",
  },
  {
    id: 7,
    label: "EM & regional markets",
    detail: "LATAM, MENA, and Asia FX/indices when relevant to global retail search and ATFX tradables.",
  },
  {
    id: 8,
    label: "Sector rotation & themes",
    detail: "AI/tech, energy, defensives, small-cap vs large-cap — rotation with tradable tickers or indices.",
  },
  {
    id: 9,
    label: "Macro drivers for retail",
    detail:
      "Inflation prints, jobs data, fiscal news — framed as **why a tradable moved**, not abstract macro only.",
  },
  {
    id: 10,
    label: "Search-intent & education hooks",
    detail:
      "High-intent queries (“why X moved”, “what’s next for Y”) mapped to **real** recent events and tradables.",
  },
];

export function atfxFocusAreas(audience: AtfxTopicAudience): AtfxFocusArea[] {
  return audience === "institutional" ? ATFX_INSTITUTIONAL_FOCUS_AREAS : ATFX_RETAIL_FOCUS_AREAS;
}

/** Spread batch slots across focus lanes (e.g. batch 0→0, 1→3, 2→6 with 10 areas). */
export function focusAreaIndexForBatch(
  audience: AtfxTopicAudience,
  batchIndex: number,
  batchTotal: number
): number {
  const areas = atfxFocusAreas(audience);
  const n = areas.length;
  if (n === 0) return 0;
  const idx = Math.max(0, Math.floor(batchIndex));
  if (batchTotal <= 1) {
    const daySlot = Math.floor(Date.now() / 86_400_000) % n;
    return (daySlot + idx) % n;
  }
  const step = Math.max(1, Math.floor(n / Math.max(1, batchTotal)));
  return (idx * step) % n;
}

export function formatFocusAreasList(audience: AtfxTopicAudience): string {
  return atfxFocusAreas(audience)
    .map((a) => `${a.id}. **${a.label}:** ${a.detail}`)
    .join("\n");
}

export function focusAreaMandateBlock(
  audience: AtfxTopicAudience,
  areaIndex: number,
  options?: { batchIndex?: number; batchTotal?: number }
): string {
  const areas = atfxFocusAreas(audience);
  const idx = ((areaIndex % areas.length) + areas.length) % areas.length;
  const area = areas[idx];
  const batchNote =
    options?.batchTotal && options.batchTotal > 1
      ? ` (batch slot ${(options.batchIndex ?? 0) + 1} of ${options.batchTotal})`
      : "";
  return (
    `\n\n**Assigned focus lane${batchNote}:** You MUST anchor this topic primarily in Focus Area #${area.id} — **${area.label}**. ` +
    `${area.detail} ` +
    `Do not default to generic Fed/DXY/tariff headlines unless this lane is explicitly macro-FX/rates **and** your angle is clearly distinct from excluded topics.`
  );
}

export function multiCandidateInstruction(audience: AtfxTopicAudience): string {
  const n = atfxFocusAreas(audience).length;
  return (
    `\n\n**Multi-candidate output (mandatory):** Return a JSON object with a \`topics\` array containing **exactly 3** complete topic objects. ` +
    `Each entry must: (1) use a **different** focus area from the ${n} listed above, (2) name a **different primary tradable or catalyst**, ` +
    `(3) be grounded in search evidence from the last 30–60 days. We select the first entry that is sufficiently distinct from recent ATFX topics.`
  );
}

const INSTITUTIONAL_BRIEF_PREAMBLE = `Act as an Institutional Investment Researcher. Your task is to identify and synthesize 1 high-impact, trending topic.

Focus trending areas (10 lanes — use your **assigned** lane when specified; otherwise pick the strongest lane **not** already covered by excluded topics):`;

const RETAIL_BRIEF_PREAMBLE = `Act as a Senior Financial Content Strategist and SEO Lead for ATFX, writing for **global retail and self-directed investors** who discover content through **search engines, news aggregators, and social feeds** worldwide.

Your task is to identify **one** high-impact, **trending** topic optimized for **organic search visibility**, **query–content match**, **click-through**, and **share-worthy headlines**—without sacrificing factual grounding.

**Mandatory product focus (auto-generation):** The entire output—headline, keywords, summary, hooks, and stock codes—must centre on what ATFX retail clients actually trade and research: **forex (major and key crosses)**, **commodities** (e.g. energy, metals), **global equity indices** (index levels, futures, sector index angles), **CFDs** on those underlyings, and **US-listed equities / US stock trading** (single names or major ETFs). You may reference macro or policy only as **drivers** of those markets. Do **not** make crypto, local property, or unrelated consumer themes the **primary** story unless they are clearly secondary context for FX, commodities, indices, CFDs, or US stocks.

Focus trending areas (10 lanes — use your **assigned** lane when specified; otherwise pick the strongest lane **not** already covered by excluded topics):`;

const INSTITUTIONAL_BRIEF_POSTAMBLE = `
**Time window (critical):** Ground your topic in verifiable market evidence from roughly the **last 30–60 days** (not just the last week). Use the most recent week for urgency only — rotate to a **different catalyst, instrument, or geography** if recent topics already covered the headline macro story.

**De-duplication rule (critical):** Avoid repeating or closely paraphrasing an existing ATFX topic. Also avoid the *same catalyst / same mechanism / same market story* even if you change wording or swap one statistic.

**Creativity rule:** Prefer **second-order** angles (transmission, positioning, cross-asset linkage) over repeating the same front-page headline. If US rates/DXY/tariffs dominate the news, look for under-covered lanes (Asia credit, European energy, vol/positioning, commodities inventory, etc.) unless your assigned lane requires macro rates **and** the angle is genuinely distinct.

**Data integrity:** Do not fabricate index, FX, yield, or commodity **levels**; every numeric claim must be supported by your search results for the relevant window.

Follow the output contract below.`;

const RETAIL_BRIEF_POSTAMBLE = `
**Data integrity — CRITICAL:**
- Do not invent DXY/FX/index **levels** or “重破／突破” claims for SEO. If your search does not confirm an exact print or threshold move, write around **catalysts and direction** (e.g. Fed repricing, risk tone) without fake precision.
- **NEVER fabricate trend/streak claims.** Do NOT write “連漲X週/天”, “連跌X週/天”, “新高”, “新低”, “創紀錄”, or streak language unless your search results **explicitly confirm that exact streak with dates**.
- **Direction claims must match search evidence.**

**Time window (critical):** Ground everything in **verifiable market evidence from roughly the last 30–60 days**. The last 7 days may add urgency, but you must rotate to a **clearly different catalyst, tradable, or sector** to avoid repeating the same story.

**De-duplication rule (critical):** Do not repeat or closely paraphrase existing recent ATFX topics. Avoid the *same market story* with a different headline (same catalyst + same traded market + same “why now”).

**Creativity rule:** Each topic must name at least one **specific tradable** (pair, commodity, index, or US ticker). Prefer lanes with SEO headroom that are **not** the same Fed/DXY headline everyone else published this week.

Then follow the output contract below.`;

export function buildInstitutionalAutoResearchBrief(): string {
  return `${INSTITUTIONAL_BRIEF_PREAMBLE}\n${formatFocusAreasList("institutional")}${INSTITUTIONAL_BRIEF_POSTAMBLE}`;
}

export function buildRetailAutoResearchBrief(): string {
  return `${RETAIL_BRIEF_PREAMBLE}\n${formatFocusAreasList("retail")}${RETAIL_BRIEF_POSTAMBLE}`;
}
