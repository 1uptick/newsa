import express from "express";
import { cache, CACHE_KEYS } from "../cache.js";
import { config } from "../config.js";
import { authenticateToken } from "../auth.js";
import {
  stripClaimedPricesFromText,
  validateAtfxTopicAgainstFmpQuotes,
  validateDirectionClaims,
} from "../fmpQuotes.js";
import {
  ATFX_INSTITUTIONAL_AUTO_RESEARCH_BRIEF,
  ATFX_INSTITUTIONAL_AUTO_TOPIC_PLACEHOLDER,
  ATFX_KEYWORD_SEO_PROMPT_TEMPLATE,
  ATFX_RETAIL_AUTO_RESEARCH_BRIEF,
  ATFX_RETAIL_AUTO_TOPIC_PLACEHOLDER,
  PROPOSED_TOPICS_COMPANY_1UPTICK,
  PROPOSED_TOPICS_COMPANY_ATFX,
  PROPOSED_TOPICS_COMPANY_ATFX_AIRTABLE,
  fillAtfxKeywordSeoPromptTemplate,
  invalidateCapitalKeywordsListCaches,
  proposedTopicsCompanyFieldName,
} from "../capitalKeywords.js";
import { CAPITAL_KEYWORDS_TABLE_ID } from "../capitalAirtableIds.js";
import { CAPITAL_SEO_SYSTEM_PROMPT, ONEUPTICK_KEYWORD_SEO_PROMPT } from "../capitalSeoPrompts.js";
import { appendUserActivity, beginBackgroundJob, endBackgroundJob } from "../userActivityLog.js";
import {
  appendTopicPanelProgress,
  beginTopicPanelProgress,
  endTopicPanelProgress,
  getTopicPanelProgressSnapshot,
} from "../topicPanelProgress.js";
import {
  MAX_MERGED_EXCLUDE_TITLES,
  fetchAtfxTopicSnippetsFromDb,
  fetchAtfxTopicTitlesFromDb,
  mergeExcludeTitleLists,
  isDuplicateOfRecentTitles,
  isTooSimilarToRecentText,
  highestSimilarityScore,
  findFirstSimilarText,
} from "../atfxRecentTopicTitles.js";
import {
  focusAreaIndexForBatch,
  focusAreaMandateBlock,
  multiCandidateInstruction,
} from "../atfxTopicFocusAreas.js";
import { stripAtfxTopicJsonFields } from "../stripLlmCitations.js";

type RegisterDeps = { airtable: any | null };

const ATFX_FRESH_REQUESTY_MODELS = new Set(["google/gemini-2.5-flash", "openai/gpt-4.1-mini"]);

function topicProgressRetry(
  reason: "similar" | "quote_mismatch" | "direction_mismatch" | "format" | "incomplete" | "service_busy",
  idea: number,
  max: number,
  context?: string,
  candidateTitle?: string
): string {
  const step = `(idea ${idea} of ${max})`;
  switch (reason) {
    case "similar": {
      const ref = context?.trim();
      const candidate = candidateTitle?.trim();
      const clip = (s: string, maxLen: number) =>
        s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
      const candidateBit = candidate ? `“${clip(candidate, 56)}” — ` : "";
      const refBit = ref
        ? `too close to “${clip(ref, 56)}”`
        : "too close to a recent topic";
      return `${candidateBit}That story angle — ${refBit}. Searching for a different market story ${step}…`;
    }
    case "quote_mismatch":
      return `Headline price levels didn't match live quotes — reframing around catalysts instead ${step}…`;
    case "direction_mismatch":
      return `Headline direction didn't match today's live prices — reframing around catalysts instead ${step}…`;
    case "format":
      return `Topic draft wasn't formatted correctly — asking again ${step}…`;
    case "incomplete":
      return `Topic draft came back incomplete — asking for a full headline and summary ${step}…`;
    case "service_busy":
      return `Research service was busy — trying again ${step}…`;
  }
}

function topicProgressTopicReady(title: string): string {
  const t = title.trim();
  return `Topic ready: ${t.slice(0, 72)}${t.length > 72 ? "…" : ""}`;
}

type AtfxTopicValidationResult =
  | { ok: true }
  | { ok: false; reason: "quote_mismatch" | "direction_mismatch"; retryHint: string };

async function validateAtfxTopicForSave(
  topicData: Record<string, unknown>,
  relaxedAtfxTopic: boolean,
  topicFromNews: boolean
): Promise<AtfxTopicValidationResult> {
  let origTitle = String(topicData.seo_title ?? "").trim();
  let origSummary = String(topicData.summary ?? "").trim();
  if (relaxedAtfxTopic) {
    origTitle = stripIndexPointMoveClaims(origTitle);
    origSummary = stripIndexPointMoveClaims(origSummary);
    topicData.seo_title = origTitle;
    topicData.summary = origSummary;
  }

  const fmpResult = await validateAtfxTopicAgainstFmpQuotes(
    origTitle,
    origSummary,
    config.fmp.apiKey,
    config.fmp.quoteValidationEnabled
  );
  if (fmpResult.ok === false) {
    if (relaxedAtfxTopic && fmpResult.failures?.length) {
      let t = stripClaimedPricesFromText(origTitle, fmpResult.failures);
      let s = stripClaimedPricesFromText(origSummary, fmpResult.failures);
      if (t.length < 6 || t.length < Math.floor(origTitle.length * 0.35)) t = origTitle;
      if (s.length < 20 || s.length < Math.floor(origSummary.length * 0.35)) s = origSummary;
      topicData.seo_title = t;
      topicData.summary = s;
      return { ok: true };
    }
    if (relaxedAtfxTopic) return { ok: true };
    return {
      ok: false,
      reason: "quote_mismatch",
      retryHint:
        `\n\nYour previous headline or summary included price levels that did not match live quotes. Focus on catalysts and outlook without specific wrong price figures. Output ONLY valid JSON.`,
    };
  }

  const dirResult = await validateDirectionClaims(
    String(topicData.seo_title ?? ""),
    String(topicData.summary ?? ""),
    config.fmp.apiKey,
    config.fmp.quoteValidationEnabled
  );
  if (dirResult.ok === false) {
    console.warn("[ATFX topic generate] direction validation failed:", dirResult.message);
    if (relaxedAtfxTopic) return { ok: true };
    return {
      ok: false,
      reason: "direction_mismatch",
      retryHint:
        `\n\nYour previous headline or summary implied a price direction (surge, rally, pullback, 衝高, 回落, 連漲, etc.) that contradicts live market data. Reframe around catalysts (policy, data, flows, support/resistance questions) without asserting the wrong direction. Ground every claim in search results. Output ONLY valid JSON.`,
    };
  }

  return { ok: true };
}

