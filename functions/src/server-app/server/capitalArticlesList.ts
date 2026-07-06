import { config } from "./config.js";

/** Airtable: non-empty Content gen (same intent as `{Content gen} != ""`). */
export const CAPITAL_ARTICLES_LIST_FILTER = "NOT({Content gen} = '')";

const CONTENT_GEN_FIELD_CANDIDATES = ["Content gen", "Content Gen", "content gen", "Content_gen"] as const;

/** True if any known Content gen field on the record has non-empty text (matches notify-articles field detection). */
export function capitalRecordHasContentGen(record: any): boolean {
  for (const name of CONTENT_GEN_FIELD_CANDIDATES) {
    let v: unknown;
    try {
      v = record.get(name);
    } catch {
      continue;
    }
    if (v == null || v === "") continue;
    if (typeof v === "string") {
      if (v.trim().length > 0) return true;
      continue;
    }
    if (Array.isArray(v) && v.length > 0) return true;
    const s = String(v).trim();
    if (s.length > 0) return true;
  }
  return false;
}

/**
 * Records shown on the Capital Articles page (`GET /api/capital`): Content gen filter + JS field check.
 * Used by Ready to Post so the dashboard lists the same articles as the articles page (before client search).
 */
export async function fetchCapitalArticlesListRecords(airtable: any): Promise<any[]> {
  if (!airtable) return [];
  const capitalTableId = config.airtable.capitalTableId || "tblNqlepjy0uCP9CU";
  const rawRecords = await airtable(capitalTableId)
    .select({ maxRecords: 200, filterByFormula: CAPITAL_ARTICLES_LIST_FILTER })
    .firstPage();
  return (rawRecords as any[]).filter((record: any) => capitalRecordHasContentGen(record));
}
