/**
 * Perplexity / Requesty web research tool for ATFX Research Report agent.
 */

import { config } from "./config.js";
import { captureLlmUsage, getBrokerageUsageContext, parseOpenAiChatUsage } from "./brokerageTokenBilling.js";
import { buildResearchUserPrompt } from "./atfxResearchPrompts.js";
import { isRequestyProviderFailoverError, isPerplexityResearchModel } from "./requestyModels.js";
import { researchModelChain } from "./atfxResearchRequesty.js";
import type { ReportOutputOptions } from "./atfxResearchReportOptions.js";

const FETCH_TIMEOUT_MS = 90_000;

function normalizeRecency(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "day" || s === "hour") return "day";
  if (s === "month") return "month";
  return "week";
}

async function fetchWithTimeout(url: string, init: RequestInit, label: string): Promise<Response> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      throw new Error(`${label} timed out after ${FETCH_TIMEOUT_MS / 1000}s`);
    }
    throw e;
  } finally {
    clearTimeout(tid);
  }
}

function extractMessageText(json: { choices?: Array<{ message?: { content?: unknown } }> }): string {
  const c = json?.choices?.[0]?.message?.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((part: unknown) => {
        if (part && typeof part === "object" && "text" in part && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

function recordNewsLlmUsage(json: unknown, endpoint: "requesty" | "perplexity", model: string): void {
  const ctx = getBrokerageUsageContext();
  if (!ctx) return;
  const usage = parseOpenAiChatUsage(json, endpoint, model);
  if (usage) {
    captureLlmUsage(usage, {
      ...ctx,
      source: ctx.source ?? "research_report",
      perplexityRequestCount: endpoint === "perplexity" ? 1 : undefined,
    });
  }
}

async function callPerplexityDirect(userPrompt: string, recency: string): Promise<string> {
  const apiKey = config.perplexity.apiKey?.trim();
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY is not configured.");

  const body: Record<string, unknown> = {
    model: "sonar-pro",
    messages: [{ role: "user", content: userPrompt }],
    temperature: 0,
    search_recency_filter: recency,
  };

  const res = await fetchWithTimeout(
    config.perplexity.chatCompletionsUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    },
    "Perplexity news research"
  );

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Perplexity error (${res.status}): ${raw.slice(0, 300)}`);
  }

  const json = JSON.parse(raw) as { choices?: Array<{ message?: { content?: unknown } }> };
  recordNewsLlmUsage(json, "perplexity", "sonar-pro");
  const text = extractMessageText(json);
  if (!text.trim()) throw new Error("Perplexity returned an empty reply.");
  return text;
}

async function callRequestyResearchModel(
  model: string,
  userPrompt: string,
  recency: string
): Promise<string> {
  const apiKey = config.requesty.apiKey?.trim();
  if (!apiKey) throw new Error("REQUESTY_API_KEY is not configured.");

  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: userPrompt }],
    temperature: 0,
  };
  if (isPerplexityResearchModel(model)) {
    body.web_search_options = { search_recency_filter: recency };
  }

  const res = await fetchWithTimeout(
    config.requesty.chatCompletionsUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": config.appBaseUrl,
        "X-Title": "ATFX Research Report",
      },
      body: JSON.stringify(body),
    },
    `Requesty research ${model}`
  );

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Requesty error (${res.status}): ${raw.slice(0, 300)}`);
  }

  const json = JSON.parse(raw) as { choices?: Array<{ message?: { content?: unknown } }> };
  recordNewsLlmUsage(json, "requesty", model);
  const text = extractMessageText(json);
  if (!text.trim()) throw new Error("Requesty returned an empty reply.");
  return text;
}

async function callRequestyResearchChain(userPrompt: string, recency: string): Promise<string> {
  const chain = researchModelChain(config.requesty.atfxResearchResearchModel);
  let lastErr: unknown;
  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    try {
      return await callRequestyResearchModel(model, userPrompt, recency);
    } catch (e) {
      lastErr = e;
      if (!isRequestyProviderFailoverError(e) || i === chain.length - 1) throw e;
      console.warn(
        `[atfx-research] research model ${model} failed, trying fallback…`,
        e instanceof Error ? e.message : e
      );
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function resolveResearchOptions(args: Record<string, unknown>): ReportOutputOptions {
  return {
    style: "auto",
    audience: args.audience === "retail" ? "retail" : "institutional",
    pace: args.pace === "quick" || args.pace === "deep" ? args.pace : "standard",
    length: args.length === "2000" ? "2000" : "800",
    horizon: args.horizon === "1m" || args.horizon === "6m" || args.horizon === "12m" ? args.horizon : "3m",
    languages: ["en"],
  };
}

export async function runGetMarketNewsResearch(args: Record<string, unknown>): Promise<string> {
  const query = typeof args.query === "string" ? args.query.trim() : "";
  if (!query) return "Error: query is required for get_market_news_research.";
  const symbols = typeof args.symbols === "string" ? args.symbols.trim() : "";
  const contentPlan = typeof args.content_plan === "string" ? args.content_plan.trim() : "";
  const recency = normalizeRecency(args.recency);
  const today =
    typeof args.asOfDate === "string" && args.asOfDate.trim()
      ? args.asOfDate.trim()
      : new Date().toISOString().slice(0, 10);
  const options = resolveResearchOptions(args);
  const userPrompt = buildResearchUserPrompt({
    query,
    contentPlanText: contentPlan,
    symbols,
    today,
    options,
  });

  try {
    return await callRequestyResearchChain(userPrompt, recency);
  } catch (e1) {
    console.warn("[atfx-research] Requesty research chain failed:", e1);
    try {
      return await callPerplexityDirect(userPrompt, recency);
    } catch (e2) {
      console.warn("[atfx-research] Perplexity direct news failed:", e2);
      return `Market news research failed: ${(e2 as Error).message}`;
    }
  }
}

export const ATFX_RESEARCH_NEWS_TOOL_DEFINITION = {
  type: "function" as const,
  function: {
    name: "get_market_news_research",
    description:
      "Stage 2 (RESEARCH): fetch live news and catalysts via web search, aligned to the planner EDITORIAL BLUEPRINT content_plan. " +
      "Use for breaking news, macro drivers, and facts that fill section_briefs.key_points.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Research question aligned to content_thesis and section_briefs",
        },
        content_plan: {
          type: "string",
          description: "EDITORIAL BLUEPRINT text from stage 1 (section briefs + thesis)",
        },
        symbols: {
          type: "string",
          description: "Optional comma-separated tickers e.g. XAUUSD, DXY",
        },
        recency: {
          type: "string",
          description: "Search recency: day, week (default), or month",
          enum: ["day", "week", "month"],
        },
        asOfDate: {
          type: "string",
          description: "UTC date YYYY-MM-DD for recency context",
        },
        audience: { type: "string", enum: ["institutional", "retail"] },
        pace: { type: "string", enum: ["quick", "standard", "deep"] },
        length: { type: "string", enum: ["800", "2000"] },
        horizon: { type: "string", enum: ["1m", "3m", "6m", "12m"] },
      },
      required: ["query"],
    },
  },
};
