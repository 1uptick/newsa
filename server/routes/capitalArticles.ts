import express from "express";
import { cache, CACHE_KEYS, CACHE_TTL } from "../cache.js";
import { config } from "../config.js";
import { authenticateToken, requireAdmin } from "../auth.js";
import { fetchCapitalArticlesListRecords } from "../capitalArticlesList.js";

type SendResult = { sent: boolean; error?: string };

type RegisterCapitalArticlesRoutesDeps = {
  airtable: any | null;
  supabase: any | null;
  sendArticlesNotificationEmail: (to: string, articleTitle?: string) => Promise<SendResult>;
};

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

function appendAirtableImagesToContent(content: string, record: any): string {
  const imgUrls: string[] = [];
  for (const key of ["image 1", "image 2", "image A", "image B"]) {
    const v = record.get(key);
    if (v && typeof v === "string" && v.startsWith("http")) imgUrls.push(v);
  }
  const seen = new Set<string>();
  for (const url of imgUrls) {
    if (seen.has(url)) continue;
    seen.add(url);
    content += `<img src="${url.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" alt="" style="max-width:100%;height:auto;display:block;margin:1rem 0;" />`;
  }
  return content;
}

/** Write notify timestamp for Ready to Post badge; insert row if missing. Returns whether `notify_sent_at` was stored. */
async function stampCapitalNotifySentAt(supabase: NonNullable<RegisterCapitalArticlesRoutesDeps["supabase"]>, airtableId: string): Promise<boolean> {
  const iso = new Date().toISOString();
  let notifyColumnAvailable = true;

  const doUpdate = (withNotifyCol: boolean) =>
    supabase
      .from("capital_articles")
      .update(withNotifyCol ? { notify_sent_at: iso, updated_at: iso } : { updated_at: iso })
      .eq("airtable_id", airtableId)
      .select("airtable_id");

  let { data: updatedRows, error: upErr } = await doUpdate(true);
  if (upErr && isSupabaseUnknownColumnError(upErr, "notify_sent_at")) {
    notifyColumnAvailable = false;
    ({ data: updatedRows, error: upErr } = await doUpdate(false));
  }
  if (upErr) {
    console.error("Capital notify_sent_at update:", upErr);
    return false;
  }

  if (updatedRows && updatedRows.length > 0) {
    return notifyColumnAvailable;
  }

  const insertPayload: Record<string, unknown> = {
    airtable_id: airtableId,
    content: "",
    updated_at: iso,
  };
  if (notifyColumnAvailable) insertPayload.notify_sent_at = iso;

  let { error: insErr } = await supabase.from("capital_articles").insert(insertPayload);
  if (insErr && isSupabaseUnknownColumnError(insErr, "notify_sent_at")) {
    notifyColumnAvailable = false;
    delete insertPayload.notify_sent_at;
    ({ error: insErr } = await supabase.from("capital_articles").insert(insertPayload));
  }
  if (insErr) {
    console.error("Capital notify_sent_at insert:", insErr);
    return false;
  }
  return notifyColumnAvailable;
}

async function getCapitalRecordFromAirtable(airtable: any, recordId: string): Promise<{ createdDate: string; title: string; excerpt: string; content: string } | null> {
  const capitalTableId = config.airtable.capitalTableId || "tblNqlepjy0uCP9CU";
  try {
    const record: any = await airtable(capitalTableId).find(recordId);
    const created = record.get("Create date") ?? record.get("Created") ?? record.get("created date") ?? "";
    const title = record.get("title") ?? record.get("Title") ?? "";
    const excerpt = record.get("excerpt") ?? record.get("Excerpt") ?? "";
    let content = record.get("Calculation") ?? record.get("calculation") ?? "";
    content = typeof content === "string" ? content : String(content ?? "");
    content = appendAirtableImagesToContent(content, record);
    return {
      createdDate: typeof created === "string" ? created : created ? String(created) : "",
      title: typeof title === "string" ? title : String(title ?? ""),
      excerpt: typeof excerpt === "string" ? excerpt : String(excerpt ?? ""),
      content,
    };
  } catch {
    return null;
  }
}

