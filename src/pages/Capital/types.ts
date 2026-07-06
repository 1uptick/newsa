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
  /** Airtable Proposed topics `company` (e.g. "1uptick"). */
  company?: string;
}

/** Dashboard list item (capital dashboard table) */
export interface DashboardItem {
  id: string;
  createDate: string;
  title: string;
  calculation: string;
  category?: string;
  /** Per-user: show "New" in Ready to Post until the user opens the preview (Apr 2026+ items only). */
  isNew?: boolean;
  /** ISO timestamp when notify emails were sent; UI shows a badge for 72 hours. */
  notifySentAt?: string | null;
}

/** Pending approval item (capital keywords table) */
export interface PendingItem {
  id: string;
  createDate: string;
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
  custom: string;
}

export { formatCreateDate } from "../../lib/date";
