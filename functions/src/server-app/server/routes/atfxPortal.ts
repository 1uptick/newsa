import express from "express";
import { cache, CACHE_KEYS, CACHE_TTL } from "../cache.js";
import { config } from "../config.js";
import { authenticateToken } from "../auth.js";
import { BROKERAGE_ATFX, getAtfxDashboardBillingStats } from "../brokerageTokenBilling.js";
import {
  withCompanyAtfxFilter,
  proposedTopicsCompanyFieldName,
  PROPOSED_TOPICS_COMPANY_ATFX,
  PROPOSED_TOPICS_COMPANY_ATFX_AIRTABLE,
} from "../capitalKeywords.js";

type RegisterAtfxPortalRoutesDeps = {
  airtable: any | null;
  capitalKeywordsTableId: string;
};

function atfxAirtableTableId(): string | null {
  const id = config.airtable.atfxTableId?.trim();
  return id || null;
}

/** Paginate all matching rows (Airtable caps ~100 per page). Omit `fields` so we never hit UNKNOWN_FIELD_NAME. */
function airtableCountAll(airtable: (id: string) => any, tableId: string, filterByFormula: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let n = 0;
    airtable(tableId)
      .select({ filterByFormula, pageSize: 100 })
      .eachPage(
        (records: any[], fetchNextPage: () => void) => {
          n += records.length;
          fetchNextPage();
        },
        (err: Error | null | undefined) => {
          if (err != null) reject(err);
          else resolve(n);
        }
      );
  });
}

/** All rows in the generated-articles table (see `AIRTABLE_ATFX_GENERATED_ARTICLE_TABLE_ID`), bucketed by category field (pie). */
function airtableCategoryPieWholeTable(
  airtable: (id: string) => any,
  tableId: string,
  categoryField: string
): Promise<Record<string, number>> {
  return new Promise((resolve, reject) => {
    const categoryMap: Record<string, number> = {};
    airtable(tableId)
      .select({ pageSize: 100 })
      .eachPage(
        (records: any[], fetchNextPage: () => void) => {
          for (const r of records) {
            let cat: unknown;
            try {
              cat = r.get(categoryField);
            } catch {
              cat = undefined;
            }
            const label =
              cat == null || cat === ""
                ? "Uncategorized"
                : typeof cat === "string"
                  ? cat
                  : String(cat);
            categoryMap[label] = (categoryMap[label] || 0) + 1;
          }
          fetchNextPage();
        },
        (err: Error | null | undefined) => {
          if (err != null) reject(err);
          else resolve(categoryMap);
        }
      );
  });
}

/** Airtable headers are case-sensitive; bases use `company` or `Company`. */
function proposedCompanyFieldVariants(primary: string): string[] {
  const p = (primary || "company").trim();
  const set = new Set<string>([p]);
  if (p.toLowerCase() === "company") {
    set.add("company");
    set.add("Company");
  }
  return [...set];
}

/** Generated-articles table: company column must match `AIRTABLE_ATFX_ARTICLE_COMPANY_FIELD` / article create. */
function atfxGeneratedArticleCompanyFieldCandidates(configured: string): string[] {
  const p = (configured || "Company").trim() || "Company";
  const set = new Set<string>([p]);
  if (p.toLowerCase() === "company") {
    set.add("Company");
    set.add("company");
  }
  return [...set];
}

function statusFieldVariants(primary: string): string[] {
  const p = (primary || "Status").trim();
  const set = new Set<string>([p]);
  if (p.toLowerCase() === "status") {
    set.add("Status");
    set.add("status");
  }
  return [...set];
}

function categoryFieldVariants(primary: string): string[] {
  const p = (primary || "Category").trim();
  const set = new Set<string>([p]);
  if (p.toLowerCase() === "category") {
    set.add("Category");
    set.add("category");
  }
  return [...set];
}

/** Default generated-articles table when env omits `AIRTABLE_ATFX_GENERATED_ARTICLE_TABLE_ID`. */
const ATFX_GENERATED_ARTICLES_STATS_TABLE_ID = "tblL840we8dgnW9vZ";

function generatedArticleFieldKeyMatchesCompanyColumn(key: string, companyCols: string[]): boolean {
  const kn = key.trim().toLowerCase();
  return companyCols.some((c) => c.trim().toLowerCase() === kn);
}

/** True if cell value is ATFX (string, single-select, or multi-select). */
function airtableCellIsAtfxCompany(raw: unknown): boolean {
  const lo = PROPOSED_TOPICS_COMPANY_ATFX;
  const disp = PROPOSED_TOPICS_COMPANY_ATFX_AIRTABLE.toLowerCase();
  if (raw == null || raw === "") return false;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    return s === lo || s === disp;
  }
  if (Array.isArray(raw)) {
    return raw.some((item) => airtableCellIsAtfxCompany(item));
  }
  if (typeof raw === "object" && raw && "name" in raw) {
    return airtableCellIsAtfxCompany((raw as { name: unknown }).name);
  }
  const s = String(raw).trim().toLowerCase();
  return s === lo || s === disp;
}

