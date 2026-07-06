import { cache, CACHE_KEYS } from "./cache.js";
import { config } from "./config.js";
import {
  buildInstitutionalAutoResearchBrief,
  buildRetailAutoResearchBrief,
} from "./atfxTopicFocusAreas.js";

export const PROPOSED_TOPICS_COMPANY_1UPTICK = "1uptick";

/** Normalized key for ATFX (`?company=atfx`, filters use LOWER()). */
export const PROPOSED_TOPICS_COMPANY_ATFX = "atfx";

/** Value written to Airtable `company` for ATFX-generated rows (display / single-select). */
export const PROPOSED_TOPICS_COMPANY_ATFX_AIRTABLE = "ATFX";

/** Placeholder topic string for fillAtfxKeywordSeoPromptTemplate when the model picks the angle (AI auto-topic). */
export const ATFX_INSTITUTIONAL_AUTO_TOPIC_PLACEHOLDER =
  "(AI-selected: choose exactly ONE highest-impact topic from the Trending Focus Areas in the research brief, grounded in the last 30–60 days of markets and verifiable evidence.)";

/** Research brief prepended before the institutional ATFX template for the AI-only auto-topic flow. */
export const ATFX_INSTITUTIONAL_AUTO_RESEARCH_BRIEF = buildInstitutionalAutoResearchBrief();

/** Placeholder topic for retail AI-only auto flow (model picks angle from research brief). */
export const ATFX_RETAIL_AUTO_TOPIC_PLACEHOLDER =
  "(AI-selected: choose exactly ONE highest-traffic, SEO-optimized topic **within the ATFX retail trading universe** (forex, commodities, major indices, CFDs, US stock trading) from the Trending Focus Areas in the research brief, grounded in the last 30–60 days of markets and verifiable evidence.)";

/** Research brief for ATFX retail auto-topic: global financial SEO and organic search traffic. */
export const ATFX_RETAIL_AUTO_RESEARCH_BRIEF = buildRetailAutoResearchBrief();

/**
 * ATFX SEO topic system prompt template (in-repo). Edit here to change outline / JSON shape.
 * Placeholders (filled in fillAtfxKeywordSeoPromptTemplate):
 *   {{AUDIENCE_ROLE}}, {{TOPIC}}, {{RESEARCH_FOCUS}}, {{FILTER_STEP}},
 *   {{GENERATE_TITLE_NOTE}}, {{STYLE_PATTERNS}}, {{HEADLINE_AND_TITLE_RULES}}, {{SEO_TITLE_JSON_EXAMPLE}}, {{SUMMARY_GUIDELINE}}, {{PSYCH_HINT}}, {{AUDIENCE_NAME}}
 *
 * Retail vs institutional voice and bullets are defined in fillAtfxKeywordSeoPromptTemplate().
 */