/** Map Capital "topic ideas" JSON into legacy Airtable fields (Title ← label / first idea; summary includes bullets). */
function normalizeCapitalSeoTopicIdeas(topicData: Record<string, unknown>): void {
  const ideas = Array.isArray(topicData.topic_ideas) ? topicData.topic_ideas : [];
  const label = String(topicData.idea_cluster_label ?? "").trim();
  const summaryText = String(topicData.summary ?? "").trim();
  const ideasBlock = ideas.length
    ? ideas.map((s: unknown, i: number) => `${i + 1}. ${String(s).trim()}`).join("\n")
    : "";
  if (ideasBlock) {
    topicData.summary = summaryText
      ? `${summaryText}\n\n—— 主題方向 ——\n${ideasBlock}`
      : `—— 主題方向 ——\n${ideasBlock}`;
  }
  const firstIdea = ideas.length ? String(ideas[0]).trim() : "";
  const existingTitle = String(topicData.seo_title ?? "").trim();
  topicData.seo_title = label || firstIdea || existingTitle || "SEO 主題方向";
}

function requestyAssistantContentText(message: { content?: unknown } | undefined): string {
  const c = message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((part: unknown) => {
        if (part && typeof part === "object") {
          const p = part as Record<string, unknown>;
          if (typeof p.text === "string") return p.text;
          if (typeof p.output_text === "string") return p.output_text;
          if (typeof p.content === "string") return p.content;
        }
        return "";
      })
      .join("");
  }
  return "";
}

/** Read assistant-visible text from a chat-completions `choice` (message.content or legacy `text`). */
function choiceAssistantText(choice: unknown): string {
  if (!choice || typeof choice !== "object") return "";
  const ch = choice as Record<string, unknown>;
  if (typeof ch.text === "string" && ch.text.trim()) return ch.text;
  const msg = ch.message;
  if (msg && typeof msg === "object") {
    return requestyAssistantContentText(msg as { content?: unknown });
  }
  return "";
}

/** Remove brittle "index moved X points" claims (often stale/wrong in generated text). */
function stripIndexPointMoveClaims(raw: string): string {
  if (!raw) return "";
  let t = raw;
  t = t.replace(
    /((?:道瓊|道琼|Dow(?:\s+Jones)?|DJI|DJIA|納指|纳指|Nasdaq|標普|标普|S&P)[^。；，,\n]{0,26}?)(\d{2,5}(?:,\d{3})?(?:\.\d+)?)\s*點/gi,
    "$1"
  );
  t = t.replace(
    /(\d{2,5}(?:,\d{3})?(?:\.\d+)?)\s*點([^。；，,\n]{0,26}?)(?:道瓊|道琼|Dow(?:\s+Jones)?|DJI|DJIA|納指|纳指|Nasdaq|標普|标普|S&P)/gi,
    "$2"
  );
  return t.replace(/\s{2,}/g, " ").trim();
}

/**
 * Stops stale macro (Fed/SEP/dot counts) and stale election/campaign narratives (LLM training vs web search).
 * Appended to **every** ATFX topic request: typed topic, sidebar, trending news, and fresh/auto institutional & retail.
 */
function atfxTopicTemporalAnchorBlock(): string {
  const d = new Date();
  const iso = d.toISOString().slice(0, 10);
  const year = d.getUTCFullYear();
  return `CALENDAR & RECENCY (mandatory for seo_title + summary + keywords):
- Server "today" (UTC date): ${iso}. Use this as the publication clock.
- Every dated statistic, FOMC outcome, dot-plot / SEP figure, “X位官員…”, GDP/PCE forecast **year**, and “no cuts in 20XX” line must come from your **web search** hits inside the allowed recency window — not from memory or old examples.
- For **forward-looking** Fed / inflation / macro: when you name a calendar year for the live outlook, it must be **${year} or later**, or omit the year if sources do not pin one down. Do **not** treat 2024/2025 as the default “current” forecast horizon unless a retrieved source explicitly frames them as the latest official baseline **now**.
- If search does not support a precise vote count, dot detail, or dated percentage, use qualitative conditional language instead of inventing or recycling stale consensus.
- **Politics & elections:** Do not recycle outdated campaign narratives (e.g. a leader “正在競選連任 / seeking re‑election / running for president”) from training memory. If the topic touches US or other major-country leadership or elections, **who holds office and what phase the cycle is in** must match **retrieved** sources as of ${iso}. If search does not clearly support a campaign vs incumbency framing, prefer neutral policy/markets wording and omit speculative election storylines.`;
}

/** Strip markdown fences / preamble and return the outermost `{ ... }` substring for topic JSON. */
function extractTopicJsonSubstring(raw: string): string | null {
  let t = (raw ?? "").trim();
  if (!t) return null;
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) return t.slice(start, end + 1);
  return null;
}

