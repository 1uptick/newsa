/**
 * LLM pricing for brokerage token cost calculation (aligned with 1uptick token system).
 * Prices are USD per 1M tokens.
 */

export type LLMProvider = "requesty" | "openrouter" | "openai" | "anthropic" | "google" | "perplexity";

export function normalizeBillingProvider(provider: LLMProvider): LLMProvider {
  return provider === "openrouter" ? "requesty" : provider;
}

export interface ModelPricing {
  promptPer1M: number;
  completionPer1M: number;
  displayName: string;
  category: "fast" | "standard" | "premium";
}

export interface ProviderConfig {
  displayName: string;
  models: Record<string, ModelPricing>;
}

const REQUESTY_MODEL_PRICING: Record<string, ModelPricing> = {
  "google/gemini-3-pro-preview": { promptPer1M: 2.0, completionPer1M: 12.0, displayName: "Gemini 3.0 Pro Preview", category: "premium" },
  "google/gemini-3-flash-preview": { promptPer1M: 0.5, completionPer1M: 3.0, displayName: "Gemini 3.0 Flash Preview", category: "fast" },
  "google/gemini-2.5-pro": { promptPer1M: 1.25, completionPer1M: 10.0, displayName: "Gemini 2.5 Pro", category: "premium" },
  "google/gemini-2.5-flash": { promptPer1M: 0.3, completionPer1M: 2.5, displayName: "Gemini 2.5 Flash", category: "fast" },
  "google/gemini-2.0-flash-001": { promptPer1M: 0.1, completionPer1M: 0.4, displayName: "Gemini 2.0 Flash", category: "fast" },
  "anthropic/claude-opus-4-7": { promptPer1M: 5.0, completionPer1M: 25.0, displayName: "Claude Opus 4.7", category: "premium" },
  "anthropic/claude-sonnet-4-6": { promptPer1M: 3.0, completionPer1M: 15.0, displayName: "Claude Sonnet 4.6", category: "standard" },
  "anthropic/claude-sonnet-4-5": { promptPer1M: 3.0, completionPer1M: 15.0, displayName: "Claude Sonnet 4.5", category: "standard" },
  "anthropic/claude-sonnet-4": { promptPer1M: 3.0, completionPer1M: 15.0, displayName: "Claude Sonnet 4", category: "standard" },
  "anthropic/claude-3.5-sonnet": { promptPer1M: 3.0, completionPer1M: 15.0, displayName: "Claude 3.5 Sonnet", category: "standard" },
  "anthropic/claude-haiku-4-5": { promptPer1M: 1.0, completionPer1M: 5.0, displayName: "Claude Haiku 4.5", category: "fast" },
  "openai/gpt-4o": { promptPer1M: 2.5, completionPer1M: 10.0, displayName: "GPT-4o", category: "standard" },
  "openai/gpt-4o-mini": { promptPer1M: 0.15, completionPer1M: 0.6, displayName: "GPT-4o Mini", category: "fast" },
  "openai/gpt-4.1-mini": { promptPer1M: 0.15, completionPer1M: 0.6, displayName: "GPT-4.1 Mini", category: "fast" },
};

export const LLM_PRICING: Record<LLMProvider, ProviderConfig> = {
  requesty: { displayName: "Requesty", models: REQUESTY_MODEL_PRICING },
  openrouter: { displayName: "Requesty", models: REQUESTY_MODEL_PRICING },
  openai: {
    displayName: "OpenAI (Direct)",
    models: {
      "gpt-4o": { promptPer1M: 2.5, completionPer1M: 10.0, displayName: "GPT-4o", category: "standard" },
      "gpt-4o-mini": { promptPer1M: 0.15, completionPer1M: 0.6, displayName: "GPT-4o Mini", category: "fast" },
    },
  },
  anthropic: {
    displayName: "Anthropic (Direct)",
    models: {
      "claude-3-5-sonnet-20241022": { promptPer1M: 3.0, completionPer1M: 15.0, displayName: "Claude 3.5 Sonnet", category: "standard" },
    },
  },
  google: {
    displayName: "Google AI (Direct)",
    models: {
      "gemini-1.5-flash": { promptPer1M: 0.075, completionPer1M: 0.3, displayName: "Gemini 1.5 Flash", category: "fast" },
    },
  },
  perplexity: {
    displayName: "Perplexity",
    models: {
      "sonar-pro": { promptPer1M: 3.0, completionPer1M: 15.0, displayName: "Sonar Pro", category: "standard" },
      sonar: { promptPer1M: 1.0, completionPer1M: 1.0, displayName: "Sonar", category: "fast" },
    },
  },
};