export const ATFX_KEYWORD_SEO_PROMPT_TEMPLATE = `{{AUDIENCE_ROLE}}

# Objective
Generate one high-impact content strategy **centred strictly on this user topic**: "{{TOPIC}}".
All titles, keywords, and copy must orbit that topic. Ground the output in **real market events from roughly the LAST 30–60 DAYS** (use your search tool), with emphasis on the most recent week when relevant.

# Numeric and market-data accuracy (mandatory)
**Temperature 0 does not guarantee truth—you must not invent prices.** Search results may be incomplete; still **never fabricate** index prints, FX levels, yields, bps, or % moves.
- **Search-grounded numbers only:** Any **specific** figure in \`seo_title\`, \`summary\`, \`keywords\`, or hooks (e.g. “DXY 103”, “EURUSD 1.08”, “標普500 6000點”) must be **directly supported** by your search tool output for the **same** market window you are describing (typically the last 30–60 days, with recent-week emphasis). If you cannot verify an exact level, **do not** state it.
- **“Break / 重破 / 突破 / 站穩” claims:** Do not claim that DXY, a pair, or an index **crossed** or **broke** a named **threshold** unless your search results **explicitly** confirm that move for that period. If unclear, use **qualitative** wording (e.g. 美元偏強、美元指數處於近期區間偏上) or focus on **catalysts** (Fed, data, risk tone) without a fake numeric headline.
- **Prefer catalysts over fake precision:** When exact prints are not verified, lead with **policy, data releases, or narrative**—not invented price headlines.
- **NEVER fabricate trend/streak claims:** Do NOT write “連漲X週” (X consecutive weeks of gains), “連跌X天”, “新高” (new high), “新低”, “創紀錄”, or any streak/direction claim unless your search results **explicitly confirm it with specific dates**. If the market is actually down, do NOT claim it is up. Describe **catalysts** (earnings, policy, data) rather than invented streaks.

# Step-by-Step Instructions
1. RESEARCH: {{RESEARCH_FOCUS}}
2. {{FILTER_STEP}}
3. GENERATE: Produce seo_title {{GENERATE_TITLE_NOTE}}, keywords, psychology_trigger, summary, target_stock_codes, and social_media_hook—all tuned for the **{{AUDIENCE_NAME}}** audience and the style patterns below.

# Style Reference (Pattern to follow)
{{STYLE_PATTERNS}}

# Primary headline (JSON key is still \`seo_title\` for the pipeline—content rules differ by audience)
{{HEADLINE_AND_TITLE_RULES}}

# Output Requirement
You must output ONLY valid JSON in Traditional Chinese (HK). {{SUMMARY_GUIDELINE}} {{PSYCH_HINT}} **MANDATORY — no citations:** the output must not contain any citation markers — no \`[1]\`, \`[2]\`, \`[3]\`, no bracketed numbers, no footnote-style references in any string field. Write clean prose only. In \`seo_title\`, do **not** use the current calendar year as a generic “freshness” prefix; include a year only when it is **material** to the story (e.g. fiscal year label, clearly dated event). Otherwise lead with catalyst, asset, or data.

{
  "topics": [
    {
      "id": 1,
      "seo_title": "{{SEO_TITLE_JSON_EXAMPLE}}",
      "keywords": ["關鍵字1", "關鍵字2", "關鍵字3", "關鍵字4"],
      "psychology_trigger": "簡潔說明點擊動機（符合上述受眾）",
      "summary": "約100字摘要，包含具體數據或事件背景",
      "target_stock_codes": ["例如：0700", "9988"],
      "social_media_hook": "一句適合社交媒體的短句"
    }
  ]
}`;