/** Requesty/OpenAI chat message shape for topic generation. */
async function fetchRequestyTopicCompletion(params: {
  url: string;
  apiKey: string;
  model: string;
  temperature: number;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  searchRecency: "week" | "month";
  referer: string;
}): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${params.apiKey}`,
    "HTTP-Referer": params.referer,
    "X-Title": "Newsa ATFX topic generation",
  };

  const baseBody: Record<string, unknown> = {
    model: params.model,
    temperature: params.temperature,
    messages: params.messages,
  };

  let res = await fetch(params.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...baseBody,
      web_search_options: { search_recency_filter: params.searchRecency },
    }),
  });

  if (!res.ok && res.status === 400) {
    const errPeek = await res.text();
    console.warn(
      "Requesty topic LLM 400 with web_search_options; retrying without (router may reject that field):",
      errPeek.slice(0, 800)
    );
    res = await fetch(params.url, {
      method: "POST",
      headers,
      body: JSON.stringify(baseBody),
    });
  }

  return res;
}

/** ATFX “fresh topics” / auto-institutional / auto-retail: call Perplexity Chat Completions directly (sonar-pro), not Requesty. */
async function fetchPerplexitySonarProTopicCompletion(params: {
  temperature: number;
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  searchRecency: "week" | "month";
}): Promise<{ ok: true; json: unknown } | { ok: false; status: number; text: string }> {
  const apiKey = config.perplexity.apiKey?.trim();
  if (!apiKey) {
    return { ok: false, status: 503, text: "Perplexity is not configured (missing PERPLEXITY_API_KEY)." };
  }

  const searchRecencyFilter = params.searchRecency === "week" ? "week" : "month";
  const body: Record<string, unknown> = {
    model: "sonar-pro",
    messages: params.messages,
    temperature: params.temperature,
    search_recency_filter: searchRecencyFilter,
    max_tokens: 8192,
  };

  const url = config.perplexity.chatCompletionsUrl;
  let lastErrText = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 95_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const text = await res.text().catch(() => "");
      lastErrText = text;
      if (res.ok) {
        try {
          return { ok: true, json: JSON.parse(text) as unknown };
        } catch {
          return { ok: false, status: 500, text: "Perplexity returned a non-JSON body." };
        }
      }
      if ([429, 500, 502, 503, 504].includes(res.status) && attempt < 3) {
        await new Promise((r) => setTimeout(r, 700 * attempt));
        continue;
      }
      return { ok: false, status: res.status, text: text.slice(0, 2000) };
    } catch (e) {
      clearTimeout(timer);
      lastErrText = e instanceof Error ? e.message : String(e);
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 700 * attempt));
        continue;
      }
      return { ok: false, status: 502, text: lastErrText };
    }
  }
  return { ok: false, status: 502, text: lastErrText.slice(0, 2000) };
}

function buildAtfxAutoTopicUserMessage(
  audience: "institutional" | "retail",
  excludeTitlesNarrow: string[],
  relaxedAtfxTopic: boolean,
  batchIndex: number,
  batchTotal: number,
  useMultiCandidate: boolean
): string {
  const areaIdx = focusAreaIndexForBatch(audience, batchIndex, batchTotal);
  let userMessage =
    audience === "institutional"
      ? "Execute the research brief: using verifiable evidence from roughly the **last 30–60 days** (use the most recent week only for urgency wording), then output ONLY the JSON object as specified—no preamble. **Do not invent** index/FX/yield levels—every number must be supported by your search results."
      : "Execute the research brief: using verifiable evidence from roughly the **last 30–60 days** (use the most recent week only for urgency wording), identify retail SEO topic(s) **within forex, commodities, major indices, CFDs, and US stock trading**, then output ONLY the JSON object as specified—no preamble. **Do not invent** DXY/FX/index thresholds or “重破” claims—only use levels **explicitly supported** by search.";

  userMessage += focusAreaMandateBlock(audience, areaIdx, { batchIndex, batchTotal });
  if (useMultiCandidate) {
    userMessage += multiCandidateInstruction(audience);
  }

  if (!relaxedAtfxTopic && excludeTitlesNarrow.length > 0) {
    const lines = excludeTitlesNarrow.map((t, idx) => `${idx + 1}. ${t}`).join("\n");
    userMessage +=
      audience === "institutional"
        ? `\n\nIMPORTANT — Do not repeat or closely paraphrase any of these recent institutional topic headlines (already in use). Pick a clearly different angle, sub-theme, instrument, or geography/mechanism:\n${lines}\n\nAlso avoid another headline about the **same market story** as any line above (same region + sector + policy theme) even if amounts or wording differ.`
        : `\n\nIMPORTANT — Do not repeat or closely paraphrase any of these recent retail topic headlines (already in use). Pick a clearly different angle, keyword cluster, ticker, or story hook:\n${lines}\n\nAlso avoid another headline about the **same market story** as any line above even if amounts or wording differ.`;
  }

  return userMessage;
}

export function registerCapitalKeywordGenerateRoute(app: express.Application, deps: RegisterDeps): void {
  const { airtable } = deps;

  app.get("/api/capitalkeywords/panel-progress/:sessionId", authenticateToken, (req, res) => {
    const sessionId =
      typeof req.params.sessionId === "string" ? req.params.sessionId.trim().slice(0, 64) : "";
    if (!sessionId) return res.status(400).json({ error: "Missing session id" });
    res.json(getTopicPanelProgressSnapshot(sessionId));
  });

  app.post("/api/capitalkeywords/generate", authenticateToken, async (req, res) => {
    if (!config.requesty.apiKey) {
      return res.status(503).json({ error: "Topic generation is not available (LLM not configured on the server)." });
    }
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }

    const {
      topic,
      source: sourceCategory,
      company: bodyCompanyRaw,
      audience: audienceRaw,
      autoInstitutionalTopic: autoInstitutionalRaw,
      autoRetailTopic: autoRetailRaw,
      excludeRecentTitles: excludeRecentTitlesRaw,
      topicFromNews: topicFromNewsRaw,
      topicFromSidebar: topicFromSidebarRaw,
      newsHeadline: newsHeadlineRaw,
      newsSummary: newsSummaryRaw,
      newsUrl: newsUrlRaw,
      requestyTopicModel: requestyTopicModelRaw,
      panelProgressSessionId: panelProgressSessionIdRaw,
      batchIndex: batchIndexRaw,
      batchTotal: batchTotalRaw,
    } = req.body || {};

    const panelProgressSessionId =
      typeof panelProgressSessionIdRaw === "string" ? panelProgressSessionIdRaw.trim().slice(0, 64) : "";
    const usePanelProgress = panelProgressSessionId.length > 0;

    const batchIndex =
      typeof batchIndexRaw === "number" && Number.isFinite(batchIndexRaw)
        ? Math.max(0, Math.min(2, Math.floor(batchIndexRaw)))
        : typeof batchIndexRaw === "string" && batchIndexRaw.trim() !== ""
          ? Math.max(0, Math.min(2, parseInt(batchIndexRaw, 10) || 0))
          : 0;
    const batchTotal =
      typeof batchTotalRaw === "number" && Number.isFinite(batchTotalRaw)
        ? Math.max(1, Math.min(3, Math.floor(batchTotalRaw)))
        : typeof batchTotalRaw === "string" && batchTotalRaw.trim() !== ""
          ? Math.max(1, Math.min(3, parseInt(batchTotalRaw, 10) || 1))
          : 1;

    const normalizeExcludeRecentTitles = (raw: unknown): string[] => {
      if (!Array.isArray(raw)) return [];
      const out: string[] = [];
      for (const x of raw) {
        if (typeof x !== "string") continue;
        const t = x.trim();
        if (!t) continue;
        out.push(t.length > 220 ? `${t.slice(0, 220)}…` : t);
        if (out.length >= 24) break;
      }
      return [...new Set(out)];
    };
    const bodyCompany =
      typeof bodyCompanyRaw === "string" ? bodyCompanyRaw.trim().toLowerCase() : "";
    const topicFromNews =
      bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX &&
      (topicFromNewsRaw === true || topicFromNewsRaw === "true" || topicFromNewsRaw === 1);
    const newsHeadline = typeof newsHeadlineRaw === "string" ? newsHeadlineRaw.trim().slice(0, 320) : "";
    const newsSummary = typeof newsSummaryRaw === "string" ? newsSummaryRaw.trim().slice(0, 900) : "";
    const newsUrl = typeof newsUrlRaw === "string" ? newsUrlRaw.trim().slice(0, 600) : "";
    const requestyTopicModel =
      typeof requestyTopicModelRaw === "string" ? requestyTopicModelRaw.trim().toLowerCase() : "";
    const topicTrimmed = topic && typeof topic === "string" ? topic.trim() : "";
    let autoInstitutional =
      autoInstitutionalRaw === true || autoInstitutionalRaw === "true" || autoInstitutionalRaw === 1;
    let autoRetail = autoRetailRaw === true || autoRetailRaw === "true" || autoRetailRaw === 1;

    if (autoInstitutional && autoRetail) {
      return res.status(400).json({ error: "Cannot set both autoInstitutionalTopic and autoRetailTopic." });
    }

    let atfxAudience: "institutional" | "retail" =
      typeof audienceRaw === "string" && audienceRaw.trim().toLowerCase() === "institutional"
        ? "institutional"
        : "retail";
    if (autoInstitutional) {
      atfxAudience = "institutional";
    }
    if (autoRetail) {
      atfxAudience = "retail";
    }

    const isFreshTopicsBatchHint =
      bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX &&
      !topicTrimmed &&
      Array.isArray(excludeRecentTitlesRaw);
    if (isFreshTopicsBatchHint && !autoInstitutional && !autoRetail) {
      if (atfxAudience === "institutional") {
        autoInstitutional = true;
      } else {
        autoRetail = true;
      }
    }

    if (autoInstitutional && bodyCompany !== PROPOSED_TOPICS_COMPANY_ATFX) {
      return res.status(400).json({ error: "autoInstitutionalTopic is only valid when company is atfx." });
    }
    if (autoRetail && bodyCompany !== PROPOSED_TOPICS_COMPANY_ATFX) {
      return res.status(400).json({ error: "autoRetailTopic is only valid when company is atfx." });
    }
    const isAtfxFreshFlow = bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX && (autoInstitutional || autoRetail);
    if (requestyTopicModel && !isAtfxFreshFlow) {
      return res.status(400).json({
        error: "requestyTopicModel is only supported for ATFX auto/fresh topic generation.",
      });
    }
    if (requestyTopicModel && !ATFX_FRESH_REQUESTY_MODELS.has(requestyTopicModel)) {
      return res.status(400).json({
        error:
          'Unsupported requestyTopicModel. Allowed values: "google/gemini-2.5-flash", "openai/gpt-4.1-mini".',
      });
    }

    if (bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX && !topicTrimmed && !autoInstitutional && !autoRetail) {
      return res.status(400).json({ error: "Topic is required for ATFX SEO generation." });
    }

    /** Manual “Generate a new SEO Topic” box — not auto/fresh batch. Same relaxed FMP/dedup as trending news. */
    const topicFromSidebar =
      bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX &&
      !autoInstitutional &&
      !autoRetail &&
      Boolean(topicTrimmed) &&
      (topicFromSidebarRaw === true || topicFromSidebarRaw === "true" || topicFromSidebarRaw === 1);
    const relaxedAtfxTopic = topicFromNews || topicFromSidebar;

    const atfxInputForAirtable = topicTrimmed;
    const NARROW_DEDUP_DAYS = 7;
    const WIDE_DEDUP_DAYS = 21;
    const excludeTitles = normalizeExcludeRecentTitles(excludeRecentTitlesRaw);
    const strictDedup =
      bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX && (autoInstitutional || autoRetail || isFreshTopicsBatchHint);

    let excludeTitlesNarrow = excludeTitles;
    let excludeTitlesWide = excludeTitles;
    let recentSnippetsNarrow: { title: string; summary: string }[] = [];
    let recentSnippetsWide: { title: string; summary: string }[] = [];

    if (bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX) {
      try {
        const [narrowTitles, wideTitles, narrowSnippets, wideSnippets] = await Promise.all([
          fetchAtfxTopicTitlesFromDb(airtable, CAPITAL_KEYWORDS_TABLE_ID, atfxAudience, NARROW_DEDUP_DAYS),
          fetchAtfxTopicTitlesFromDb(airtable, CAPITAL_KEYWORDS_TABLE_ID, atfxAudience, WIDE_DEDUP_DAYS),
          fetchAtfxTopicSnippetsFromDb(airtable, CAPITAL_KEYWORDS_TABLE_ID, atfxAudience, NARROW_DEDUP_DAYS),
          fetchAtfxTopicSnippetsFromDb(airtable, CAPITAL_KEYWORDS_TABLE_ID, atfxAudience, WIDE_DEDUP_DAYS),
        ]);
        excludeTitlesNarrow = mergeExcludeTitleLists(excludeTitles, narrowTitles, MAX_MERGED_EXCLUDE_TITLES);
        excludeTitlesWide = mergeExcludeTitleLists(excludeTitles, wideTitles, MAX_MERGED_EXCLUDE_TITLES);
        recentSnippetsNarrow = narrowSnippets;
        recentSnippetsWide = wideSnippets;
        console.info(
          `[ATFX topic generate] exclude titles — client: ${excludeTitles.length}, ` +
            `DB 7d ${atfxAudience}: ${narrowTitles.length}, DB 21d: ${wideTitles.length}, ` +
            `merged narrow: ${excludeTitlesNarrow.length}, merged wide: ${excludeTitlesWide.length}`
        );
      } catch (e) {
        console.error("[capitalkeywords/generate] ATFX recent topic titles from DB:", e);
      }
    }

    let systemPrompt: string;
    let userMessage: string;
    if (bodyCompany === PROPOSED_TOPICS_COMPANY_1UPTICK) {
      systemPrompt = ONEUPTICK_KEYWORD_SEO_PROMPT.replace(
        "[ENTER KEYWORD HERE]",
        topicTrimmed ||
          "（未指定 — 請從近3日市場中選擇最能吸引香港零售投資者點擊的主題，並以該主題作為 [KEYWORD] 進行研究）"
      );
      userMessage = "Generate the JSON output only, following the system instructions.";
    } else if (bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX && autoInstitutional) {
      systemPrompt = `${ATFX_INSTITUTIONAL_AUTO_RESEARCH_BRIEF}

