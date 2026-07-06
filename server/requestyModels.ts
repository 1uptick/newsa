/** Requesty model id helpers — router expects `provider/model` slugs; availability changes over time. */

/** Plan phase: GPT-4.1 mini first, then other brands (Google, Anthropic) if OpenAI/Azure is down. */
export const DEFAULT_PLAN_MODEL = "openai/gpt-4.1-mini";

export const PLAN_MODEL_FALLBACKS: readonly string[] = [
  DEFAULT_PLAN_MODEL,
  "google/gemini-2.5-flash",
  "anthropic/claude-haiku-4-5",
  "azure/openai-responses/gpt-4.1-mini@westus3",
  "openai/gpt-4o-mini",
  "google/gemini-2.0-flash-001",
  "anthropic/claude-3.5-sonnet",
];

/** Research phase: live web search first, then fast Google flash. */
export const DEFAULT_RESEARCH_MODEL = "perplexity/sonar-pro";

export const RESEARCH_MODEL_FALLBACKS: readonly string[] = [
  DEFAULT_RESEARCH_MODEL,
  "google/gemini-2.5-flash",
  "google/gemini-2.0-flash-001",
];

/** Write phase: Sonnet 4.6 first, then OpenAI / Google / Bedrock so a single vendor outage does not block reports. */
export const DEFAULT_WRITER_MODEL = "anthropic/claude-sonnet-4-6";

export const WRITER_MODEL_FALLBACKS: readonly string[] = [
  DEFAULT_WRITER_MODEL,
  "openai/gpt-4o",
  "anthropic/claude-sonnet-4-5",
  "google/gemini-2.5-pro",
  "bedrock/claude-sonnet-4-6@us-east-1",
  "openai/gpt-4.1-mini",
  "google/gemini-2.5-flash",
  "anthropic/claude-sonnet-4-5-20250514",
  "openai/gpt-4o-mini",
];

/** @deprecated Use DEFAULT_WRITER_MODEL */
export const DEFAULT_SONNET_WRITER_MODEL = DEFAULT_WRITER_MODEL;

/** @deprecated Use WRITER_MODEL_FALLBACKS */
export const SONNET_WRITER_MODEL_FALLBACKS = WRITER_MODEL_FALLBACKS;

/** Ensure env overrides use Requesty's `provider/model` format. */
export function normalizeRequestyModelId(model: string): string {
  const t = model.trim();
  if (!t || t.includes("/")) return t;
  if (/^claude[-_]/i.test(t)) return `anthropic/${t}`;
  if (/^(gpt-|o[134]-)/i.test(t)) return `openai/${t}`;
  if (/^gemini[-_]/i.test(t)) return `google/${t}`;
  if (/^sonar/i.test(t)) return `perplexity/${t}`;
  return t;
}

export function isPerplexityResearchModel(model: string): boolean {
  const m = normalizeRequestyModelId(model).toLowerCase();
  return m.startsWith("perplexity/") || m.includes("sonar");
}

export function isUnsupportedRequestyModelError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /\(\s*404\s*\)/.test(msg) ||
    /\b404\b/.test(msg) ||
    /not supported/i.test(msg) ||
    /"origin"\s*:\s*"provider"/i.test(msg) ||
    /provider.*model/i.test(msg) ||
    /model not found/i.test(msg)
  );
}

/** Retry next model in chain on 404/unsupported model or transient provider/network failures. */
export function isRequestyProviderFailoverError(err: unknown): boolean {
  if (isUnsupportedRequestyModelError(err)) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /\(\s*429\s*\)/.test(msg) ||
    /\(\s*502\s*\)/.test(msg) ||
    /\(\s*503\s*\)/.test(msg) ||
    /\(\s*504\s*\)/.test(msg) ||
    /timed out/i.test(msg) ||
    /fetch failed/i.test(msg) ||
    /ECONNRESET/i.test(msg) ||
    /network/i.test(msg)
  );
}

export function uniqModelChain(models: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of models) {
    const t = normalizeRequestyModelId(m);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function buildPlanModelChain(primary?: string): string[] {
  const p = primary?.trim();
  return uniqModelChain([...(p ? [p] : []), ...PLAN_MODEL_FALLBACKS]);
}

export function buildResearchModelChain(primary?: string): string[] {
  const p = primary?.trim();
  return uniqModelChain([...(p ? [p] : []), ...RESEARCH_MODEL_FALLBACKS]);
}

export function buildWriterModelChain(primary?: string): string[] {
  const p = primary?.trim();
  return uniqModelChain([...(p ? [p] : []), ...WRITER_MODEL_FALLBACKS]);
}

/** @deprecated Use buildWriterModelChain */
export function buildSonnetWriterModelChain(primary?: string): string[] {
  return buildWriterModelChain(primary);
}