function atfxTopicEscapedForPrompt(userTopic: string): string {
  const raw = userTopic.trim() || "(none)";
  return raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Substitute audience/topic placeholders into the ATFX prompt template. */
export function fillAtfxKeywordSeoPromptTemplate(
  template: string,
  audience: "institutional" | "retail",
  userTopic: string
): string {
  const topicDisplay = atfxTopicEscapedForPrompt(userTopic);
  const isInst = audience === "institutional";

  const role = isInst
    ? `Act as a Senior Financial Research Analyst and Content Strategist for ATFX.
You write for **institutional and professional clients**: hedge funds, prop desks, asset allocators, risk officers, and sophisticated PMs.
Your tone is authoritative, forward-looking, and structurally explicit—closer to a macro strategy desk note than a news recap.
**Core mandate:** connect the topic to **macroeconomic drivers** (growth, inflation, real rates, liquidity, fiscal impulse, credit conditions), explain **structural mechanics** (why prices/flows move—balance-sheet channels, carry, positioning, supply/demand, policy transmission), and articulate **risk-adjusted positioning** (what is priced in, convexity/tail risks, hedges, scenario-weighted views).
You must use **predictive logic**: state a base case, what would **confirm or invalidate** it, key **leading vs coincident** signals, and a **3–6 month horizon** implication where data allows—not vague "may rise or fall."
The **primary title** (\`seo_title\` in JSON) must be a **Bloomberg-style** professional headline—**not** SEO-optimized.
Absolutely NO retail clickbait, hype, or "to the moon" language. Every claim must be grounded in verifiable data, macro linkage, or institutional positioning logic.
**Numbers:** Do not invent DXY, FX, index, or yield levels—only cite figures your search results actually support for the period discussed.`
    : `Act as a Senior Financial Content Marketing Expert and SEO Strategist for ATFX.
You write for **global retail and self-directed investors** who find financial content through **search and social** worldwide.
Your tone is engaging, accessible, and click-worthy—strong SEO hooks, trending angles, and clear takeaways that drive **organic search traffic** and engagement.
Priorities: capitalize on the hottest trending events of the most recent week, but you may use evidence from roughly the last 30–60 days to find a clearly different catalyst/theme (avoid repeating the same story).
Think like a financial creator optimizing for **search intent and CTR**: the title must win the SERP and the scroll, the summary must earn the click-through.
**Numbers:** Never fabricate “重破 / 突破” price levels or index prints for SEO—use search-verified figures only, or qualitative + catalyst-led headlines (see Numeric accuracy section below).`;

  const researchFocus = isInst
    ? `Find the strongest catalysts and data from roughly the **last 30–60 days** **specifically tied to** "${topicDisplay}", then **anchor them in macro and structure**. Use the most recent week for urgency, but rotate to a different catalyst if you are repeating the same story. Focus on:
   - **Macroeconomic context**: growth vs inflation mix, **real policy rates**, term premium, curve shape (2s10s, 5s30s where relevant), major central bank stance (Fed, ECB, BoJ, PBoC), **USD liquidity** (DXY, USD/CNH, cross-currency basis), credit spreads (IG/HY, EM if relevant), and any **fiscal or regulatory impulse** affecting the sector or asset.
   - **Structural mechanics**: not only *what* moved but *why the plumbing matters*—balance-sheet constraints, **carry and funding**, inventory or supply chains, index/ETF flows, buyback/dividend policy, sovereign/institutional demand, or **regime change** (e.g. QT/QE, RRP, bank reserves) that changes the marginal buyer.
   - **Predictive linkage**: identify **lead indicators** (rates, FX, commodities, volatility, breakevens, survey data) that typically **front-run** this asset; note what the market is **pricing** (cuts/hikes, soft/hard landing) vs your read of the data.
   - **Positioning & flows**: COT, EPFR/ETF flows, options skew/vol term structure, dealer gamma, evidence of **accumulation vs distribution**, hedging (rates, FX, vol), and **quarter-end or rebalance** mechanical flows.
   - **Risk-adjusted read**: where could the narrative **break** (data surprise, policy pivot, geopolitical shock)? What is the **asymmetric** risk (convexity, tail hedges)?`
    : `Find the strongest catalysts and data from roughly the **last 30–60 days** **specifically tied to** "${topicDisplay}". Use the most recent week for urgency, but rotate to a different catalyst if you are repeating the same story. Focus on:
   - **Biggest recent events**: earnings surprises, geopolitical shocks, central bank decisions, commodity surges/crashes—anything dominating global financial headlines.
   - **Trending search angles**: what are retail investors and traders searching for **across major markets**? Find high-intent queries and the viral or surprising angle.
   - **Price action highlights**: dramatic moves, new highs/lows, or breakouts that make a compelling visual story.
   - **Opportunity vs risk**: frame it as "should you buy the dip?" or "is it too late?" or "the hidden risk nobody is talking about."
   - **Relatability**: connect the macro story to **portfolio-level impact** for everyday investors (savings, retirement, risk appetite)—globally relatable, not one city-specific.`;

  const filterStep = isInst
    ? `FILTER: Pick the single angle with the **deepest institutional payoff**—the one that best combines **macro + structure + positioning**:
   - **Cross-asset / macro**: spell out the transmission (e.g. real yields ↑ → duration/tech derating → rotation into X; USD strength → EM/commodity channel; China credit impulse → HK/listings proxy).
   - **Structural story**: name the **mechanism** (not a headline only)—who must buy/sell, what balance sheet or policy lever forces it, and why this week matters.
   - **Predictive spine**: one clear **base case** + what **confirms** it (2–3 observable triggers) + what **invalidates** it; avoid fence-sitting.
   - **Risk-adjusted framing**: explicit **risk/reward** (key levels or ranges, catalyst calendar, vol regime), and how a professional might **size or hedge** (rates, FX, options) at a high level—no trade advice, but institutional-grade discipline.`
    : `FILTER: Pick the single most **click-worthy and SEO-powerful** angle for **global financial search traffic**:
   - Prioritize recency—the newer and more dramatic, the better.
   - The title must match **real search queries** and win attention on feeds and SERPs.
   - Lean into curiosity gaps: "Is it too late?", "The hidden risk", "Why smart money is moving", "Catching the rebound".
   - The story must feel urgent and timely—not a textbook explainer.
   - **Do not** choose an angle that depends on an **unverified** specific price level; if search does not confirm a threshold move, pivot to catalyst/theme wording.`;

  const stylePatterns = isInst
    ? `- [Topic]：從[Real rates/曲線/信用利差]看[資產]的風險調整後定位
- [Macro driver]預示未來[X]季[增長/通脹/流動性]路徑？[Topic]的**領先指標**與**定價落差**
- [Structural channel]（資金面/供需/政策傳導）如何改變[Asset]的**邊際定價**
- [Positioning/Flow data]指向**累積還是減倉**？對沖活動與[波幅/偏度]透露什麼？
- **情境分析**：基本情境 vs 上行/下行觸發條件（具體數據或事件）
- [Policy/Central bank]下一步如何影響[Carry/匯率/信用成本]？[Topic]的**非對稱風險**在哪`
    : `- [Topic/Keyword]是否將成為關鍵轉折點？
- [Company/Asset]突破[Pattern]整理，[Driver]帶動股價走勢
- 歷史高位！[Data]資金「[Action]」，背後釋放了什麼訊號？
- [Name/Entity]清倉[Asset]：是獲利了結，還是估值預警？
- [Trending Event]懶人包：散戶該買還是該跑？3分鐘看懂
- [Asset]暴漲[X]%！下一步怎麼走？關鍵支撐位在這裡`;

  const summaryGuideline = isInst
    ? `The "summary" must read like a **dense institutional brief** (~100–130 words if needed for depth): pack in **search-verified** specific figures where available (yields, spreads, levels, % moves, vol); if a number is not confirmed by your search, omit it or use non-numeric macro language. Cover the **macro link** (growth/inflation/policy/liquidity), the **structural "why"** (mechanism, not vibes), a **forward lean** (base case + what confirms or breaks it), and **risk-adjusted positioning** language (what is priced in, tail risks, hedge context). Avoid generic news recap; prioritize **predictive and structural** insight.`
    : `The "summary" must be an **engaging, SEO-friendly narrative** (~100 words): lead with the strongest **verified** fact from your search; include **specific numbers only when** your search results support them—otherwise use qualitative market language. Explain why it matters to **global retail investors** right now, and end with a hook. **Never** invent DXY/FX/index levels to sound precise.`;

  const psychHint = isInst
    ? `The "psychology_trigger" must explain why a PM, allocator, or risk officer would **act on** this: e.g. **mispriced macro**, **regime shift**, **positioning asymmetry**, **forward catalyst stack**, or **risk control** (hedge, duration, factor tilt). Frame as **information edge**—not entertainment.`
    : `"psychology_trigger" 必須解釋為什麼全球零售投資者會在搜尋結果或社交動態中停下來點擊這篇文章。聚焦 FOMO（怕錯過機會）、恐懼（保護資產）、好奇（意想不到的角度）、或貪婪（潛在獲利機會）。`;

  const generateTitleNote = isInst
    ? "(Bloomberg-style **wire headline** in Traditional Chinese—**not** SEO or social clickbait)"
    : "(**SEO-optimized** headline for global financial search discovery)";

  const seoTitleJsonExample = isInst
    ? "美國實際利率回升：[資產類別]估值與資金流再定價前瞻（Bloomberg式一行標題，非SEO）"
    : "在此輸入SEO爆紅標題（30字內）";

  const headlineAndTitleRules = isInst
    ? `**Institutional — Bloomberg-style headline (not SEO):** The \`seo_title\` value must read like a **Bloomberg / terminal-style** or **sell-side email subject** line: factual, dense, professional. Prefer **主題：關鍵事實或數據** (Subject: material fact), **實體＋動作＋數據／背景**, or **因果鏈** (policy/market A → transmission → B). Lead with the **most market-moving** or **policy-relevant** point. **Do not** keyword-stuff, write curiosity-gap SEO, use emoji, or optimize for search/social clicks—**credibility and information density** beat virality. Avoid tabloid or retail question-headline bait unless it is a genuine analytical question. One tight line where possible (wire-style), Traditional Chinese (HK).
**Calendar year:** Do **not** open or decorate the headline with the current calendar year unless the year is **essential** to the story (e.g. a specifically dated election, fiscal-year label, or contract maturing in that year). Prefer catalyst, asset, level, or policy—most titles should have **no** year.
**Numeric headline:** Do **not** assert specific **index/FX/yield prints** in \`seo_title\` unless **search-verified** for the period; avoid “broke [level]” claims without evidence.`
    : `**Retail:** \`seo_title\` must be **SEO-oriented** and attention-grabbing for **global** financial search and social discovery (keywords, hooks, patterns in Style Reference above).
**Calendar year:** Do **not** lead with or repeat the current calendar year (e.g. 2026) for “freshness.” **Omit the year** unless it is central to the hook (e.g. a dated event users search by year). Prefer movers, levels, tickers, and “why now”—avoid “2026 …” as a default pattern.
**Numeric headline:** Do **not** put unverified index/FX levels (e.g. “DXY 103”) in the title unless **confirmed** in search results for the story window—use catalyst-led or qualitative hooks when unsure.`;

  const audienceName = isInst ? "institutional" : "retail";

  return template
    .replace(/\{\{AUDIENCE_ROLE\}\}/g, role)
    .replace(/\{\{TOPIC\}\}/g, topicDisplay)
    .replace(/\{\{RESEARCH_FOCUS\}\}/g, researchFocus)
    .replace(/\{\{FILTER_STEP\}\}/g, filterStep)
    .replace(/\{\{GENERATE_TITLE_NOTE\}\}/g, generateTitleNote)
    .replace(/\{\{STYLE_PATTERNS\}\}/g, stylePatterns)
    .replace(/\{\{HEADLINE_AND_TITLE_RULES\}\}/g, headlineAndTitleRules)
    .replace(/\{\{SEO_TITLE_JSON_EXAMPLE\}\}/g, seoTitleJsonExample)
    .replace(/\{\{SUMMARY_GUIDELINE\}\}/g, summaryGuideline)
    .replace(/\{\{PSYCH_HINT\}\}/g, psychHint)
    .replace(/\{\{AUDIENCE_NAME\}\}/g, audienceName);
}

export function proposedTopicsCompanyFieldName(): string {
  return config.airtable.proposedTopicsCompanyField || "company";
}

export function proposedTopicsSortFieldName(): string {
  return config.airtable.proposedTopicsSortField || "Create date";
}

/**
 * Fetch first page of proposed-topics rows with fallbacks: production bases sometimes omit
 * newer columns (e.g. stockcode1) or rename the sort field — Airtable returns 422/INVALID_FIELD_NAME.
 */
export async function fetchProposedTopicsRecordsFirstPage(
  airtable: any,
  tableId: string,
  params: {
    maxRecords: number;
    sortField: string;
    filterByFormula?: string;
    fields?: string[];
  }
): Promise<any[]> {
  const { maxRecords, sortField, filterByFormula, fields } = params;
  const build = (includeFields: boolean, includeSort: boolean) => {
    const sel: Record<string, unknown> = { maxRecords };
    if (includeSort && sortField) {
      sel.sort = [{ field: sortField, direction: "desc" as const }];
    }
    if (filterByFormula) sel.filterByFormula = filterByFormula;
    if (includeFields && fields?.length) sel.fields = fields;
    return sel;
  };
  try {
    return await airtable(tableId).select(build(true, true)).firstPage();
  } catch (e) {
    console.warn("[capitalkeywords] Airtable select (fields+sort) failed:", (e as Error)?.message);
    try {
      return await airtable(tableId).select(build(false, true)).firstPage();
    } catch (e2) {
      console.warn("[capitalkeywords] Airtable select (no fields, with sort) failed:", (e2 as Error)?.message);
      try {
        return await airtable(tableId).select(build(false, false)).firstPage();
      } catch (e3) {
        console.error("[capitalkeywords] Airtable select (no fields, no sort) failed:", (e3 as Error)?.message);
        throw e3;
      }
    }
  }
}

export function getProposedTopicsFieldList(): string[] {
  return [
    "Source",
    "Title",
    "summary",
    "Social_hook",
    "Keyword1",
    "Keyword2",
    "Keyword3",
    "Keyword_tag",
    "psy_trigger",
    "Stock_tag",
    "stockcode1",
    "stockcode2",
    "stockcode3",
    "Create date",
    "Status",
    "Approve",
    "Custome",
    proposedTopicsCompanyFieldName(),
  ];
}

export function capitalKeywordsListCacheKey(companyFilter: string): string {
  return companyFilter
    ? `${CACHE_KEYS.CAPITAL_KEYWORDS_DATA}:co:${companyFilter}`
    : CACHE_KEYS.CAPITAL_KEYWORDS_DATA;
}

export function invalidateCapitalKeywordsListCaches(): void {
  cache.invalidate(CACHE_KEYS.CAPITAL_KEYWORDS);
  cache.invalidatePrefix("capital:keywords:data");
}

function normalizeProposedTopicCompanyRaw(raw: unknown): string {
  if (raw == null || raw === "") return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw && "name" in raw && typeof (raw as { name: unknown }).name === "string") {
    return (raw as { name: string }).name;
  }
  return String(raw);
}

