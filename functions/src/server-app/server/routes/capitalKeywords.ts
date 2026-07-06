import express from "express";
import { cache, CACHE_KEYS, CACHE_TTL } from "../cache.js";
import { config } from "../config.js";
import * as db from "../db.js";
import { authenticateToken, requireAdmin } from "../auth.js";
import {
  capitalKeywordsFieldsFromBody,
  capitalKeywordsListCacheKey,
  companyBlankFormula,
  getProposedTopicsFieldList,
  invalidateCapitalKeywordsListCaches,
  normalizedCompanyFilterValue,
  proposedTopicsCompanyFieldName,
  proposedTopicsCompanyFromRecord,
  proposedTopicsSortFieldName,
  fetchProposedTopicsRecordsFirstPage,
  PROPOSED_TOPICS_COMPANY_1UPTICK,
  PROPOSED_TOPICS_COMPANY_ATFX,
} from "../capitalKeywords.js";
import { appendUserActivity } from "../userActivityLog.js";
import { buildTopicApprovedBatchEmailHtml, escapeHtml } from "../emailTemplates.js";

type SendResult = { sent: boolean; error?: string };

function authedUid(req: express.Request): string | undefined {
  return (req as express.Request & { uid?: string }).uid;
}

function clipTitle(t: unknown): string {
  if (typeof t !== "string") return "";
  const s = t.trim();
  if (!s) return "";
  return s.length > 64 ? `${s.slice(0, 61)}…` : s;
}

type RegisterCapitalKeywordsRoutesDeps = {
  airtable: any | null;
  capitalKeywordsTableId: string;
  sendTopicApprovedEmail: (to: string, topicTitle: string, topicSummary: string) => Promise<SendResult>;
  sendCustomEmail: (to: string, subject: string, text: string, html: string) => Promise<SendResult>;
  getAdminEmailsForNotification: () => Promise<string[]>;
  sendAdminTopicApprovedEmail: (to: string, topicTitle: string, topicSummary: string) => Promise<SendResult>;
  sendAdminTopicRejectedEmail: (to: string, topicTitle: string, topicSummary: string) => Promise<SendResult>;
  sendAdminTopicDirectionEmail: (to: string, directionText: string, fromEmail?: string) => Promise<SendResult>;
};