export function registerCapitalArticlesRoutes(apiRouter: express.Router, deps: RegisterCapitalArticlesRoutesDeps): void {
  const { airtable, supabase, sendArticlesNotificationEmail } = deps;

  // Send Capital Articles notification to selected admins and capital users (admin only)
  apiRouter.post("/capital/notify-articles", authenticateToken, requireAdmin, async (req, res) => {
    const { adminEmails, userEmails, articleTitle, articleId } = req.body || {};
    const adminList = Array.isArray(adminEmails) ? adminEmails.filter((e: unknown) => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) : [];
    const userList = Array.isArray(userEmails) ? userEmails.filter((e: unknown) => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) : [];
    const allEmails = [...new Set([...adminList, ...userList])];
    if (allEmails.length === 0) {
      return res.status(400).json({ error: "Select at least one recipient" });
    }
    const titleStr = typeof articleTitle === "string" ? articleTitle.trim() : "";
    const results: { email: string; sent: boolean; error?: string }[] = [];
    for (const email of allEmails) {
      const result = await sendArticlesNotificationEmail(email, titleStr || undefined);
      results.push({ email, sent: result.sent, error: result.error });
    }
    const sentCount = results.filter((r) => r.sent).length;
    const aid = typeof articleId === "string" ? articleId.trim() : "";

    let notifyBadgeRecorded = false;
    if (sentCount > 0 && supabase && aid) {
      try {
        notifyBadgeRecorded = await stampCapitalNotifySentAt(supabase, aid);
      } catch (e: unknown) {
        console.error("Capital notify_sent_at stamp:", e);
      }
      cache.invalidate(CACHE_KEYS.CAPITAL_DASHBOARD_DATA);
    }

    let contentGenUpdated = false;
    let contentGenError: string | undefined;
    if (aid && airtable) {
      try {
        const capitalTableId = config.airtable.capitalTableId || "tblNqlepjy0uCP9CU";
        const table = airtable(capitalTableId) as any;
        const existing = await table.find(aid);
        const fieldNames = ["Content gen", "Content Gen", "content gen", "Content_gen"];
        const actualFieldName = fieldNames.find((n) => existing.get(n) != null) ?? "Content gen";
        const cur = existing.get(actualFieldName);
        const curStr = cur == null ? "" : String(cur);
        console.log(`Notify: updating Airtable field "${actualFieldName}" for ${aid}: "${curStr}" -> "${curStr}*"`);
        await table.update(aid, { [actualFieldName]: `${curStr}*` });
        contentGenUpdated = true;
        cache.invalidate(CACHE_KEYS.CAPITAL_DASHBOARD_DATA);
        cache.invalidate(CACHE_KEYS.CAPITAL_ARTICLES_DATA);
        cache.invalidate(CACHE_KEYS.CAPITAL_STATS);
      } catch (e: any) {
        console.error("Capital notify Content gen update:", e);
        contentGenError = e?.message ?? "Failed to update Content gen in Airtable";
      }
    }

    res.json({
      sent: sentCount,
      total: allEmails.length,
      results,
      contentGenUpdated,
      contentGenError,
      notifyBadgeRecorded,
    });
  });

  apiRouter.get("/capital", authenticateToken, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({
        error: "Airtable not configured.",
      });
    }

    const forceRefresh = req.headers["cache-control"]?.includes("no-cache");

    // Check cache
    if (!forceRefresh) {
      const cachedData = cache.get<any[]>(CACHE_KEYS.CAPITAL_ARTICLES_DATA);
      if (cachedData) {
        res.setHeader("Cache-Control", "private, max-age=120");
        res.setHeader("ETag", cachedData.etag);
        return res.json(cachedData.data);
      }
    }

    try {
      const records = await fetchCapitalArticlesListRecords(airtable);

      const items = records.map((record: any) => {
        const created = record.get("Create date") ?? record.get("Created") ?? record.get("created date") ?? "";
        const title = record.get("title") ?? record.get("Title") ?? "";
        const excerpt = record.get("excerpt") ?? record.get("Excerpt") ?? "";
        const calculation = record.get("Calculation") ?? record.get("calculation") ?? "";
        return {
          id: record.id,
          createdDate: typeof created === "string" ? created : created ? String(created) : "",
          title: typeof title === "string" ? title : String(title ?? ""),
          excerpt: typeof excerpt === "string" ? excerpt : String(excerpt ?? ""),
          calculation: typeof calculation === "string" ? calculation : String(calculation ?? ""),
          comments: "",
        };
      });

      items.sort((a: any, b: any) => {
        if (!a.createdDate || !b.createdDate) return 0;
        return new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime();
      });

      if (supabase && items.length > 0) {
        const ids = items.map((i: { id: string }) => i.id).filter(Boolean);
        type PortalOverrideRow = {
          airtable_id: string;
          title: string | null;
          excerpt: string | null;
          title_edited_in_portal?: boolean | null;
          excerpt_edited_in_portal?: boolean | null;
        };
        let portalRows: PortalOverrideRow[] = [];
        let titleFlagInQuery = true;
        let excerptFlagInQuery = true;
        const q1 = await supabase
          .from("capital_articles")
          .select("airtable_id, title, excerpt, title_edited_in_portal, excerpt_edited_in_portal")
          .in("airtable_id", ids);
        if (q1.error && (isSupabaseUnknownColumnError(q1.error, "title_edited_in_portal") || isSupabaseUnknownColumnError(q1.error, "excerpt_edited_in_portal"))) {
          titleFlagInQuery = !isSupabaseUnknownColumnError(q1.error, "title_edited_in_portal");
          excerptFlagInQuery = !isSupabaseUnknownColumnError(q1.error, "excerpt_edited_in_portal");
          const q2 = await supabase.from("capital_articles").select("airtable_id, title, excerpt").in("airtable_id", ids);
          if (q2.error) throw q2.error;
          portalRows = ((q2.data ?? []) as PortalOverrideRow[]) ?? [];
        } else if (q1.error) {
          throw q1.error;
        } else {
          portalRows = ((q1.data ?? []) as PortalOverrideRow[]) ?? [];
        }
        const byId = new Map<string, PortalOverrideRow>(portalRows.map((r) => [r.airtable_id, r]));
        for (const item of items as { id: string; title: string; excerpt: string }[]) {
          const row = byId.get(item.id);
          if (!row) continue;
          if (typeof row.title === "string") {
            if (titleFlagInQuery) {
              if (row.title_edited_in_portal) item.title = row.title;
            } else if (row.title.trim() !== "") {
              item.title = row.title;
            }
          }
          if (typeof row.excerpt === "string") {
            if (excerptFlagInQuery) {
              if (row.excerpt_edited_in_portal) item.excerpt = row.excerpt;
            } else if (row.excerpt.trim() !== "") {
              item.excerpt = row.excerpt;
            }
          }
        }
      }

      const etag = cache.set(CACHE_KEYS.CAPITAL_ARTICLES_DATA, items, CACHE_TTL.CAPITAL);
      if (!cache.get(CACHE_KEYS.CAPITAL_ARTICLES_STRUCTURE)) {
        cache.set(CACHE_KEYS.CAPITAL_ARTICLES_STRUCTURE, { fields: ["Create date", "title", "excerpt", "Calculation", "comments"] }, CACHE_TTL.CAPITAL_STRUCTURE);
      }
      res.setHeader("Cache-Control", "private, max-age=120");
      res.setHeader("ETag", etag);
      res.json(items);
    } catch (err: any) {
      console.error("Airtable capital error:", err);
      const message = err?.message ?? err?.error ?? "Failed to fetch capital data";
      res.status(500).json({ error: message });
    }
  });

  apiRouter.get("/capital/:id/content", authenticateToken, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing article id" });
    try {
      let commentsFromPortal: string | null = null;
      if (supabase) {
        const { data: row } = await supabase
          .from("capital_articles")
          .select("content, comments")
          .eq("airtable_id", id)
          .maybeSingle();
        if (row?.content != null && row.content !== "") {
          return res.json({
            content: row.content,
            comments: row.comments != null ? String(row.comments) : "",
            fromSupabase: true,
          });
        }
        if (row?.comments != null && row.comments !== "") {
          commentsFromPortal = String(row.comments);
        }
      }
      const fromAirtable = await getCapitalRecordFromAirtable(airtable, id);
      if (fromAirtable) {
        if (supabase) {
          const updated_at = new Date().toISOString();
          let portalRow: { airtable_id?: string; title_edited_in_portal?: boolean; excerpt_edited_in_portal?: boolean } | null = null;
          let titleFlagSupported = true;
          let excerptFlagSupported = true;
          const pr1 = await supabase
            .from("capital_articles")
            .select("airtable_id, title_edited_in_portal, excerpt_edited_in_portal")
            .eq("airtable_id", id)
            .maybeSingle();
          if (
            pr1.error &&
            (isSupabaseUnknownColumnError(pr1.error, "title_edited_in_portal") ||
              isSupabaseUnknownColumnError(pr1.error, "excerpt_edited_in_portal"))
          ) {
            titleFlagSupported = !isSupabaseUnknownColumnError(pr1.error, "title_edited_in_portal");
            excerptFlagSupported = !isSupabaseUnknownColumnError(pr1.error, "excerpt_edited_in_portal");
            const pr2 = await supabase.from("capital_articles").select("airtable_id").eq("airtable_id", id).maybeSingle();
            if (pr2.error) throw pr2.error;
            portalRow = pr2.data;
          } else if (pr1.error) {
            throw pr1.error;
          } else {
            portalRow = pr1.data;
          }
          const baseFields = {
            created_date: fromAirtable.createdDate,
            content: fromAirtable.content,
            content_edited_in_portal: false,
            updated_at,
          };
          const excerptField =
            excerptFlagSupported && portalRow?.airtable_id && portalRow.excerpt_edited_in_portal
              ? {}
              : { excerpt: fromAirtable.excerpt };
          if (!portalRow?.airtable_id) {
            const insertPayload: Record<string, unknown> = {
              airtable_id: id,
              title: fromAirtable.title,
              excerpt: fromAirtable.excerpt,
              ...baseFields,
            };
            if (titleFlagSupported) insertPayload.title_edited_in_portal = false;
            if (excerptFlagSupported) insertPayload.excerpt_edited_in_portal = false;
            const { error: insErr } = await supabase.from("capital_articles").insert(insertPayload);
            if (insErr) throw insErr;
          } else {
            const updatePayload: Record<string, unknown> = { ...baseFields, ...excerptField };
            const preservePortalTitle = titleFlagSupported ? Boolean(portalRow.title_edited_in_portal) : true;
            if (!preservePortalTitle) {
              updatePayload.title = fromAirtable.title;
            }
            const { error: updErr } = await supabase.from("capital_articles").update(updatePayload).eq("airtable_id", id);
            if (updErr) throw updErr;
          }
          cache.invalidate(CACHE_KEYS.CAPITAL_DASHBOARD_DATA);
          cache.invalidate(CACHE_KEYS.CAPITAL_ARTICLES_DATA);
        }
        return res.json({
          content: fromAirtable.content,
          comments: commentsFromPortal ?? "",
          fromSupabase: false,
        });
      }
      res.status(404).json({ error: "Article not found" });
    } catch (err: any) {
      console.error("Capital content error:", err);
      res.status(500).json({ error: err?.message ?? "Failed to get content" });
    }
  });

  apiRouter.post("/capital/sync", authenticateToken, requireAdmin, async (_req, res) => {
    if (!airtable) return res.status(503).json({ error: "Airtable not configured" });
    if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
    const capitalTableId = config.airtable.capitalTableId || "tblNqlepjy0uCP9CU";
    try {
      const listRecords = await airtable(capitalTableId).select({ maxRecords: 200 }).firstPage();
      for (const listRecord of listRecords as any[]) {
        // Always fetch the full individual record so long text fields are not truncated
        const record: any = await airtable(capitalTableId).find(listRecord.id);
        const created = record.get("Create date") ?? record.get("Created") ?? record.get("created date") ?? "";
        const title = record.get("title") ?? record.get("Title") ?? "";
        const excerpt = record.get("excerpt") ?? record.get("Excerpt") ?? "";
        const calculation = record.get("Calculation") ?? record.get("calculation") ?? "";
        let content = typeof calculation === "string" ? calculation : String(calculation ?? "");
        content = appendAirtableImagesToContent(content, record);

        let existingRow: {
          content_edited_in_portal?: boolean;
          title_edited_in_portal?: boolean;
          excerpt_edited_in_portal?: boolean;
        } | null = null;
        let titleFlagSupported = true;
        let excerptFlagSupported = true;
        const sr1 = await supabase
          .from("capital_articles")
          .select("content_edited_in_portal, title_edited_in_portal, excerpt_edited_in_portal")
          .eq("airtable_id", record.id)
          .maybeSingle();
        if (
          sr1.error &&
          (isSupabaseUnknownColumnError(sr1.error, "title_edited_in_portal") ||
            isSupabaseUnknownColumnError(sr1.error, "excerpt_edited_in_portal"))
        ) {
          titleFlagSupported = !isSupabaseUnknownColumnError(sr1.error, "title_edited_in_portal");
          excerptFlagSupported = !isSupabaseUnknownColumnError(sr1.error, "excerpt_edited_in_portal");
          const sr2 = await supabase.from("capital_articles").select("content_edited_in_portal").eq("airtable_id", record.id).maybeSingle();
          if (sr2.error) throw sr2.error;
          existingRow = sr2.data;
        } else if (sr1.error) {
          throw sr1.error;
        } else {
          existingRow = sr1.data;
        }

        const titleStr = typeof title === "string" ? title : String(title ?? "");
        const excerptStr = typeof excerpt === "string" ? excerpt : String(excerpt ?? "");
        const createdStr = typeof created === "string" ? created : created ? String(created) : "";
        const updated_at = new Date().toISOString();

        if (existingRow) {
          const updatePayload: Record<string, unknown> = {
            created_date: createdStr,
            updated_at,
          };
          if (titleFlagSupported && !existingRow.title_edited_in_portal) {
            updatePayload.title = titleStr;
          }
          if (excerptFlagSupported && !existingRow.excerpt_edited_in_portal) {
            updatePayload.excerpt = excerptStr;
          }
          if (!existingRow.content_edited_in_portal) {
            updatePayload.content = content;
          }
          const { error: syncUpdErr } = await supabase.from("capital_articles").update(updatePayload).eq("airtable_id", record.id);
          if (syncUpdErr) throw syncUpdErr;
        } else {
          const insertPayload: Record<string, unknown> = {
            airtable_id: record.id,
            title: titleStr,
            excerpt: excerptStr,
            created_date: createdStr,
            content,
            content_edited_in_portal: false,
            updated_at,
          };
          if (titleFlagSupported) insertPayload.title_edited_in_portal = false;
          if (excerptFlagSupported) insertPayload.excerpt_edited_in_portal = false;
          const { error: syncInsErr } = await supabase.from("capital_articles").insert(insertPayload);
          if (syncInsErr) throw syncInsErr;
        }
      }
      cache.invalidate(CACHE_KEYS.CAPITAL_ARTICLES);
      cache.invalidate(CACHE_KEYS.CAPITAL_ARTICLES_DATA);
      cache.invalidate(CACHE_KEYS.CAPITAL_DASHBOARD_DATA);
      cache.invalidatePrefix("capital:article:");
      res.json({ synced: listRecords.length });
    } catch (err: any) {
      console.error("Capital sync error:", err);
      res.status(500).json({ error: err?.message ?? "Sync failed" });
    }
  });

  apiRouter.patch("/capital/:id/content", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { content } = req.body;
    if (!id) return res.status(400).json({ error: "Missing article id" });
    if (typeof content !== "string") return res.status(400).json({ error: "Missing or invalid content" });
    if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
    try {
      const { error } = await supabase.from("capital_articles").upsert(
        {
          airtable_id: id,
          content,
          content_edited_in_portal: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "airtable_id" }
      );
      if (error) throw error;
      cache.invalidate(CACHE_KEYS.CAPITAL_ARTICLE(id));
      cache.invalidate(CACHE_KEYS.CAPITAL_DASHBOARD_DATA);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Capital update content error:", err);
      res.status(500).json({ error: err?.message ?? "Update failed" });
    }
  });

  apiRouter.patch("/capital/:id/comments", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { comments } = req.body;
    if (!id) return res.status(400).json({ error: "Missing article id" });
    if (typeof comments !== "string") return res.status(400).json({ error: "Missing or invalid comments" });
    if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
    try {
      const updated_at = new Date().toISOString();
      const { data: existing } = await supabase.from("capital_articles").select("airtable_id").eq("airtable_id", id).single();
      if (existing) {
        const { error } = await supabase.from("capital_articles").update({ comments, updated_at }).eq("airtable_id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("capital_articles").upsert(
          { airtable_id: id, comments, content: "", updated_at },
          { onConflict: "airtable_id" }
        );
        if (error) throw error;
      }
      cache.invalidate(CACHE_KEYS.CAPITAL_ARTICLES);
      cache.invalidate(CACHE_KEYS.CAPITAL_ARTICLES_DATA);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Capital update comments error:", err);
      res.status(500).json({ error: err?.message ?? "Update failed" });
    }
  });

  apiRouter.patch("/capital/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { title, excerpt } = req.body;
    if (!id) return res.status(400).json({ error: "Missing article id" });
    const hasTitle = typeof title === "string";
    const hasExcerpt = typeof excerpt === "string";
    if (!hasTitle && !hasExcerpt) {
      return res.status(400).json({ error: "Provide title and/or excerpt" });
    }
    if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
    try {
      const { data: existing } = await supabase.from("capital_articles").select("airtable_id").eq("airtable_id", id).maybeSingle();
      const updated_at = new Date().toISOString();
      const updateFields: Record<string, unknown> = { updated_at };
      if (hasTitle) {
        updateFields.title = title;
        updateFields.title_edited_in_portal = true;
      }
      if (hasExcerpt) {
        updateFields.excerpt = excerpt;
        updateFields.excerpt_edited_in_portal = true;
      }
      if (existing) {
        let { error: upErr } = await supabase.from("capital_articles").update(updateFields).eq("airtable_id", id);
        if (upErr && hasTitle && isSupabaseUnknownColumnError(upErr, "title_edited_in_portal")) {
          delete updateFields.title_edited_in_portal;
          ({ error: upErr } = await supabase.from("capital_articles").update(updateFields).eq("airtable_id", id));
        }
        if (upErr && hasExcerpt && isSupabaseUnknownColumnError(upErr, "excerpt_edited_in_portal")) {
          delete updateFields.excerpt_edited_in_portal;
          ({ error: upErr } = await supabase.from("capital_articles").update(updateFields).eq("airtable_id", id));
        }
        if (upErr) throw upErr;
      } else {
        const insertPayload: Record<string, unknown> = {
          airtable_id: id,
          content: "",
          ...updateFields,
        };
        let { error: inErr } = await supabase.from("capital_articles").insert(insertPayload);
        if (inErr && hasTitle && isSupabaseUnknownColumnError(inErr, "title_edited_in_portal")) {
          delete insertPayload.title_edited_in_portal;
          ({ error: inErr } = await supabase.from("capital_articles").insert(insertPayload));
        }
        if (inErr && hasExcerpt && isSupabaseUnknownColumnError(inErr, "excerpt_edited_in_portal")) {
          delete insertPayload.excerpt_edited_in_portal;
          ({ error: inErr } = await supabase.from("capital_articles").insert(insertPayload));
        }
        if (inErr) throw inErr;
      }
      cache.invalidate(CACHE_KEYS.CAPITAL_ARTICLES);
      cache.invalidate(CACHE_KEYS.CAPITAL_ARTICLES_DATA);
      cache.invalidate(CACHE_KEYS.CAPITAL_DASHBOARD_DATA);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Capital update title/excerpt error:", err);
      res.status(500).json({ error: err?.message ?? "Update failed" });
    }
  });
}