/** Read company from the configured field, or any field whose name is `company` case-insensitively. */
export function proposedTopicsCompanyFromRecord(record: any): string {
  const primary = proposedTopicsCompanyFieldName();
  try {
    const fromPrimary = normalizeProposedTopicCompanyRaw(record.get(primary));
    if (fromPrimary) return fromPrimary;
  } catch {
    // configured field name may not exist on older bases
  }

  const fields = record.fields as Record<string, unknown> | undefined;
  if (fields) {
    for (const k of Object.keys(fields)) {
      if (k.toLowerCase() === "company") {
        return normalizeProposedTopicCompanyRaw(fields[k]);
      }
    }
  }
  return "";
}

export function normalizedCompanyFilterValue(company: string): string {
  return company.trim().toLowerCase();
}

/** Airtable formula fragment: company field is blank (Capital-only records). */
export function companyBlankFormula(): string {
  const col = proposedTopicsCompanyFieldName();
  return `OR({${col}} = '', {${col}} = BLANK())`;
}

/** Wrap an existing filterByFormula with AND(existingFilter, companyIsBlank). */
export function withCompanyBlankFilter(existingFormula: string): string {
  return `AND(${existingFormula}, ${companyBlankFormula()})`;
}

/** Wrap with AND(..., LOWER(company) = "atfx") for ATFX-only proposed topics. */
export function withCompanyAtfxFilter(existingFormula: string): string {
  const col = proposedTopicsCompanyFieldName();
  return `AND(${existingFormula}, LOWER({${col}}) = "${PROPOSED_TOPICS_COMPANY_ATFX}")`;
}

