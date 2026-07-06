import { config } from "./config.js";

import {
  buildPlanModelChain,
  buildResearchModelChain,
  buildWriterModelChain,
  isRequestyProviderFailoverError,
  uniqModelChain,
} from "./requestyModels.js";

import {

  captureLlmUsage,

  getBrokerageUsageContext,

  parseOpenAiChatUsage,

  type BrokerageTokenSource,

  type ParsedLlmUsage,

} from "./brokerageTokenBilling.js";



const PLAN_TIMEOUT_MS = 90_000;

const TRANSLATE_TIMEOUT_MS = 180_000;

const STREAM_TIMEOUT_MS = 300_000;



export type CallRequestyChatOptions = {

  temperature?: number;

  max_tokens?: number;

  timeoutMs?: number;

  /** Retries after timeout or 429/5xx. */

  retries?: number;

  /** When set, LLM usage is recorded for brokerage token billing. */

  tokenUsage?: {

    source: BrokerageTokenSource;

    firebaseUid?: string;

    chargeId?: string;

    symbol?: string;

    referenceId?: string;

  };

};



async function fetchWithTimeout(

  url: string,

  init: RequestInit,

  label: string,

  timeoutMs: number

): Promise<Response> {

  const ctrl = new AbortController();

  const tid = setTimeout(() => ctrl.abort(), timeoutMs);

  try {

    return await fetch(url, { ...init, signal: ctrl.signal });

  } catch (e) {

    if ((e as Error)?.name === "AbortError") {

      throw new Error(`${label} timed out after ${timeoutMs / 1000}s`);

    }

    throw e;

  } finally {

    clearTimeout(tid);

  }

}



function messageText(message: { content?: unknown } | undefined): string {

  const c = message?.content;

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



function isRetryableRequestyError(err: unknown, status?: number): boolean {

  if (typeof status === "number" && [429, 500, 502, 503, 504].includes(status)) return true;

  const msg = err instanceof Error ? err.message : String(err);

  return msg.includes("timed out") || msg.includes("fetch failed") || msg.includes("network");

}



function estimateLlmUsageFromText(

  model: string,

  messages: Array<{ role: string; content: string }>,

  output: string

): ParsedLlmUsage {

  const promptChars = messages.reduce((sum, message) => sum + message.content.length, 0);

  const promptTokens = Math.max(1, Math.ceil(promptChars / 4));

  const completionTokens = Math.max(1, Math.ceil(output.length / 4));

  return {

    provider: "requesty",

    model,

    promptTokens,

    completionTokens,

    totalTokens: promptTokens + completionTokens,

  };

}



function recordRequestyChatUsage(

  json: unknown,

  model: string,

  messages: Array<{ role: string; content: string }>,

  output: string,

  usageMeta: NonNullable<CallRequestyChatOptions["tokenUsage"]>

): void {

  const usage = parseOpenAiChatUsage(json, "requesty", model);

  captureLlmUsage(usage ?? estimateLlmUsageFromText(model, messages, output), usageMeta);

}



export function extractFirstJsonObject(raw: string): string | null {

  if (!raw) return null;

  const match = raw.match(/\{[\s\S]*\}/);

  return match ? match[0] : null;

}



export async function callRequestyChat(

  model: string,

  messages: Array<{ role: string; content: string }>,

  options: CallRequestyChatOptions = {}

): Promise<string> {

  const apiKey = config.requesty.apiKey;

  if (!apiKey) throw new Error("REQUESTY_API_KEY is not configured.");



  const timeoutMs = options.timeoutMs ?? PLAN_TIMEOUT_MS;

  const retries = options.retries ?? 0;

  const label = `Requesty ${model}`;



  const body: Record<string, unknown> = {

    model,

    messages,

    temperature: options.temperature ?? 0.3,

  };

  if (options.max_tokens) body.max_tokens = options.max_tokens;



  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {

    try {

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

        label,

        timeoutMs

      );



      const raw = await res.text();

      if (!res.ok) {

        const err = new Error(`LLM failed (${res.status}): ${raw.slice(0, 300)}`);

        if (attempt < retries && isRetryableRequestyError(err, res.status)) {

          console.warn(`[${label}] HTTP ${res.status} attempt ${attempt + 1}/${retries + 1}, retrying…`);

          lastError = err;

          continue;

        }

        throw err;

      }



      const json = JSON.parse(raw) as { choices?: Array<{ message?: { content?: unknown } }> };

      const text = messageText(json?.choices?.[0]?.message);

      if (!text.trim()) throw new Error("LLM returned empty content.");

      const usageMeta = options.tokenUsage ?? getBrokerageUsageContext();

      if (usageMeta) {

        recordRequestyChatUsage(json, model, messages, text, usageMeta);

      }

      return text;

    } catch (e) {

      lastError = e instanceof Error ? e : new Error(String(e));

      if (attempt < retries && isRetryableRequestyError(lastError)) {

        console.warn(`[${label}] ${lastError.message} attempt ${attempt + 1}/${retries + 1}, retrying…`);

        continue;

      }

      throw lastError;

    }

  }



  throw lastError ?? new Error(`${label} failed`);

}



