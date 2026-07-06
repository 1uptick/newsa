import { randomUUID } from "node:crypto";

export type TopicPanelProgressEntry = {
  id: string;
  ts: string;
  message: string;
};

type SessionState = {
  active: boolean;
  entries: TopicPanelProgressEntry[];
};

const MAX_ENTRIES = 80;
const sessions = new Map<string, SessionState>();

export function beginTopicPanelProgress(sessionId: string): void {
  if (!sessionId) return;
  sessions.set(sessionId, { active: true, entries: [] });
}

export function appendTopicPanelProgress(sessionId: string, message: string): void {
  if (!sessionId) return;
  const text = message.trim().slice(0, 500);
  if (!text) return;
  let state = sessions.get(sessionId);
  if (!state) {
    state = { active: true, entries: [] };
    sessions.set(sessionId, state);
  }
  state.entries.unshift({
    id: randomUUID(),
    ts: new Date().toISOString(),
    message: text,
  });
  if (state.entries.length > MAX_ENTRIES) state.entries.length = MAX_ENTRIES;
}

export function endTopicPanelProgress(sessionId: string): void {
  if (!sessionId) return;
  const state = sessions.get(sessionId);
  if (state) state.active = false;
  setTimeout(() => sessions.delete(sessionId), 15 * 60 * 1000);
}

export function getTopicPanelProgressSnapshot(sessionId: string): {
  active: boolean;
  entries: TopicPanelProgressEntry[];
} {
  if (!sessionId) return { active: false, entries: [] };
  const state = sessions.get(sessionId);
  return { active: state?.active ?? false, entries: state?.entries ?? [] };
}