export function capitalKeywordsFieldsFromBody(body: any): Record<string, string> {
  const fields: Record<string, string> = {};
  if (typeof body.source === "string") fields["Source"] = body.source;
  if (typeof body.title === "string") fields["Title"] = body.title;
  if (typeof body.summary === "string") fields["summary"] = body.summary;
  if (typeof body.socialHook === "string") fields["Social_hook"] = body.socialHook;
  if (typeof body.keyword1 === "string") fields["Keyword1"] = body.keyword1;
  if (typeof body.keyword2 === "string") fields["Keyword2"] = body.keyword2;
  if (typeof body.keyword3 === "string") fields["Keyword3"] = body.keyword3;
  // Keyword_tag is a computed field in Airtable — skip it
  if (typeof body.psyTrigger === "string") fields["psy_trigger"] = body.psyTrigger;
  // Stock_tag is a computed field — write to stockcode1/2/3 instead
  if (typeof body.stockcode1 === "string") fields["stockcode1"] = body.stockcode1;
  if (typeof body.stockcode2 === "string") fields["stockcode2"] = body.stockcode2;
  if (typeof body.stockcode3 === "string") fields["stockcode3"] = body.stockcode3;
  if (typeof body.custom === "string") fields["Custome"] = body.custom;
  return fields;
}
