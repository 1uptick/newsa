import express from "express";
import { cache, CACHE_KEYS, CACHE_TTL } from "../cache.js";
import { authenticateToken } from "../auth.js";
import { withCompanyBlankFilter } from "../capitalKeywords.js";
import { fetchCapitalArticlesListRecords } from "../capitalArticlesList.js";
import { attachReadyPostNewFlagsForUser } from "../capitalReadyPostOpened.js";
import {
  CAPITAL_DASHBOARD_TABLE_ID,
  CAPITAL_KEYWORDS_TABLE_ID,
  TRENDING_TOPICS_TABLE_ID,
} from "../capitalAirtableIds.js";

type RegisterDeps = { airtable: any | null; supabase: any | null };

type CapitalDashboardPayloadRow = {
  id: string;
  createDate: string;
  title: string;
  calculation: string;
  category?: string;
  isNew?: boolean;
  notifySentAt?: string | null;
};

function capitalDashboardCreateDate(createdDate: unknown, updatedAt: unknown): string {
  if (typeof createdDate === "string" && createdDate.trim() !== "") return createdDate.trim();
  if (typeof updatedAt === "string" && updatedAt) {
    const t = Date.parse(updatedAt);
    if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  }
  return "";
}

/** PostgREST / Postgres when a column is missing or not yet visible in PostgREST's schema cache. */
function isSupabaseUnknownColumnError(err: unknown, column: string): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { message?: string; code?: string; details?: string; hint?: string };
  const msg = `${e.message ?? ""} ${e.details ?? ""} ${e.hint ?? ""}`.toLowerCase();
  const col = column.toLowerCase();
  if (e.code === "42703") return true;
  if (!msg.includes(col)) return false;
  return (
    msg.includes("does not exist") ||
    msg.includes("undefined column") ||
    msg.includes("schema cache") ||
    msg.includes("could not find")
  );
}