export function registerCapitalKeywordsRoutes(apiRouter: express.Router, deps: RegisterCapitalKeywordsRoutesDeps): void {
  const {
    airtable,
    capitalKeywordsTableId,
    sendTopicApprovedEmail,
    sendCustomEmail,
    getAdminEmailsForNotification,
    sendAdminTopicApprovedEmail,
    sendAdminTopicRejectedEmail,
    sendAdminTopicDirectionEmail,
  } = deps;

  // Capital dashboard: propose a new direction of topics (emails admins)
  apiRouter.post("/capitalkeywords/topic-direction", authenticateToken, async (req, res) => {
    const directionText = typeof req.body?.directionText === "string" ? req.body.directionText.trim() : "";
    if (!directionText) return res.status(400).json({ error: "Direction text is required" });
    if (directionText.length > 2000) return res.status(400).json({ error: "Direction text is too long (max 2000 chars)" });
    const fromEmail = typeof (req as any).userEmail === "string" ? ((req as any).userEmail as string) : undefined;
    try {
      const adminEmails = await getAdminEmailsForNotification();
      if (adminEmails.length === 0) {
        return res.status(503).json({ error: "No admin recipients configured" });
      }
      const results: { email: string; sent: boolean; error?: string }[] = [];
      for (const to of adminEmails) {
        const r = await sendAdminTopicDirectionEmail(to, directionText, fromEmail);
        results.push({ email: to, sent: r.sent, error: r.error });
      }
      const sentCount = results.filter((r) => r.sent).length;
      appendUserActivity(
        authedUid(req),
        `Submitted a new topic direction suggestion (${sentCount}/${adminEmails.length} emails sent)`
      );
      return res.json({ ok: true, sent: sentCount, total: adminEmails.length, results });
    } catch (err: any) {
      console.error("capitalkeywords topic-direction error:", err);
      appendUserActivity(authedUid(req), "Could not submit topic direction suggestion");
      return res.status(500).json({ error: err?.message ?? "Failed to submit suggestion" });
    }
  });

  // Capital keywords list (used by Capital + 1uptick Topics/Twitt pages)
  apiRouter.get("/capitalkeywords", authenticateToken, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }

    const cc = (req.headers["cache-control"] ?? "").toLowerCase();
    const pragma = (req.headers["pragma"] ?? "").toLowerCase();
    const forceRefresh =
      cc.includes("no-cache") || cc.includes("no-store") || pragma === "no-cache";
    const rawCompany = req.query.company;
    const companyParam =
      typeof rawCompany === "string"
        ? rawCompany.trim().toLowerCase()
        : Array.isArray(rawCompany) && typeof rawCompany[0] === "string"
          ? rawCompany[0].trim().toLowerCase()
          : "";
    const companyFilter =
      companyParam === PROPOSED_TOPICS_COMPANY_1UPTICK
        ? PROPOSED_TOPICS_COMPANY_1UPTICK
        : companyParam === PROPOSED_TOPICS_COMPANY_ATFX
          ? PROPOSED_TOPICS_COMPANY_ATFX
          : "";
    const dataCacheKey = capitalKeywordsListCacheKey(companyFilter);
    /** ATFX list is edited/deleted in Airtable outside the app — skip in-memory + browser caching so rows stay in sync. */
    const atfxTopicsList = companyFilter === PROPOSED_TOPICS_COMPANY_ATFX;
    const useServerListCache = !atfxTopicsList && !forceRefresh;

    if (useServerListCache) {
      const cachedData = cache.get<any[]>(dataCacheKey);
      if (cachedData) {
        res.setHeader("Cache-Control", "private, max-age=120");
        res.setHeader("ETag", cachedData.etag);
        return res.json(cachedData.data);
      }
    }

    try {
      const companyCol = proposedTopicsCompanyFieldName();
      const sortField = proposedTopicsSortFieldName();
      let filterByFormula: string | undefined;
      if (companyFilter === PROPOSED_TOPICS_COMPANY_1UPTICK) {
        filterByFormula = `LOWER({${companyCol}}) = "${PROPOSED_TOPICS_COMPANY_1UPTICK}"`;
      } else if (companyFilter === PROPOSED_TOPICS_COMPANY_ATFX) {
        filterByFormula = `LOWER({${companyCol}}) = "${PROPOSED_TOPICS_COMPANY_ATFX}"`;
      } else {
        filterByFormula = companyBlankFormula();
      }

      const records = await fetchProposedTopicsRecordsFirstPage(airtable, capitalKeywordsTableId, {
        maxRecords: 100,
        sortField,
        filterByFormula,
        fields: getProposedTopicsFieldList(),
      });

      let data = records.map((record: any) => {
        let createDate = "";
        const raw =
          record.get(sortField) ??
          record.get("Create date");
        if (raw != null && raw !== "") {
          createDate = typeof raw === "string" ? raw : raw?.start ?? raw?.end ?? String(raw);
        }
        if (!createDate && record.fields && typeof record.fields === "object") {
          for (const [key, value] of Object.entries(record.fields)) {
            if (/create|date|created/i.test(key) && value != null && value !== "") {
              const v =
                typeof value === "string"
                  ? value
                  : value && typeof value === "object" && ("start" in value || "end" in value)
                    ? (value as any).start ?? (value as any).end
                    : String(value);
              if (v) {
                createDate = v;
                break;
              }
            }
          }
        }
        return {
          id: record.id,
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
          createDate,
          status: record.get("Status") ?? "",
          approve: record.get("Approve") ?? "",
          custom: record.get("Custome") ?? "",
          company: proposedTopicsCompanyFromRecord(record),
        };
      });

      if (companyFilter) {
        data = data.filter((row: any) => normalizedCompanyFilterValue(row.company || "") === companyFilter);
      } else {
        data = data.filter((row: any) => !row.company || normalizedCompanyFilterValue(row.company) === "");
      }

      const structureKey = CACHE_KEYS.CAPITAL_KEYWORDS_STRUCTURE;
      if (!cache.get(structureKey)) {
        cache.set(
          structureKey,
          { tableId: capitalKeywordsTableId, fields: getProposedTopicsFieldList() },
          CACHE_TTL.CAPITAL_STRUCTURE
        );
      }
      if (atfxTopicsList) {
        res.setHeader("Cache-Control", "private, no-store");
      } else {
        const etag = cache.set(dataCacheKey, data, CACHE_TTL.CAPITAL);
        res.setHeader("Cache-Control", "private, max-age=120");
        res.setHeader("ETag", etag);
      }
      res.json(data);
    } catch (err) {
      const ae = err as { statusCode?: number; error?: string; message?: string };
      console.error("Airtable capitalkeywords error:", ae?.message || err, ae?.statusCode, ae?.error);
      res.status(500).json({ error: "Failed to fetch capitalkeywords" });
    }
  });

  apiRouter.patch("/capitalkeywords/:id", authenticateToken, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing record id" });
    const fields = capitalKeywordsFieldsFromBody(req.body || {});
    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }
    try {
      const table = airtable(capitalKeywordsTableId) as any;
      const record = await table.update(id, fields);
      const get = (name: string) => (record && typeof record.get === "function" ? record.get(name) : undefined) ?? "";
      const createDate = record && typeof record.get === "function" ? record.get("Create date") : null;
      invalidateCapitalKeywordsListCaches();
      const hint = clipTitle(req.body?.title);
      appendUserActivity(authedUid(req), hint ? `Saved topic: ${hint}` : "Saved your topic changes");
      res.setHeader("Content-Type", "application/json").json({
        id: record?.id ?? id,
        source: get("Source"),
        title: get("Title"),
        summary: get("summary"),
        socialHook: get("Social_hook"),
        keyword1: get("Keyword1"),
        keyword2: get("Keyword2"),
        keyword3: get("Keyword3"),
        keywordTag: get("Keyword_tag"),
        psyTrigger: get("psy_trigger"),
        stockTag: get("Stock_tag"),
        createDate: createDate != null ? String(createDate) : "",
        custom: get("Custome"),
      });
    } catch (err: any) {
      console.error("Airtable capitalkeywords update error:", err);
      appendUserActivity(authedUid(req), `Could not save topic — ${String(err?.message ?? "something went wrong").slice(0, 120)}`);
      res.status(500).json({ error: err?.message ?? "Failed to update record" });
    }
  });

  apiRouter.patch("/capitalkeywords/:id/approve", authenticateToken, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing record id" });
    try {
      const table = airtable(capitalKeywordsTableId) as any;
      await table.update(id, { Approve: "Approved" });
      invalidateCapitalKeywordsListCaches();
      appendUserActivity(authedUid(req), "Marked this topic as Capital-approved");
      res.setHeader("Content-Type", "application/json").json({ ok: true });
    } catch (err: any) {
      console.error("Airtable capitalkeywords approve error:", err);
      appendUserActivity(authedUid(req), `Could not mark Capital-approved — ${String(err?.message ?? "something went wrong").slice(0, 120)}`);
      res.status(500).json({ error: err?.message ?? "Failed to approve record" });
    }
  });

  apiRouter.patch("/capitalkeywords/:id/unapprove", authenticateToken, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing record id" });
    try {
      const table = airtable(capitalKeywordsTableId) as any;
      await table.update(id, { Approve: "" });
      invalidateCapitalKeywordsListCaches();
      appendUserActivity(authedUid(req), "Cleared the extra Capital approval on this topic");
      res.setHeader("Content-Type", "application/json").json({ ok: true });
    } catch (err: any) {
      console.error("Airtable capitalkeywords unapprove error:", err);
      appendUserActivity(authedUid(req), `Could not clear Capital approval — ${String(err?.message ?? "something went wrong").slice(0, 120)}`);
      res.status(500).json({ error: err?.message ?? "Failed to clear approval" });
    }
  });

  // Email recipients for topic-approved notification: admins + capital group users (admin only)
  apiRouter.get("/capitalkeywords/email-recipients", authenticateToken, requireAdmin, async (_req, res) => {
    try {
      const rows = await db.listUserRolesWithGroups();
      const admins = rows
        .filter((r) => r.role === "admin" && r.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))
        .map((r) => ({ email: r.email! }));
      const capitalGroupName = "capital";
      const capitalUsers = rows
        .filter(
          (r) =>
            r.role !== "admin" &&
            r.email &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email) &&
            (r.group_name || "").toLowerCase().trim() === capitalGroupName
        )
        .map((r) => ({ email: r.email! }));
      res.json({ admins, capitalUsers });
    } catch (err: any) {
      console.error("capitalkeywords email-recipients error:", err);
      res.status(500).json({ error: err?.message ?? "Failed to load recipients" });
    }
  });

  // Send topic-approved notification emails (admin only). Call after approving the record.
  apiRouter.post("/capitalkeywords/:id/notify-approved", authenticateToken, requireAdmin, async (req, res) => {
    const { title, summary, adminEmails, userEmails } = req.body || {};
    const topicTitle = typeof title === "string" ? title.trim() : "";
    const topicSummary = typeof summary === "string" ? summary.trim() : "";
    const adminList = Array.isArray(adminEmails) ? adminEmails.filter((e: unknown) => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) : [];
    const userList = Array.isArray(userEmails) ? userEmails.filter((e: unknown) => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) : [];
    const allEmails = [...new Set([...adminList, ...userList])];
    if (allEmails.length === 0) {
      return res.status(400).json({ error: "Select at least one recipient" });
    }
    const results: { email: string; sent: boolean; error?: string }[] = [];
    for (const email of allEmails) {
      const result = await sendTopicApprovedEmail(email, topicTitle, topicSummary);
      results.push({ email, sent: result.sent, error: result.error });
    }
    const sentCount = results.filter((r) => r.sent).length;
    appendUserActivity(
      authedUid(req),
      `Sent ${sentCount} of ${allEmails.length} emails about this approved topic${clipTitle(topicTitle) ? `: ${clipTitle(topicTitle)}` : ""}`
    );
    res.json({ sent: sentCount, total: allEmails.length, results });
  });

  type ApprovedTopicInput = { title: string; summary: string; socialHook: string };
  const normalizeEmailList = (raw: unknown): string[] =>
    Array.isArray(raw)
      ? raw.filter((e: unknown) => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      : [];

  apiRouter.post("/capitalkeywords/notify-approved-batch/draft", authenticateToken, requireAdmin, async (req, res) => {
    const { topics, adminEmails, userEmails, customMessage } = req.body || {};
    const adminList = normalizeEmailList(adminEmails);
    const userList = normalizeEmailList(userEmails);
    const allEmails = [...new Set([...adminList, ...userList])];
    if (allEmails.length === 0) return res.status(400).json({ error: "Select at least one recipient" });

    const topicList: ApprovedTopicInput[] = Array.isArray(topics)
      ? topics
          .map((t: any) => ({
            title: typeof t?.title === "string" ? t.title.trim() : "",
            summary: typeof t?.summary === "string" ? t.summary.trim() : "",
            socialHook: typeof t?.socialHook === "string" ? t.socialHook.trim() : "",
          }))
          .filter((t) => t.title || t.summary || t.socialHook)
          .slice(0, 20)
      : [];
    if (topicList.length === 0) return res.status(400).json({ error: "No topics provided" });

    const rawMsg = typeof customMessage === "string" ? customMessage.trim() : "";
    const customMessageHtml = rawMsg
      ? `<div style="margin:0;white-space:pre-wrap;word-break:break-word;">${escapeHtml(rawMsg)}</div>`
      : "";

    const base = config.appBaseUrl.replace(/\/$/, "");
    const loginUrl = `${base}/login`;
    const subject = `Topics for Capital: ${topicList.length} topic${topicList.length > 1 ? "s" : ""} ready for review`;
    const textTopics = topicList
      .map((t, i) => `${i + 1}. ${t.title || "—"}\n   ${t.socialHook || t.summary || "No description."}`)
      .join("\n\n");
    const noteTail = rawMsg ? `\n\n${rawMsg}\n\n` : `\n\n`;
    const text = `Dear {{USER_NAME}},\n\nNew topic proposals have been approved in Topics for Capital.\n\nPending topics (${topicList.length}):\n\n${textTopics}${noteTail}Sign in to view and continue:\n${loginUrl}\n\n— Newsa.io`;
    const html = buildTopicApprovedBatchEmailHtml({ loginUrl, topics: topicList, customMessageHtml });

    res.json({ subject, text, html, recipients: allEmails.length });
  });

  apiRouter.post("/capitalkeywords/notify-approved-batch/send", authenticateToken, requireAdmin, async (req, res) => {
    const { subject, text, html, adminEmails, userEmails } = req.body || {};
    const subj = typeof subject === "string" ? subject.trim() : "";
    const txt = typeof text === "string" ? text : "";
    const htm = typeof html === "string" ? html : "";
    if (!subj) return res.status(400).json({ error: "Subject is required" });
    if (!txt && !htm) return res.status(400).json({ error: "Email body is required" });
    const adminList = normalizeEmailList(adminEmails);
    const userList = normalizeEmailList(userEmails);
    const allEmails = [...new Set([...adminList, ...userList])];
    if (allEmails.length === 0) return res.status(400).json({ error: "Select at least one recipient" });

    const greetingNameFromEmail = (addr: string): string => {
      const local = (addr || "").split("@")[0] || "";
      const first = local.split(/[._-]/)[0] || "there";
      if (!first) return "there";
      return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    };

    console.log("notify-approved-batch/send: sending to", allEmails.length, "recipients");
    const results: { email: string; sent: boolean; error?: string }[] = [];
    for (const email of allEmails) {
      const name = greetingNameFromEmail(email);
      const personalizedTxt = (txt || "").replaceAll("{{USER_NAME}}", name);
      const personalizedHtml = (htm || "").replaceAll("{{USER_NAME}}", escapeHtml(name));
      const result = await sendCustomEmail(email, subj, personalizedTxt, personalizedHtml);
      if (!result.sent) console.error("notify-approved-batch/send: failed to", email, result.error);
      results.push({ email, sent: result.sent, error: result.error });
    }
    const sentCount = results.filter((r) => r.sent).length;
    console.log("notify-approved-batch/send: sent", sentCount, "of", allEmails.length);
    appendUserActivity(authedUid(req), `Sent ${sentCount} of ${allEmails.length} batch notification email(s)`);
    res.json({ sent: sentCount, total: allEmails.length, results });
  });

  apiRouter.patch("/capitalkeywords/:id/status-approve", authenticateToken, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing record id" });
    try {
      const table = airtable(capitalKeywordsTableId) as any;
      const existing = await table.find(id);
      const skipAdminEmailsForAtfx =
        normalizedCompanyFilterValue(proposedTopicsCompanyFromRecord(existing) || "") === PROPOSED_TOPICS_COMPANY_ATFX;
      await table.update(id, { Status: "Approved" });
      invalidateCapitalKeywordsListCaches();
      cache.invalidate(CACHE_KEYS.CAPITAL_PENDING);
      cache.invalidate(CACHE_KEYS.CAPITAL_APPROVED);
      cache.invalidate(CACHE_KEYS.CAPITAL_STATS);
      cache.invalidate(CACHE_KEYS.CAPITAL_DASHBOARD_DATA);
      cache.invalidate(CACHE_KEYS.ATFX_PENDING);
      cache.invalidate(CACHE_KEYS.ATFX_APPROVED);
      cache.invalidate(CACHE_KEYS.ATFX_STATS);
      cache.invalidate(CACHE_KEYS.ATFX_DASHBOARD_DATA);
      const topicTitle = typeof req.body?.title === "string" ? req.body.title.trim() : "";
      const topicSummary = typeof req.body?.summary === "string" ? req.body.summary.trim() : "";
      if (!skipAdminEmailsForAtfx) {
        getAdminEmailsForNotification().then((emails) => {
          emails.forEach((to) => sendAdminTopicApprovedEmail(to, topicTitle, topicSummary).catch((e) => console.error("Admin approve email to", to, e)));
        }).catch((e) => console.error("Admin emails for approve notification:", e));
      }
      appendUserActivity(authedUid(req), topicTitle ? `Topic approved: ${clipTitle(topicTitle)}` : "Topic approved");
      res.setHeader("Content-Type", "application/json").json({ ok: true });
    } catch (err: any) {
      console.error("Airtable capitalkeywords status-approve error:", err);
      appendUserActivity(authedUid(req), `Could not approve topic — ${String(err?.message ?? "something went wrong").slice(0, 120)}`);
      res.status(500).json({ error: err?.message ?? "Failed to approve record" });
    }
  });

  /** Trigger n8n webhook (Basic auth + Record_ID header), then set Status to Approved in Airtable. */
  apiRouter.post("/capitalkeywords/:id/n8n-approve", authenticateToken, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing record id" });
    const wh = config.n8nApproveWebhook;
    if (!wh.url) {
      return res.status(503).json({
        error: "n8n approve webhook URL is not configured (set N8N_APPROVE_WEBHOOK_URL).",
      });
    }
    try {
      const tableForCompany = airtable(capitalKeywordsTableId) as any;
      const existingForCompany = await tableForCompany.find(id);
      const skipAdminEmailsForAtfx =
        normalizedCompanyFilterValue(proposedTopicsCompanyFromRecord(existingForCompany) || "") ===
        PROPOSED_TOPICS_COMPANY_ATFX;
      const headers: Record<string, string> = {
        Record_ID: id,
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      if (wh.user && wh.password) {
        headers.Authorization = `Basic ${Buffer.from(`${wh.user}:${wh.password}`, "utf8").toString("base64")}`;
      }
      let webhookRes: Response;
      try {
        webhookRes = await fetch(wh.url, {
          method: "POST",
          headers,
          body: JSON.stringify({ Record_ID: id }),
          // Prevent "Approve" hanging forever if n8n is slow/unreachable.
          signal: AbortSignal.timeout(15_000),
        });
      } catch (e: any) {
        const isTimeout = e?.name === "TimeoutError" || e?.name === "AbortError";
        const msg = isTimeout ? "n8n webhook timed out" : "n8n webhook request failed";
        console.error("n8n approve webhook fetch error:", msg, e?.message ?? e);
        appendUserActivity(
          authedUid(req),
          "The automated approval step did not complete (could not reach n8n). Please try again or use the standard Approve button."
        );
        return res.status(isTimeout ? 504 : 502).json({
          error: msg,
          detail: String(e?.message ?? e ?? "").slice(0, 500),
          hint:
            "Check that your n8n workflow is Active and the Production Webhook URL is reachable from the internet (not a local-only URL).",
        });
      }
      if (!webhookRes.ok) {
        const detail = await webhookRes.text().catch(() => "");
        console.error("n8n approve webhook error:", webhookRes.status, detail);
        const is404 = webhookRes.status === 404;
        const is401 = webhookRes.status === 401;
        const hint = is404
          ? "n8n /webhook-test/ URLs only work while the workflow is open and waiting for a test run. For the portal, set N8N_APPROVE_WEBHOOK_URL to the Production Webhook URL from the Webhook node (path uses /webhook/ not /webhook-test/) and turn the workflow Active ON."
          : is401
            ? "n8n rejected the request without valid Basic Auth. Set N8N_APPROVE_WEBHOOK_USER and N8N_APPROVE_WEBHOOK_PASSWORD on the Cloud Function (same values as your n8n Webhook node credentials / local .env)."
            : undefined;
        appendUserActivity(
          authedUid(req),
          "The automated approval step did not complete. Please try again or use the standard Approve button."
        );
        return res.status(502).json({
          error: `n8n webhook failed (${webhookRes.status})`,
          detail: detail.slice(0, 500),
          ...(hint ? { hint } : {}),
        });
      }
      const table = airtable(capitalKeywordsTableId) as any;
      await table.update(id, { Status: "Approved" });
      invalidateCapitalKeywordsListCaches();
      cache.invalidate(CACHE_KEYS.CAPITAL_PENDING);
      cache.invalidate(CACHE_KEYS.CAPITAL_APPROVED);
      cache.invalidate(CACHE_KEYS.CAPITAL_STATS);
      cache.invalidate(CACHE_KEYS.CAPITAL_DASHBOARD_DATA);
      cache.invalidate(CACHE_KEYS.ATFX_PENDING);
      cache.invalidate(CACHE_KEYS.ATFX_APPROVED);
      cache.invalidate(CACHE_KEYS.ATFX_STATS);
      cache.invalidate(CACHE_KEYS.ATFX_DASHBOARD_DATA);
      const topicTitle = typeof req.body?.title === "string" ? req.body.title.trim() : "";
      const topicSummary = typeof req.body?.summary === "string" ? req.body.summary.trim() : "";
      if (!skipAdminEmailsForAtfx) {
        getAdminEmailsForNotification()
          .then((emails) => {
            emails.forEach((to) =>
              sendAdminTopicApprovedEmail(to, topicTitle, topicSummary).catch((e) => console.error("Admin approve email to", to, e))
            );
          })
          .catch((e) => console.error("Admin emails for approve notification:", e));
      }
      appendUserActivity(authedUid(req), topicTitle ? `Topic approved: ${clipTitle(topicTitle)}` : "Topic approved");
      res.setHeader("Content-Type", "application/json").json({ ok: true });
    } catch (err: any) {
      console.error("n8n approve route error:", err);
      appendUserActivity(authedUid(req), `Could not finish approval — ${String(err?.message ?? "something went wrong").slice(0, 120)}`);
      res.status(500).json({ error: err?.message ?? "Failed to complete approval" });
    }
  });

  apiRouter.patch("/capitalkeywords/:id/status-unapprove", authenticateToken, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing record id" });
    try {
      const table = airtable(capitalKeywordsTableId) as any;
      await table.update(id, { Status: "" });
      invalidateCapitalKeywordsListCaches();
      cache.invalidate(CACHE_KEYS.CAPITAL_PENDING);
      cache.invalidate(CACHE_KEYS.CAPITAL_APPROVED);
      cache.invalidate(CACHE_KEYS.CAPITAL_STATS);
      cache.invalidate(CACHE_KEYS.CAPITAL_DASHBOARD_DATA);
      cache.invalidate(CACHE_KEYS.ATFX_PENDING);
      cache.invalidate(CACHE_KEYS.ATFX_APPROVED);
      cache.invalidate(CACHE_KEYS.ATFX_STATS);
      cache.invalidate(CACHE_KEYS.ATFX_DASHBOARD_DATA);
      appendUserActivity(authedUid(req), "Topic moved back to pending (approval cleared)");
      res.setHeader("Content-Type", "application/json").json({ ok: true });
    } catch (err: any) {
      console.error("Airtable capitalkeywords status-unapprove error:", err);
      appendUserActivity(authedUid(req), `Could not clear approval — ${String(err?.message ?? "something went wrong").slice(0, 120)}`);
      res.status(500).json({ error: err?.message ?? "Failed to clear approval" });
    }
  });

  apiRouter.patch("/capitalkeywords/:id/status-reject", authenticateToken, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing record id" });
    try {
      const table = airtable(capitalKeywordsTableId) as any;
      const existing = await table.find(id);
      const skipAdminEmailsForAtfx =
        normalizedCompanyFilterValue(proposedTopicsCompanyFromRecord(existing) || "") === PROPOSED_TOPICS_COMPANY_ATFX;
      await table.update(id, { Status: "Rejected" });
      invalidateCapitalKeywordsListCaches();
      cache.invalidate(CACHE_KEYS.CAPITAL_PENDING);
      cache.invalidate(CACHE_KEYS.CAPITAL_APPROVED);
      cache.invalidate(CACHE_KEYS.CAPITAL_STATS);
      cache.invalidate(CACHE_KEYS.CAPITAL_DASHBOARD_DATA);
      cache.invalidate(CACHE_KEYS.ATFX_PENDING);
      cache.invalidate(CACHE_KEYS.ATFX_APPROVED);
      cache.invalidate(CACHE_KEYS.ATFX_STATS);
      cache.invalidate(CACHE_KEYS.ATFX_DASHBOARD_DATA);
      const topicTitle = typeof req.body?.title === "string" ? req.body.title.trim() : "";
      const topicSummary = typeof req.body?.summary === "string" ? req.body.summary.trim() : "";
      if (!skipAdminEmailsForAtfx) {
        getAdminEmailsForNotification().then((emails) => {
          emails.forEach((to) => sendAdminTopicRejectedEmail(to, topicTitle, topicSummary).catch((e) => console.error("Admin reject email to", to, e)));
        }).catch((e) => console.error("Admin emails for reject notification:", e));
      }
      appendUserActivity(authedUid(req), topicTitle ? `Topic rejected: ${clipTitle(topicTitle)}` : "Topic rejected");
      res.setHeader("Content-Type", "application/json").json({ ok: true });
    } catch (err: any) {
      console.error("Airtable capitalkeywords status-reject error:", err);
      appendUserActivity(authedUid(req), `Could not reject topic — ${String(err?.message ?? "something went wrong").slice(0, 120)}`);
      res.status(500).json({ error: err?.message ?? "Failed to reject record" });
    }
  });
}