---

${fillAtfxKeywordSeoPromptTemplate(
        ATFX_KEYWORD_SEO_PROMPT_TEMPLATE,
        "institutional",
        ATFX_INSTITUTIONAL_AUTO_TOPIC_PLACEHOLDER
      )}`;
      userMessage = buildAtfxAutoTopicUserMessage(
        "institutional",
        excludeTitlesNarrow,
        relaxedAtfxTopic,
        batchIndex,
        batchTotal,
        strictDedup
      );
    } else if (bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX && autoRetail) {
      systemPrompt = `${ATFX_RETAIL_AUTO_RESEARCH_BRIEF}

---

${fillAtfxKeywordSeoPromptTemplate(
        ATFX_KEYWORD_SEO_PROMPT_TEMPLATE,
        "retail",
        ATFX_RETAIL_AUTO_TOPIC_PLACEHOLDER
      )}`;
      userMessage = buildAtfxAutoTopicUserMessage(
        "retail",
        excludeTitlesNarrow,
        relaxedAtfxTopic,
        batchIndex,
        batchTotal,
        strictDedup
      );
    } else if (bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX) {
      systemPrompt = fillAtfxKeywordSeoPromptTemplate(
        ATFX_KEYWORD_SEO_PROMPT_TEMPLATE,
        atfxAudience,
        topicTrimmed
      );
      userMessage = `Generate the JSON output only. Stay focused on the user topic "${topicTrimmed}" and the ${
        atfxAudience === "institutional" ? "institutional" : "retail"
      } audience described in the system prompt. Do not invent specific index/FX/yield levels—only cite figures your search results support. Keep policy and macro timelines aligned with the current calendar year from your search results (avoid outdated “last year” consensus presented as live).`;
      if (!relaxedAtfxTopic && excludeTitlesNarrow.length > 0) {
        const lines = excludeTitlesNarrow.map((t, idx) => `${idx + 1}. ${t}`).join("\n");
        userMessage +=
          atfxAudience === "institutional"
            ? `\n\nIMPORTANT — Do not repeat or closely paraphrase any of these recent institutional topic headlines (already in use). Pick a clearly different angle, sub-theme, instrument, or geography/mechanism:\n${lines}\n\nAlso avoid another headline about the **same market story** as any line above even if amounts or wording differ.`
            : `\n\nIMPORTANT — Do not repeat or closely paraphrase any of these recent retail topic headlines (already in use). Pick a clearly different angle, keyword cluster, ticker, or story hook:\n${lines}\n\nAlso avoid another headline about the **same market story** as any line above even if amounts or wording differ.`;
      }
    } else {
      systemPrompt = CAPITAL_SEO_SYSTEM_PROMPT;
      userMessage = topicTrimmed
        ? `User keywords / theme (primary anchor): "${topicTrimmed}". Use web search over roughly the last month. Output ONLY the JSON in the system prompt: topic ideas and long-term SEO rationale—do not write polished publication-ready SEO titles.`
        : `No keywords were provided. Infer one strong theme cluster from roughly the past month that fits Hong Kong retail investors and long-term SEO. Output ONLY the JSON in the system prompt—topic ideas and rationale, not final headlines.`;
    }

    if (bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX && topicFromNews) {
      const newsContextLines = [
        `Headline: ${newsHeadline || topicTrimmed}`,
        newsSummary ? `Summary: ${newsSummary}` : "",
        newsUrl ? `Source URL: ${newsUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      userMessage += `\n\nTRENDING NEWS MODE (strict):
- Use this news context as the primary anchor; keep topic angle directly related.
- Research window: ONLY the last 48 hours. If a source is older, ignore it.
- Temperature is fixed at 0 on the server for deterministic output.
- Any market data/price/points/levels MUST be fresh and explicitly supported by your retrieved sources.
- If a numeric level cannot be confirmed, avoid stating the number; keep the topic directionally correct.

News context:
${newsContextLines}`;
    }

    if (bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX && topicFromSidebar && !topicFromNews) {
      userMessage += `\n\nSIDEBAR KEYWORD MODE (strict output):
- Stay tightly anchored to the user topic "${topicTrimmed}".
- Prefer evidence from roughly the last 7 days.
- Server uses temperature 0 for deterministic output.
- Do not invent prices, point moves, or index levels unless clearly supported by your search; if unsure, omit the number and keep the narrative accurate.`;
    }

    /** Calendar + politics/elections grounding for every ATFX path (manual, sidebar, trending news, fresh/auto). */
    if (bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX) {
      userMessage += `\n\n${atfxTopicTemporalAnchorBlock()}`;
    }

    const capitalSeoGeneration = systemPrompt === CAPITAL_SEO_SYSTEM_PROMPT;

    const activityMsg =
      bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX && autoInstitutional
        ? "Generating institutional SEO topic…"
        : bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX && autoRetail
          ? "Generating retail SEO topic…"
          : bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX
            ? `Generating SEO topic (${atfxAudience === "institutional" ? "institutional" : "retail"})…`
            : "Generating SEO topic…";

    let uid: string | undefined;
    let progress: { begin: () => void; log: (message: string) => void; end: () => void } | null = null;
    try {
      uid = (req as express.Request & { uid?: string }).uid;
      progress = usePanelProgress
        ? {
            begin: () => beginTopicPanelProgress(panelProgressSessionId),
            log: (message: string) => appendTopicPanelProgress(panelProgressSessionId, message),
            end: () => endTopicPanelProgress(panelProgressSessionId),
          }
        : {
            begin: () => beginBackgroundJob(uid),
            log: (message: string) => appendUserActivity(uid, message),
            end: () => endBackgroundJob(uid),
          };
      progress.begin();
      progress.log(activityMsg);

      // For ATFX auto/fresh generation, we prefer "keep trying" over returning an error to the user.
      // Also, use a wider research window (month) and more diverse temperatures to break out of same-story repeats.
      const MAX_ATTEMPTS = 4;
      const TEMPERATURE_RAMP = strictDedup ? [0, 0.35, 0.55, 0.75] : [0, 0.3, 0.5, 0.7];
      let topicData: any;
      let parsedTopicsArray: any[] | undefined;
      let userMsgForLlm = userMessage;
      let dedupWarning: string | undefined;
      let lastRejectTitle = "";
      let lastRejectSimilarTo = "";

      const useMultiCandidatePick =
        strictDedup && bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX && (autoInstitutional || autoRetail);
      const zeroTempAtfxManual =
        bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX &&
        !autoInstitutional &&
        !autoRetail &&
        relaxedAtfxTopic;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const temp = zeroTempAtfxManual ? 0 : TEMPERATURE_RAMP[Math.min(attempt, TEMPERATURE_RAMP.length - 1)];
        // First attempt: narrow 7-day window; retries: wider 21-day window
        const excludeTitlesMerged = attempt === 0 ? excludeTitlesNarrow : excludeTitlesWide;
        const recentSnippets = attempt === 0 ? recentSnippetsNarrow : recentSnippetsWide;

        const searchRecency: "week" | "month" = capitalSeoGeneration
          ? "month"
          : zeroTempAtfxManual
            ? "week"
          : strictDedup
            ? "month"
            : attempt === 0
              ? "week"
              : "month";

        /** ATFX “Generate fresh topics” (and auto institutional / auto retail) — Perplexity direct when key is set. */
        const requestyModelOverride = requestyTopicModel || "";
        const usePerplexityDirectForAtfxFresh =
          bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX &&
          (autoInstitutional || autoRetail) &&
          !requestyModelOverride &&
          Boolean(config.perplexity.apiKey?.trim());

        let llmJson: unknown;
        if (usePerplexityDirectForAtfxFresh) {
          const pr = await fetchPerplexitySonarProTopicCompletion({
            temperature: temp,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMsgForLlm },
            ],
            searchRecency,
          });
          if (pr.ok === false) {
            console.error("Perplexity (ATFX fresh topics) error:", pr.status, pr.text.slice(0, 800));
            if (attempt < MAX_ATTEMPTS - 1) {
              progress.log(topicProgressRetry("service_busy", attempt + 2, MAX_ATTEMPTS));
              userMsgForLlm =
                userMessage +
                `\n\nThe previous upstream request failed. Output ONLY valid JSON as specified in the system prompt — no preamble.`;
              continue;
            }
            progress.log( "Couldn't reach the research service — please try again shortly.");
            return res.status(pr.status === 503 ? 503 : 502).json({
              error:
                pr.status === 503
                  ? "Perplexity is not configured on the server (missing PERPLEXITY_API_KEY)."
                  : "Upstream Perplexity request failed. Try again later.",
              upstreamStatus: pr.status,
            });
          }
          llmJson = pr.json;
        } else {
          if (
            bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX &&
            (autoInstitutional || autoRetail) &&
            !config.perplexity.apiKey?.trim()
          ) {
            console.warn(
              "[capitalkeywords/generate] ATFX auto/fresh topics: PERPLEXITY_API_KEY unset — using Requesty (REQUESTY_CAPITAL_TOPIC_MODEL) instead."
            );
          }
          const llmRes = await fetchRequestyTopicCompletion({
            url: config.requesty.chatCompletionsUrl,
            apiKey: config.requesty.apiKey,
            model: requestyModelOverride || config.requesty.capitalTopicModel,
            temperature: temp,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userMsgForLlm },
            ],
            searchRecency,
            referer: config.appBaseUrl,
          });

          if (!llmRes.ok) {
            const errBody = await llmRes.text();
            console.error("Requesty error:", llmRes.status, errBody);
            progress.log( "Couldn't complete topic research — please try again shortly.");
            return res.status(502).json({
              error: "Upstream LLM request failed. Try again later.",
              upstreamStatus: llmRes.status,
            });
          }

          llmJson = await llmRes.json();
        }
        const choice0 = (llmJson as { choices?: unknown[] })?.choices?.[0];
        const content = choiceAssistantText(choice0);

        const jsonStr = extractTopicJsonSubstring(content);
        if (!jsonStr) {
          const fr = choice0 && typeof choice0 === "object" ? String((choice0 as { finish_reason?: unknown }).finish_reason ?? "") : "";
          console.warn(
            `[capitalkeywords/generate] no JSON object in assistant text (attempt ${attempt + 1}/${MAX_ATTEMPTS}) ` +
              `finish_reason=${fr} contentLen=${content.length}`,
            content.slice(0, 900)
          );
          if (attempt < MAX_ATTEMPTS - 1) {
            progress.log(topicProgressRetry("format", attempt + 2, MAX_ATTEMPTS));
            userMsgForLlm =
              userMessage +
              `\n\nYour previous reply did not contain a parseable JSON object. Output ONLY one JSON object with the required keys (see system prompt). No preamble, no explanation — raw JSON only.`;
            continue;
          }
          progress.log("Almost there — that draft wasn't quite right. Please try again.");
          return res.status(500).json({ error: "Failed to parse LLM response as JSON." });
        }

        let parsed: any;
        try {
          parsed = JSON.parse(jsonStr);
        } catch (e) {
          console.warn(
            `[capitalkeywords/generate] JSON.parse failed (attempt ${attempt + 1}/${MAX_ATTEMPTS}):`,
            e,
            jsonStr.slice(0, 600)
          );
          if (attempt < MAX_ATTEMPTS - 1) {
            progress.log(topicProgressRetry("format", attempt + 2, MAX_ATTEMPTS));
            userMsgForLlm =
              userMessage +
              `\n\nYour previous output was not valid JSON. Return ONLY valid JSON per the schema — double-quoted keys, no trailing commas, no comments.`;
            continue;
          }
          progress.log( "Almost there — the topic format wasn't valid. Please try again.");
          return res.status(500).json({ error: "LLM returned invalid JSON." });
        }

        const parsedTopicsFromLlm = Array.isArray(parsed?.topics) ? parsed.topics : undefined;
        if (capitalSeoGeneration && parsedTopicsFromLlm) {
          parsedTopicsArray = parsedTopicsFromLlm;
        }
        const rawCandidates: Record<string, unknown>[] = useMultiCandidatePick
          ? parsedTopicsFromLlm && parsedTopicsFromLlm.length > 0
            ? parsedTopicsFromLlm.slice(0, 3)
            : parsed && typeof parsed === "object"
              ? [parsed as Record<string, unknown>]
              : []
          : parsedTopicsFromLlm && parsedTopicsFromLlm.length > 0
            ? [parsedTopicsFromLlm[0]]
            : parsed && typeof parsed === "object"
              ? [parsed as Record<string, unknown>]
              : [];

        if (rawCandidates.length === 0) {
          console.warn(
            `[capitalkeywords/generate] empty topic payload (attempt ${attempt + 1}/${MAX_ATTEMPTS}):`,
            JSON.stringify(parsed).slice(0, 500)
          );
          if (attempt < MAX_ATTEMPTS - 1) {
            progress.log(topicProgressRetry("incomplete", attempt + 2, MAX_ATTEMPTS));
            userMsgForLlm =
              userMessage +
              `\n\nYour previous JSON had no usable topic (empty "topics" or missing fields). Return ${
                useMultiCandidatePick ? "3 distinct topics in the topics array, each" : "one complete topic"
              } with seo_title and summary filled in.`;
            continue;
          }
          progress.log( "Still working on a complete topic — please try again.");
          return res.status(500).json({ error: "No topic in LLM response." });
        }

        const skipTopicDedup = relaxedAtfxTopic;
        const recentTexts =
          recentSnippets.length > 0
            ? recentSnippets.map((s) => `${s.title}\n${s.summary}`.trim()).filter(Boolean)
            : [];

        let accepted = false;
        for (const rawCand of rawCandidates) {
          if (!rawCand || typeof rawCand !== "object") continue;
          const cand = { ...rawCand };
          stripAtfxTopicJsonFields(cand);
          if (capitalSeoGeneration) {
            normalizeCapitalSeoTopicIdeas(cand);
          }

          const generatedTitle = String(cand.seo_title ?? "").trim();
          const generatedSummary = String(cand.summary ?? "").trim();

          if (
            bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX &&
            (generatedTitle.length < 6 || generatedSummary.length < 20)
          ) {
            continue;
          }

          const candidateText = `${generatedTitle}\n${generatedSummary}`.trim();
          const titleDup =
            !skipTopicDedup &&
            bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX &&
            excludeTitlesMerged.length > 0 &&
            isDuplicateOfRecentTitles(generatedTitle, excludeTitlesMerged);

          let summaryDup = false;
          if (
            !skipTopicDedup &&
            !titleDup &&
            bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX &&
            recentTexts.length > 0
          ) {
            summaryDup = isTooSimilarToRecentText(candidateText, recentTexts);
          }

          if (titleDup || summaryDup) {
            const score = highestSimilarityScore(
              titleDup ? generatedTitle : candidateText,
              titleDup ? excludeTitlesMerged : recentTexts
            );
            lastRejectTitle = generatedTitle;
            lastRejectSimilarTo =
              findFirstSimilarText(generatedTitle, excludeTitlesMerged) ??
              findFirstSimilarText(candidateText, recentTexts) ??
              score?.against ??
              "";
            console.info(
              `[ATFX topic generate] attempt ${attempt + 1}/${MAX_ATTEMPTS} blocked — ` +
                `${titleDup ? "title" : "summary"} combined=${score?.combined ?? "?"} ` +
                `vs="${lastRejectSimilarTo.slice(0, 60)}", title="${generatedTitle.slice(0, 60)}"`
            );
            continue;
          }

          topicData = cand;
          accepted = true;
          break;
        }

        if (accepted && topicData && bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX) {
          const validation = await validateAtfxTopicForSave(
            topicData as Record<string, unknown>,
            relaxedAtfxTopic,
            topicFromNews
          );
          if (validation.ok === false) {
            const rejectedTitle = String((topicData as Record<string, unknown>).seo_title ?? "").trim();
            accepted = false;
            topicData = undefined;
            if (rejectedTitle) lastRejectTitle = rejectedTitle;
            if (attempt < MAX_ATTEMPTS - 1) {
              progress.log(topicProgressRetry(validation.reason, attempt + 2, MAX_ATTEMPTS));
              userMsgForLlm = userMessage + validation.retryHint;
              continue;
            }
            progress.log("Couldn't finalize this topic after several tries — please run again.");
            return res.status(422).json({
              error: "Topic headline did not pass live market validation. Try generating again.",
            });
          }
          progress.log(topicProgressTopicReady(String((topicData as Record<string, unknown>).seo_title ?? "")));
        } else if (accepted && topicData) {
          progress.log(topicProgressTopicReady(String((topicData as Record<string, unknown>).seo_title ?? "")));
        }

        if (accepted) {
          break;
        }

        if (!lastRejectTitle) {
          console.warn(
            `[ATFX topic generate] attempt ${attempt + 1}/${MAX_ATTEMPTS} — all candidates too short or invalid`
          );
          if (attempt < MAX_ATTEMPTS - 1) {
            progress.log(topicProgressRetry("incomplete", attempt + 2, MAX_ATTEMPTS));
            userMsgForLlm =
              userMessage +
              `\n\nYour previous output had incomplete seo_title or summary fields. Provide complete topic(s). Output ONLY valid JSON.`;
            continue;
          }
        }

        // On the LAST attempt, accept the last candidate with a warning.
        if (attempt === MAX_ATTEMPTS - 1) {
          const fallback = rawCandidates[rawCandidates.length - 1];
          if (fallback && typeof fallback === "object") {
            topicData = { ...fallback };
            stripAtfxTopicJsonFields(topicData as Record<string, unknown>);
            if (capitalSeoGeneration) {
              normalizeCapitalSeoTopicIdeas(topicData as Record<string, unknown>);
            }
          }
          dedupWarning =
            "Topic is somewhat similar to a recent one but was accepted after multiple retries.";
          console.warn(
            `[ATFX topic generate] accepting topic after ${MAX_ATTEMPTS} attempts despite similarity — "${lastRejectTitle.slice(0, 80)}"`
          );
          progress.log( "Topic saved — close enough to recent stories; moving on.");
          break;
        }

        progress.log(topicProgressRetry("similar", attempt + 2, MAX_ATTEMPTS, lastRejectSimilarTo, lastRejectTitle));

        const retryExcludeLines =
          excludeTitlesWide.length > 0
            ? `\n\nHere are ALL recent topics from the last ${WIDE_DEDUP_DAYS} days that you must avoid:\n` +
              excludeTitlesWide.map((t, idx) => `${idx + 1}. ${t}`).join("\n") +
              `\n\nPick a story that is NOT about the same market, instrument, or catalyst as any of the above.`
            : "";
        const rejectDetail =
          lastRejectTitle && lastRejectSimilarTo
            ? `Your headline "${lastRejectTitle.slice(0, 100)}" was too similar to existing topic: "${lastRejectSimilarTo.slice(0, 120)}". `
            : "Your previous output was too similar to an existing ATFX topic. ";
        userMsgForLlm =
          userMessage +
          `\n\nCRITICAL (attempt ${attempt + 2}): ${rejectDetail}You MUST pick a **substantially different** story — different primary market, instrument, geography, catalyst, or mechanism. Do NOT just rephrase the same story. ` +
          (strictDedup
            ? `Use a different focus lane than before. Expand evidence to the last 30–60 days to find a clearly different catalyst. `
            : "") +
          `**Every claim MUST be grounded in your web search results.** Output ONLY valid JSON.` +
          retryExcludeLines;
      }

      if (!topicData) {
        progress.log("Couldn't produce a topic this time — please try again.");
        return res.status(409).json({ error: "Topic generation did not produce a result. Try again." });
      }

      const table = airtable(CAPITAL_KEYWORDS_TABLE_ID) as any;

      const buildAirtableFields = (t: any): Record<string, string> => {
        const keywords = Array.isArray(t.keywords) ? t.keywords : [];
        const stockCodes = Array.isArray(t.target_stock_codes) ? t.target_stock_codes : [];
        const fields: Record<string, string> = {
          Title: t.seo_title || "",
          summary: t.summary || "",
          Social_hook: t.social_media_hook || "",
          Keyword1: keywords[0] || "",
          Keyword2: keywords[1] || "",
          Keyword3: keywords[2] || "",
          psy_trigger: t.psychology_trigger || "",
          stockcode1: stockCodes[0] || "",
          stockcode2: stockCodes[1] || "",
          stockcode3: stockCodes[2] || "",
          Source:
            bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX
              ? atfxAudience === "institutional"
                ? "Institutional"
                : "Retail"
              : sourceCategory && typeof sourceCategory === "string"
                ? sourceCategory
                : "AI Generated",
          input:
            (autoInstitutional || autoRetail) && bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX
              ? String(t.seo_title || keywords[0] || "")
                  .trim()
              : atfxInputForAirtable,
          Approve: "Approved",
        };

        if (bodyCompany === PROPOSED_TOPICS_COMPANY_1UPTICK) {
          fields[proposedTopicsCompanyFieldName()] = PROPOSED_TOPICS_COMPANY_1UPTICK;
        } else if (bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX) {
          fields[proposedTopicsCompanyFieldName()] = PROPOSED_TOPICS_COMPANY_ATFX_AIRTABLE;
        }
        return fields;
      };

      const buildResponseItem = (record: any, fields: Record<string, string>) => {
        const createDateVal = record?.get?.("Create date");
        return {
          id: record?.id ?? "",
          source: fields.Source,
          title: fields.Title,
          summary: fields.summary,
          socialHook: fields.Social_hook,
          keyword1: fields.Keyword1,
          keyword2: fields.Keyword2,
          keyword3: fields.Keyword3,
          keywordTag: fields.Keyword_tag,
          psyTrigger: fields.psy_trigger,
          stockTag: fields.Stock_tag,
          createDate: createDateVal != null ? String(createDateVal) : new Date().toISOString(),
          status: "",
          approve: "Approved",
          custom: "",
          company:
            bodyCompany === PROPOSED_TOPICS_COMPANY_1UPTICK
              ? PROPOSED_TOPICS_COMPANY_1UPTICK
              : bodyCompany === PROPOSED_TOPICS_COMPANY_ATFX
                ? PROPOSED_TOPICS_COMPANY_ATFX_AIRTABLE
                : "",
        };
      };

      const itemsToCreate =
        capitalSeoGeneration && Array.isArray(parsedTopicsArray) && parsedTopicsArray.length > 0
          ? parsedTopicsArray.slice(0, 3)
          : [topicData];

      const createdItems: any[] = [];
      for (const t of itemsToCreate) {
        if (!t) continue;
        stripAtfxTopicJsonFields(t as Record<string, unknown>);
        if (capitalSeoGeneration) normalizeCapitalSeoTopicIdeas(t as Record<string, unknown>);
        const fields = buildAirtableFields(t);
        const created = await table.create(fields);
        createdItems.push(buildResponseItem(created, fields));
      }

      invalidateCapitalKeywordsListCaches();
      cache.invalidate(CACHE_KEYS.ATFX_PENDING);
      cache.invalidate(CACHE_KEYS.ATFX_APPROVED);
      cache.invalidate(CACHE_KEYS.ATFX_STATS);
      progress.log( `All set — topic saved${createdItems.length > 1 ? ` (${createdItems.length})` : ""}.`);

      if (createdItems.length === 1) {
        const payload: Record<string, unknown> = { ...createdItems[0] };
        if (dedupWarning) payload.dedupWarning = dedupWarning;
        res.setHeader("Content-Type", "application/json").json(payload);
      } else {
        res.setHeader("Content-Type", "application/json").json(createdItems);
      }
    } catch (err: any) {
      console.error("Generate SEO topic error:", err);
      progress?.log("Something went wrong — please try generating again.");
      res.status(500).json({ error: err?.message ?? "Failed to generate topic" });
    } finally {
      progress?.end();
    }
  });
}
