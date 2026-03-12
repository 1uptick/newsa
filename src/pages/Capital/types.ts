export interface CapitalKeywordItem {
  id: string;
  source: string;
  title: string;
  summary: string;
  socialHook: string;
  keyword1: string;
  keyword2: string;
  keyword3: string;
  keywordTag: string;
  psyTrigger: string;
  stockTag: string;
  createDate: string;
  status: string;
  approve: string;
  custom: string;
}

export function formatCreateDate(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? trimmed : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return trimmed;
  }
}
