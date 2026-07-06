import { randomUUID } from "node:crypto";

export type UserActivityEntry = {
  id: string;
  ts: string;
  message: string;
};

const MAX_ENTRIES = 200;
const logs = new Map<string, UserActivityEntry[]>();
const activeJobs = new Map<string, number>();

export function appendUserActivity(uid: string | undefined | null, message: string): void {
  if (!uid || typeof uid !== "string") return;
  const text = message.trim().slice(0, 500);
  if (!text) return;
  let arr = logs.get(uid);
  if (!arr) {
    arr = [];
    logs.set(uid, arr);
  }
  arr.unshift({
    id: randomUUID(),
    ts: new Date().toISOString(),
    message: text,
  });
  if (arr.length > MAX_ENTRIES) arr.length = MAX_ENTRIES;
}

export function beginBackgroundJob(uid: string | undefined | null): void {
  if (!uid) return;
  activeJobs.set(uid, (activeJobs.get(uid) || 0) + 1);
}

export function endBackgroundJob(uid: string | undefined | null): void {
  if (!uid) return;
  const n = (activeJobs.get(uid) || 0) - 1;
  if (n <= 0) activeJobs.delete(uid);
  else activeJobs.set(uid, n);
}

export function getUserActivitySnapshot(uid: string | undefined | null): {
  latest: string | null;
  latestAt: string | null;
  activeJobs: number;
  entries: UserActivityEntry[];
} {
  if (!uid) {
    return { latest: null, latestAt: null, activeJobs: 0, entries: [] };
  }
  const entries = logs.get(uid) ?? [];
  return {
    latest: entries[0]?.message ?? null,
    latestAt: entries[0]?.ts ?? null,
    activeJobs: activeJobs.get(uid) || 0,
    entries,
  };
}