/** If filterByFormula cannot run (field type / name), count rows where the configured company column is ATFX. */
function countAtfxRowsByScanningGeneratedTable(
  airtable: (id: string) => any,
  tableId: string,
  companyCols: string[]
): Promise<number> {
  return new Promise((resolve, reject) => {
    let n = 0;
    airtable(tableId)
      .select({ pageSize: 100 })
      .eachPage(
        (records: any[], fetchNextPage: () => void) => {
          for (const r of records) {
            const fields = r.fields as Record<string, unknown> | undefined;
            if (!fields) continue;
            for (const key of Object.keys(fields)) {
              if (!generatedArticleFieldKeyMatchesCompanyColumn(key, companyCols)) continue;
              if (airtableCellIsAtfxCompany(fields[key])) {
                n++;
                break;
              }
            }
          }
          fetchNextPage();
        },
        (err: Error | null | undefined) => {
          if (err != null) reject(err);
          else resolve(n);
        }
      );
  });
}

async function countCompletedArticlesAtfx(airtable: (id: string) => any): Promise<number> {
  const a = config.airtable;
  const tableId = a.atfxGeneratedArticleTableId?.trim() || ATFX_GENERATED_ARTICLES_STATS_TABLE_ID;
  const companyCols = atfxGeneratedArticleCompanyFieldCandidates(a.atfxArticleFieldCompany || "Company");
  let bestFromFormula = 0;
  for (const col of companyCols) {
    for (const ff of [
      `({${col}} = "${PROPOSED_TOPICS_COMPANY_ATFX_AIRTABLE}")`,
      `LOWER({${col}}) = "${PROPOSED_TOPICS_COMPANY_ATFX}"`,
    ]) {
      try {
        const c = await airtableCountAll(airtable, tableId, ff);
        if (c > bestFromFormula) bestFromFormula = c;
      } catch {
        // Wrong field name or formula not supported for this field type
      }
    }
  }
  let scanned = 0;
  try {
    scanned = await countAtfxRowsByScanningGeneratedTable(airtable, tableId, companyCols);
  } catch (e) {
    console.error("ATFX stats completedCount scan:", (e as Error)?.message ?? e);
  }
  const out = Math.max(bestFromFormula, scanned);
  if (scanned > bestFromFormula && scanned > 0) {
    console.warn(
      "ATFX stats: completedCount scan=%d vs formula max=%d on table %s (company fields tried: %s). Set AIRTABLE_ATFX_ARTICLE_COMPANY_FIELD to the exact Airtable column name.",
      scanned,
      bestFromFormula,
      tableId,
      companyCols.join(", ")
    );
  }
  return out;
}