export type PerplexitySearchContextSize = "low" | "medium" | "high";

const PERPLEXITY_REQUEST_FEE_PER_1K: Record<string, Record<PerplexitySearchContextSize, number>> = {
  "sonar-pro": { low: 6.0, medium: 10.0, high: 14.0 },
  sonar: { low: 5.0, medium: 8.0, high: 12.0 },
};

export interface PerplexityCostOptions {
  model?: string;
  requestCount?: number;
  searchContextSize?: PerplexitySearchContextSize;
}

function normalizePerplexityModelId(model?: string): "sonar" | "sonar-pro" {
  const m = (model ?? "").trim().toLowerCase();
  if (m.includes("sonar-pro")) return "sonar-pro";
  if (m.startsWith("sonar")) return "sonar";
  return "sonar-pro";
}

export function calculatePerplexityCost(
  promptTokens: number,
  completionTokens: number,
  reasoningTokens?: number,
  options?: PerplexityCostOptions
): number {
  const modelId = normalizePerplexityModelId(options?.model);
  const ctx = options?.searchContextSize ?? "low";
  const requests = Math.max(0, options?.requestCount ?? 1);
  const pricing = LLM_PRICING.perplexity.models[modelId];
  const outputTokens = completionTokens + (reasoningTokens ?? 0);
  const tokenCost =
    (promptTokens / 1_000_000) * pricing.promptPer1M + (outputTokens / 1_000_000) * pricing.completionPer1M;
  const requestCost = (requests / 1_000) * PERPLEXITY_REQUEST_FEE_PER_1K[modelId][ctx];
  return tokenCost + requestCost;
}

export function normalizeModelForPricing(model: string): string {
  const raw = model.trim();
  if (!raw) return raw;
  let m = raw.replace(/-(\d{8})$/, "");
  if (!m.includes("/")) {
    if (/^claude-/i.test(m)) return `anthropic/${m}`;
    if (/^(gpt-|o\d|text-embedding)/i.test(m)) return `openai/${m}`;
    if (/^gemini-/i.test(m)) return `google/${m}`;
  }
  return m;
}

function modelIdCore(id: string): string {
  return id.replace(/^[^/]+\//, "").toLowerCase();
}

function resolveModelPricingKey(models: Record<string, ModelPricing>, model: string): string | undefined {
  const normalized = normalizeModelForPricing(model);
  if (models[normalized]) return normalized;
  if (models[model]) return model;
  const normCore = modelIdCore(normalized);
  return Object.keys(models).find((key) => {
    const keyCore = modelIdCore(key);
    return normCore === keyCore || normalized.includes(key) || key.includes(normalized);
  });
}

export function calculateTokenCost(
  provider: LLMProvider,
  model: string,
  promptTokens: number,
  completionTokens: number,
  reasoningTokens?: number,
  perplexityOptions?: PerplexityCostOptions
): number {
  if (provider === "perplexity") {
    return calculatePerplexityCost(promptTokens, completionTokens, reasoningTokens, { model, ...perplexityOptions });
  }
  const outputTokens = completionTokens + (reasoningTokens ?? 0);
  const providerConfig = LLM_PRICING[normalizeBillingProvider(provider)];
  if (!providerConfig) return 0;
  const pricingKey = resolveModelPricingKey(providerConfig.models, normalizeModelForPricing(model));
  const modelPricing = pricingKey ? providerConfig.models[pricingKey] : undefined;
  if (!modelPricing) return 0;
  return (
    (promptTokens / 1_000_000) * modelPricing.promptPer1M + (outputTokens / 1_000_000) * modelPricing.completionPer1M
  );
}

export function getModelDisplayName(provider: LLMProvider, model: string): string {
  const providerConfig = LLM_PRICING[normalizeBillingProvider(provider)];
  if (!providerConfig) return model;
  const pricingKey = resolveModelPricingKey(providerConfig.models, model);
  if (pricingKey) return providerConfig.models[pricingKey].displayName;
  return model;
}

export function formatMicroCost(cost: number): string {
  const n = Number(cost);
  if (!Number.isFinite(n) || n <= 0) return "$0.0000";
  if (n < 0.000001) return `$${n.toFixed(8)}`;
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}