/** Sort key for Ready to Post: same priority as the Date column (created_date, else updated_at). */
function capitalDashboardRowSortMs(createdDate: unknown, updatedAt: unknown): number {
  if (typeof createdDate === "string" && createdDate.trim() !== "") {
    const t = Date.parse(createdDate.trim());
    if (!Number.isNaN(t)) return t;
  }
  if (typeof updatedAt === "string" && updatedAt) {
    const t = Date.parse(updatedAt);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

export function registerCapitalReadRoutes(app: express.Application, deps: RegisterDeps): void {
  const { airtable, supabase } = deps;

  /** Ready-to-post rows: portal-edited body lives in `capital_articles.content` (Supabase). */
  app.get("/api/capitaldashboard", authenticateToken, async (req, res) => {
    const forceRefresh = req.headers["cache-control"]?.includes("no-cache");

    const finishDashboardResponse = async (
      baseRows: Array<{
        id: string;
        createDate: string;
        title: string;
        calculation: string;
        category?: string;
        notifySentAt?: string | null;
      }>,
      etag: string | null
    ) => {
      const uid = (req as express.Request & { uid?: string }).uid;
      const items: CapitalDashboardPayloadRow[] = baseRows.map((r) => ({ ...r }));
      if (supabase && uid) {
        try {
          await attachReadyPostNewFlagsForUser(supabase, uid, items);
        } catch (e) {
          console.error("capitaldashboard attachReadyPostNewFlagsForUser:", e);
          for (const row of items) row.isNew = false;
        }
      } else {
        for (const row of items) row.isNew = false;
      }
      res.setHeader("Cache-Control", "private, max-age=120");
      if (etag) res.setHeader("ETag", etag);
      res.json(items);
    };

    if (!forceRefresh) {
      const cachedData = cache.get<any[]>(CACHE_KEYS.CAPITAL_DASHBOARD_DATA);
      if (cachedData) {
        await finishDashboardResponse(cachedData.data, cachedData.etag);
        return;
      }
    }

    if (supabase) {
      try {
        const baseCols = "airtable_id, title, content, created_date, updated_at";
        // The Supabase row fetch and the Airtable allow-list fetch are independent — run them in
        // parallel so the dashboard waits on max(supabase, airtable) instead of their sum.
        const rowsPromise = (async (): Promise<Record<string, unknown>[] | null> => {
          let result = await supabase
            .from("capital_articles")
            .select(`${baseCols}, notify_sent_at`)
            .limit(400);
          if (result.error && isSupabaseUnknownColumnError(result.error, "notify_sent_at")) {
            result = await supabase.from("capital_articles").select(baseCols).limit(400);
          }
          if (result.error) throw result.error;
          return result.data;
        })();
        const allowedIdsPromise: Promise<Set<string> | null> = airtable
          ? fetchCapitalArticlesListRecords(airtable).then(
              (listRecs: any[]) => new Set(listRecs.map((r: any) => String(r.id ?? "")))
            )
          : Promise.resolve(null);

        const [rows, allowedIds] = await Promise.all([rowsPromise, allowedIdsPromise]);

        const withBody = (rows ?? []).filter((r: { content?: string | null; airtable_id?: unknown }) => {
          if (typeof r.content !== "string" || r.content.trim().length === 0) return false;
          if (allowedIds && !allowedIds.has(String(r.airtable_id ?? ""))) return false;
          return true;
        });
        withBody.sort(
          (a: { created_date?: unknown; updated_at?: unknown }, b: { created_date?: unknown; updated_at?: unknown }) =>
            capitalDashboardRowSortMs(b.created_date, b.updated_at) - capitalDashboardRowSortMs(a.created_date, a.updated_at)
        );
        const data = withBody.slice(0, 200).map((r: Record<string, unknown>) => ({
          id: String(r.airtable_id ?? ""),
          createDate: capitalDashboardCreateDate(r.created_date, r.updated_at),
          title: typeof r.title === "string" ? r.title : r.title != null ? String(r.title) : "",
          calculation: typeof r.content === "string" ? r.content : "",
          category: "",
          notifySentAt:
            typeof r.notify_sent_at === "string"
              ? r.notify_sent_at
              : r.notify_sent_at != null && String(r.notify_sent_at).trim() !== ""
                ? String(r.notify_sent_at)
                : null,
        }));

        const etag = cache.set(CACHE_KEYS.CAPITAL_DASHBOARD_DATA, data, CACHE_TTL.CAPITAL);
        if (!cache.get(CACHE_KEYS.CAPITAL_DASHBOARD_STRUCTURE)) {
          cache.set(
            CACHE_KEYS.CAPITAL_DASHBOARD_STRUCTURE,
            { source: "supabase", table: "capital_articles" },
            CACHE_TTL.CAPITAL_STRUCTURE
          );
        }
        await finishDashboardResponse(data, etag);
        return;
      } catch (err) {
        console.error("Supabase capitaldashboard error:", err);
        return res.status(500).json({ error: "Failed to fetch dashboard data" });
      }
    }

    if (!airtable) {
      return res.status(503).json({
        error: "Supabase not configured (required for Ready to Post). Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      });
    }

    try {
      const listRecords = await fetchCapitalArticlesListRecords(airtable);
      const data = listRecords.map((record: any) => {
        const rawDate = record.get("Create date") ?? record.get("Created") ?? record.get("created date");
        let createDate = "";
        if (rawDate != null && rawDate !== "") {
          createDate = typeof rawDate === "string" ? rawDate : (rawDate?.start ?? rawDate?.end ?? String(rawDate));
        }
        const calculation = record.get("Calculation") ?? record.get("calculation") ?? "";
        return {
          id: record.id,
          createDate,
          title: record.get("title") ?? record.get("Title") ?? "",
          calculation: typeof calculation === "string" ? calculation : String(calculation ?? ""),
          category: record.get("Category") ?? "",
          notifySentAt: null as string | null,
        };
      });
      data.sort(
        (a, b) => capitalDashboardRowSortMs(b.createDate, undefined) - capitalDashboardRowSortMs(a.createDate, undefined)
      );
      const capped = data.slice(0, 200);

      const etag = cache.set(CACHE_KEYS.CAPITAL_DASHBOARD_DATA, capped, CACHE_TTL.CAPITAL);
      if (!cache.get(CACHE_KEYS.CAPITAL_DASHBOARD_STRUCTURE)) {
        cache.set(
          CACHE_KEYS.CAPITAL_DASHBOARD_STRUCTURE,
          { source: "airtable", sameAsCapitalArticlesPage: true },
          CACHE_TTL.CAPITAL_STRUCTURE
        );
      }
      await finishDashboardResponse(capped, etag);
    } catch (err) {
      console.error("Airtable capitaldashboard error:", err);
      res.status(500).json({ error: "Failed to fetch dashboard data" });
    }
  });

  app.post("/api/capitaldashboard/ready-post-opened", authenticateToken, async (req, res) => {
    if (!supabase) {
      return res.status(503).json({ error: "Supabase not configured." });
    }
    const uid = (req as express.Request & { uid?: string }).uid;
    if (!uid) return res.status(401).json({ error: "Unauthorized" });
    const articleId = typeof req.body?.articleId === "string" ? req.body.articleId.trim() : "";
    if (!articleId) return res.status(400).json({ error: "Missing articleId" });
    try {
      const { error } = await supabase.from("capital_ready_post_opened").upsert(
        {
          firebase_uid: uid,
          airtable_id: articleId,
          opened_at: new Date().toISOString(),
        },
        { onConflict: "firebase_uid,airtable_id" }
      );
      if (error) throw error;
      res.json({ ok: true });
    } catch (err: unknown) {
      console.error("ready-post-opened upsert:", err);
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "Failed to record";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/capitalpending", authenticateToken, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }

    const forceRefresh = req.headers["cache-control"]?.includes("no-cache");

    if (!forceRefresh) {
      const cached = cache.get<any[]>(CACHE_KEYS.CAPITAL_PENDING);
      if (cached) {
        res.setHeader("Cache-Control", "private, max-age=120");
        res.setHeader("ETag", cached.etag);
        return res.json(cached.data);
      }
    }

    try {
      const records = await airtable(CAPITAL_KEYWORDS_TABLE_ID)
        .select({
          maxRecords: 200,
          filterByFormula: withCompanyBlankFilter(`AND({Approve} = "Approved", {Status} = "")`),
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

      const etag = cache.set(CACHE_KEYS.CAPITAL_PENDING, data, CACHE_TTL.CAPITAL);
      res.setHeader("Cache-Control", "private, max-age=120");
      res.setHeader("ETag", etag);
      res.json(data);
    } catch (err) {
      console.error("Airtable capitalpending error:", err);
      res.status(500).json({ error: "Failed to fetch pending approval data" });
    }
  });

  app.get("/api/capitalapproved", authenticateToken, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }

    const forceRefresh = req.headers["cache-control"]?.includes("no-cache");

    if (!forceRefresh) {
      const cached = cache.get<any[]>(CACHE_KEYS.CAPITAL_APPROVED);
      if (cached) {
        res.setHeader("Cache-Control", "private, max-age=120");
        res.setHeader("ETag", cached.etag);
        return res.json(cached.data);
      }
    }

    try {
      const records = await airtable(CAPITAL_KEYWORDS_TABLE_ID)
        .select({
          maxRecords: 200,
          filterByFormula: withCompanyBlankFilter(`{Status} = "Approved"`),
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

      const etag = cache.set(CACHE_KEYS.CAPITAL_APPROVED, data, CACHE_TTL.CAPITAL);
      res.setHeader("Cache-Control", "private, max-age=120");
      res.setHeader("ETag", etag);
      res.json(data);
    } catch (err) {
      console.error("Airtable capitalapproved error:", err);
      res.status(500).json({ error: "Failed to fetch approved items" });
    }
  });

  app.get("/api/trending-topics", authenticateToken, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }

    const category = (req.query.category as string)?.trim() || "HK_trend";
    const categoryLower = category.toLowerCase();
    const cacheKey = `${CACHE_KEYS.TRENDING_TOPICS}:${categoryLower}`;

    const forceRefresh = req.headers["cache-control"]?.includes("no-cache");
    if (!forceRefresh) {
      const cached = cache.get<{ date: string; keywords: string }>(cacheKey);
      if (cached) {
        res.setHeader("Cache-Control", "private, max-age=120");
        res.setHeader("ETag", cached.etag);
        return res.json(cached.data);
      }
    }

    try {
      const allRecords = await airtable(TRENDING_TOPICS_TABLE_ID)
        .select({ maxRecords: 100 })
        .firstPage();

      const fieldNames = (allRecords as any[]).length > 0 ? Object.keys((allRecords as any[])[0].fields) : [];
      const catField = fieldNames.find((f) => f.toLowerCase() === "category") || "category";
      const dateField = fieldNames.find((f) => f.toLowerCase() === "date") || "date";
      const kwField = fieldNames.find((f) => f.toLowerCase() === "keywords") || "keywords";

      const filtered = (allRecords as any[]).filter((r: any) => {
        const val = r.get(catField);
        return typeof val === "string" && val.trim().toLowerCase() === categoryLower;
      });
      if (filtered.length === 0) {
        const allCats = (allRecords as any[]).map((r: any) => r.get(catField));
        console.log(`[trending-topics] No ${category} records. Categories:`, [...new Set(allCats)]);
      }

      filtered.sort((a: any, b: any) => {
        const da = a.get(dateField) ?? "";
        const db = b.get(dateField) ?? "";
        return String(db).localeCompare(String(da));
      });

      const record = filtered[0];
      if (!record) {
        const empty = { date: "", keywords: "" };
        const etag = cache.set(cacheKey, empty, CACHE_TTL.CAPITAL);
        res.setHeader("Cache-Control", "private, max-age=120");
        res.setHeader("ETag", etag);
        return res.json(empty);
      }

      const rawDate = record.get(dateField) ?? "";
      let date = "";
      if (rawDate != null && rawDate !== "") {
        date = typeof rawDate === "string" ? rawDate : (rawDate?.start ?? rawDate?.end ?? String(rawDate));
      }
      const keywords = record.get(kwField) ?? "";
      const data = { date, keywords };
      const etag = cache.set(cacheKey, data, CACHE_TTL.CAPITAL);
      res.setHeader("Cache-Control", "private, max-age=120");
      res.setHeader("ETag", etag);
      res.json(data);
    } catch (err) {
      console.error("Airtable trending-topics error:", err);
      res.status(500).json({ error: "Failed to fetch trending topics" });
    }
  });

  app.get("/api/capitalstats", authenticateToken, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }

    const forceRefresh = req.headers["cache-control"]?.includes("no-cache");

    if (!forceRefresh) {
      const cached = cache.get<any>(CACHE_KEYS.CAPITAL_STATS);
      if (cached) {
        res.setHeader("Cache-Control", "private, max-age=120");
        res.setHeader("ETag", cached.etag);
        return res.json(cached.data);
      }
    }

    try {
      const [proposedRecords, approvedRecords, completedRecords] = await Promise.all([
        airtable(CAPITAL_KEYWORDS_TABLE_ID)
          .select({ filterByFormula: withCompanyBlankFilter(`{Approve} = "Approved"`), fields: ["Approve"] })
          .firstPage(),
        airtable(CAPITAL_KEYWORDS_TABLE_ID)
          .select({ filterByFormula: withCompanyBlankFilter(`{Status} = "Approved"`), fields: ["Status"] })
          .firstPage(),
        airtable(CAPITAL_DASHBOARD_TABLE_ID)
          .select({ filterByFormula: "NOT({Content gen} = '')", fields: ["Category"], maxRecords: 500 })
          .firstPage(),
      ]);

      const categoryMap: Record<string, number> = {};
      for (const r of completedRecords as any[]) {
        const cat = r.get("Category") || "Uncategorized";
        categoryMap[cat] = (categoryMap[cat] || 0) + 1;
      }
      const categories = Object.entries(categoryMap)
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);

      const data = {
        proposedCount: (proposedRecords as any[]).length,
        approvedCount: (approvedRecords as any[]).length,
        completedCount: (completedRecords as any[]).length,
        categories,
      };

      const etag = cache.set(CACHE_KEYS.CAPITAL_STATS, data, CACHE_TTL.CAPITAL);
      res.setHeader("Cache-Control", "private, max-age=120");
      res.setHeader("ETag", etag);
      res.json(data);
    } catch (err) {
      console.error("Airtable capitalstats error:", err);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });
}