export { PLAN_TIMEOUT_MS, TRANSLATE_TIMEOUT_MS };



export async function callRequestyChatWithModelChain(

  models: string[],

  messages: Array<{ role: string; content: string }>,

  options: CallRequestyChatOptions = {}

): Promise<string> {

  const chain = uniqModelChain(models);

  if (chain.length === 0) throw new Error("No LLM models configured for this request.");

  let lastErr: unknown;

  for (let i = 0; i < chain.length; i++) {

    const model = chain[i];

    try {

      return await callRequestyChat(model, messages, options);

    } catch (e) {

      lastErr = e;

      if (!isRequestyProviderFailoverError(e) || i === chain.length - 1) throw e;

      console.warn(

        `[requesty-chat] model ${model} failed, trying fallback…`,

        e instanceof Error ? e.message : e

      );

    }

  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));

}



export async function streamRequestyChat(

  model: string,

  messages: Array<{ role: string; content: string }>,

  onDelta: (piece: string) => void,

  options: {

    temperature?: number;

    max_tokens?: number;

    tokenUsage?: CallRequestyChatOptions["tokenUsage"];

  } = {}

): Promise<string> {

  const apiKey = config.requesty.apiKey;

  if (!apiKey) throw new Error("REQUESTY_API_KEY is not configured.");



  const body: Record<string, unknown> = {

    model,

    messages,

    stream: true,

    stream_options: { include_usage: true },

    temperature: options.temperature ?? 0.4,

  };

  if (options.max_tokens) body.max_tokens = options.max_tokens;



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

    `Requesty stream ${model}`,

    STREAM_TIMEOUT_MS

  );



  if (!res.ok) {

    const raw = await res.text();

    throw new Error(`LLM stream failed (${res.status}): ${raw.slice(0, 300)}`);

  }



  const reader = res.body?.getReader();

  if (!reader) throw new Error("Stream returned no body");



  const decoder = new TextDecoder();

  let buffer = "";

  let accumulated = "";

  let usageCaptured = false;

  const usageMeta = options.tokenUsage ?? getBrokerageUsageContext();



  while (true) {

    const { value, done } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");



    let lineEnd: number;

    while ((lineEnd = buffer.indexOf("\n")) !== -1) {

      const line = buffer.slice(0, lineEnd).trim();

      buffer = buffer.slice(lineEnd + 1);

      if (!line.startsWith("data:")) continue;

      const payload = line.slice(5).trim();

      if (!payload || payload === "[DONE]") continue;

      try {

        const json = JSON.parse(payload) as {

          choices?: Array<{ delta?: { content?: string } }>;

          usage?: Record<string, number>;

        };

        const piece = json?.choices?.[0]?.delta?.content;

        if (typeof piece === "string" && piece.length > 0) {

          accumulated += piece;

          onDelta(piece);

        }

        if (usageMeta && json.usage) {

          const usage = parseOpenAiChatUsage(json, "requesty", model);

          if (usage) {

            captureLlmUsage(usage, usageMeta);

            usageCaptured = true;

          }

        }

      } catch {

        /* skip */

      }

    }

  }



  if (usageMeta && !usageCaptured && accumulated.trim()) {

    captureLlmUsage(estimateLlmUsageFromText(model, messages, accumulated), usageMeta);

  }



  return accumulated;

}



export async function streamRequestyChatWithModelChain(

  models: string[],

  messages: Array<{ role: string; content: string }>,

  onDelta: (piece: string) => void,

  options: {

    temperature?: number;

    max_tokens?: number;

    tokenUsage?: CallRequestyChatOptions["tokenUsage"];

  } = {}

): Promise<string> {

  const chain = uniqModelChain(models);

  if (chain.length === 0) throw new Error("No LLM models configured for this request.");

  let lastErr: unknown;

  for (let i = 0; i < chain.length; i++) {

    const model = chain[i];

    try {

      return await streamRequestyChat(model, messages, onDelta, options);

    } catch (e) {

      lastErr = e;

      if (!isRequestyProviderFailoverError(e) || i === chain.length - 1) throw e;

      console.warn(

        `[requesty-stream] model ${model} failed, trying fallback…`,

        e instanceof Error ? e.message : e

      );

    }

  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));

}



/** Plan phase model chain from config (GPT-4.1 mini + Azure routes). */

export function planModelChain(primary?: string): string[] {

  return buildPlanModelChain(primary);

}



/** Research phase model chain (sonar-pro + Google flash). */

export function researchModelChain(primary?: string): string[] {

  return buildResearchModelChain(primary);

}



/** Write phase model chain (Sonnet 4.6 / 4.5 + Bedrock routes). */

export function writerModelChain(primary?: string): string[] {

  return buildWriterModelChain(primary);

}


