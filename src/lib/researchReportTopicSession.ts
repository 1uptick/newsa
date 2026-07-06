import type { CapitalKeywordItem } from "../pages/Capital/types";
import type { ChatMessage } from "../pages/ATFX/researchReportUtils";

export const FRESH_TOPICS_BATCH_EVENT = "fresh_topics_batch";

export type FreshTopicsToolEvent = {
  name: typeof FRESH_TOPICS_BATCH_EVENT;
  summary: string;
  topics: CapitalKeywordItem[];
};

export type ParsedFreshTopicsSession = {
  userRequest: string | null;
  topics: CapitalKeywordItem[];
  topicsMessageId: string | null;
};

const FRESH_TOPICS_USER_RE = /^Generate fresh topics\b/i;

export function isFreshTopicsUserMessage(content: string): boolean {
  return FRESH_TOPICS_USER_RE.test(content.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeTopic(value: unknown): CapitalKeywordItem | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (!id || !title) return null;
  const str = (key: keyof CapitalKeywordItem) =>
    typeof value[key] === "string" ? String(value[key]) : "";
  return {
    id,
    title,
    source: str("source"),
    summary: str("summary"),
    socialHook: str("socialHook"),
    keyword1: str("keyword1"),
    keyword2: str("keyword2"),
    keyword3: str("keyword3"),
    keywordTag: str("keywordTag"),
    psyTrigger: str("psyTrigger"),
    stockTag: str("stockTag"),
    createDate: str("createDate"),
    status: str("status"),
    approve: str("approve"),
    custom: str("custom"),
    company: str("company") || undefined,
  };
}

export function freshTopicsContent(topics: CapitalKeywordItem[]): string {
  const count = topics.length;
  if (count === 0) return "Fresh topics";
  if (count === 1) {
    const title = topics[0]?.title?.trim();
    return title ? `Fresh topic: ${title}` : "Fresh topic generated";
  }
  return `Fresh topics generated (${count})`;
}

export function freshTopicsHistoryTitle(topics: CapitalKeywordItem[]): string {
  const first = topics[0]?.title?.trim();
  if (!first) return "Fresh topics";
  if (topics.length === 1) return first.length > 120 ? `${first.slice(0, 117)}…` : first;
  const suffix = topics.length > 1 ? ` (+${topics.length - 1} more)` : "";
  const max = 120 - suffix.length;
  const clipped = first.length > max ? `${first.slice(0, Math.max(max - 1, 20))}…` : first;
  return `${clipped}${suffix}`;
}

export function buildFreshTopicsToolEvents(topics: CapitalKeywordItem[]): FreshTopicsToolEvent[] {
  return [
    {
      name: FRESH_TOPICS_BATCH_EVENT,
      summary: topics.length === 1 ? "1 topic" : `${topics.length} topics`,
      topics,
    },
  ];
}

export function parseFreshTopicsFromMessages(messages: ChatMessage[]): ParsedFreshTopicsSession {
  let userRequest: string | null = null;
  let topics: CapitalKeywordItem[] = [];
  let topicsMessageId: string | null = null;

  for (const message of messages) {
    if (message.role === "user" && FRESH_TOPICS_USER_RE.test(message.content.trim())) {
      userRequest = message.content.trim();
    }
    if (message.role !== "tool" || !Array.isArray(message.tool_events)) continue;
    for (const event of message.tool_events) {
      if (!isRecord(event) || event.name !== FRESH_TOPICS_BATCH_EVENT) continue;
      const eventTopics = (event as Record<string, unknown>).topics;
      const rawTopics = Array.isArray(eventTopics) ? eventTopics : [];
      const parsed = rawTopics
        .map(normalizeTopic)
        .filter((item): item is CapitalKeywordItem => item != null);
      if (parsed.length) {
        topics = parsed;
        topicsMessageId = message.id;
      }
    }
  }

  return { userRequest, topics, topicsMessageId };
}

export function mergeTopicPatch(
  item: CapitalKeywordItem,
  patch: Partial<CapitalKeywordItem>
): CapitalKeywordItem {
  return {
    ...item,
    ...patch,
    id: item.id,
    createDate: item.createDate,
    status: item.status,
    approve: item.approve,
    custom: patch.custom ?? item.custom,
    company: patch.company ?? item.company,
  };
}