export function registerAtfxPortalRoutes(apiRouter: express.Router, deps: RegisterAtfxPortalRoutesDeps): void {
  const { airtable, capitalKeywordsTableId } = deps;

  apiRouter.get("/atfx/dashboard", authenticateToken, async (req, res) => {
    const dashTableId = atfxAirtableTableId();
    if (!airtable || !dashTableId) {
      return res.status(503).json({ error: "Airtable or AIRTABLE_ATFX_TABLE_ID not configured." });
    }

    const forceRefresh = req.headers["cache-control"]?.includes("no-cache");

    if (!forceRefresh) {
      const cachedData = cache.get<any[]>(CACHE_KEYS.ATFX_DASHBOARD_DATA);
      if (cachedData) {
        res.setHeader("Cache-Control", "private, max-age=120");
        res.setHeader("ETag", cachedData.etag);
        return res.json(cachedData.data);
      }
    }

    try {
      const allRecords = await airtable(dashTableId)
        .select({
          maxRecords: 200,
          filterByFormula: "NOT({Content gen} = '')",
          sort: [{ field: "Create date", direction: "desc" }],
          fields: ["Create date", "title", "Calculation", "Category"],
        })
        .firstPage();

      const data = (allRecords as any[]).map((record: any) => {
        const rawDate = record.get("Create date");
        let createDate = "";
        if (rawDate != null && rawDate !== "") {
          createDate = typeof rawDate === "string" ? rawDate : (rawDate?.start ?? rawDate?.end ?? String(rawDate));
        }
        return {
          id: record.id,
          createDate,
          title: record.get("title") ?? "",
          calculation: record.get("Calculation") ?? "",
          category: record.get("Category") ?? "",
        };
      });

      const etag = cache.set(CACHE_KEYS.ATFX_DASHBOARD_DATA, data, CACHE_TTL.CAPITAL);
      if (!cache.get(CACHE_KEYS.ATFX_DASHBOARD_STRUCTURE)) {
        cache.set(CACHE_KEYS.ATFX_DASHBOARD_STRUCTURE, { fields: ["Create date", "title", "Calculation", "Category"] }, CACHE_TTL.CAPITAL_STRUCTURE);
      }
      res.setHeader("Cache-Control", "private, max-age=120");
      res.setHeader("ETag", etag);
      res.json(data);
    } catch (err) {
      console.error("Airtable ATFX dashboard error:", err);
      res.status(500).json({ error: "Failed to fetch ATFX dashboard data" });
    }
  });

  apiRouter.get("/atfx/pending", authenticateToken, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }

    const forceRefresh = req.headers["cache-control"]?.includes("no-cache");

    if (!forceRefresh) {
      const cached = cache.get<any[]>(CACHE_KEYS.ATFX_PENDING);
      if (cached) {
        res.setHeader("Cache-Control", "private, max-age=120");
        res.setHeader("ETag", cached.etag);
        return res.json(cached.data);
      }
    }

    try {
      const records = await airtable(capitalKeywordsTableId)
        .select({
          maxRecords: 200,
          filterByFormula: withCompanyAtfxFilter(`AND({Approve} = "Approved", {Status} = "")`),
          sort: [{ field: "Create date", direction: "desc" }],
          fields: ["Create date", "Source", "Title", "summary", "Social_hook", "Keyword1", "Keyword2", "Keyword3", "Keyword_tag", "psy_trigger", "Stock_tag", "Custome"],
        })
        .firstPage();

      const data = (records as any[]).map((record: any) => {
        const rawDate = record.get("Create date");
        let createDate = "";
        if (rawDate != null && rawDate !== "") {
          createDate = typeof rawDate === "string" ? rawDate : (rawDate?.start ?? rawDate?.end ?? String(rawDate));
        }
        return {
          id: record.id,
          createDate,
          source: record.get("Source") ?? "",
          title: record.get("Title") ?? "",
          summary: record.get("summary") ?? "",
          socialHook: record.get("Social_hook") ?? "",
          keyword1: record.get("Keyword1") ?? "",
          keyword2: record.get("Keyword2") ?? "",
          keyword3: record.get("Keyword3") ?? "",
          keywordTag: record.get("Keyword_tag") ?? "",
          psyTrigger: record.get("psy_trigger") ?? "",
          stockTag: record.get("Stock_tag") ?? "",
          custom: record.get("Custome") ?? "",
        };
      });

      const etag = cache.set(CACHE_KEYS.ATFX_PENDING, data, CACHE_TTL.CAPITAL);
      res.setHeader("Cache-Control", "private, max-age=120");
      res.setHeader("ETag", etag);
      res.json(data);
    } catch (err) {
      console.error("Airtable ATFX pending error:", err);
      res.status(500).json({ error: "Failed to fetch ATFX pending data" });
    }
  });

  apiRouter.get("/atfx/approved", authenticateToken, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }

    const forceRefresh = req.headers["cache-control"]?.includes("no-cache");

    if (!forceRefresh) {
      const cached = cache.get<any[]>(CACHE_KEYS.ATFX_APPROVED);
      if (cached) {
        res.setHeader("Cache-Control", "private, max-age=120");
        res.setHeader("ETag", cached.etag);
        return res.json(cached.data);
      }
    }

    try {
      const records = await airtable(capitalKeywordsTableId)
        .select({
          maxRecords: 200,
          filterByFormula: withCompanyAtfxFilter(`{Status} = "Approved"`),
          sort: [{ field: "Create date", direction: "desc" }],
          fields: ["Create date", "Title"],
        })
        .firstPage();

      const data = (records as any[]).map((record: any) => {
        const rawDate = record.get("Create date");
        let createDate = "";
        if (rawDate != null && rawDate !== "") {
          createDate = typeof rawDate === "string" ? rawDate : (rawDate?.start ?? rawDate?.end ?? String(rawDate));
        }
        return {
          id: record.id,
          createDate,
          title: record.get("Title") ?? "",
        };
      });

      const etag = cache.set(CACHE_KEYS.ATFX_APPROVED, data, CACHE_TTL.CAPITAL);
      res.setHeader("Cache-Control", "private, max-age=120");
      res.setHeader("ETag", etag);
      res.json(data);
    } catch (err) {
      console.error("Airtable ATFX approved error:", err);
      res.status(500).json({ error: "Failed to fetch ATFX approved items" });
    }
  });

  apiRouter.get("/atfx/stats", authenticateToken, async (req, res) => {
    const forceRefresh = req.headers["cache-control"]?.includes("no-cache");

    if (!forceRefresh) {
      const cached = cache.get<any>(CACHE_KEYS.ATFX_STATS);
      if (cached) {
        res.setHeader("Cache-Control", "private, max-age=120");
        res.setHeader("ETag", cached.etag);
        return res.json(cached.data);
      }
    }

    try {
      const data = await getAtfxDashboardBillingStats(BROKERAGE_ATFX);
      const etag = cache.set(CACHE_KEYS.ATFX_STATS, data, CACHE_TTL.CAPITAL);
      res.setHeader("Cache-Control", "private, max-age=120");
      res.setHeader("ETag", etag);
      res.json(data);
    } catch (err) {
      console.error("ATFX dashboard billing stats error:", err);
      const message = err instanceof Error ? err.message : "Failed to fetch ATFX stats";
      const status = message.includes("Supabase not configured") ? 503 : 500;
      res.status(status).json({ error: message });
    }
  });
}
