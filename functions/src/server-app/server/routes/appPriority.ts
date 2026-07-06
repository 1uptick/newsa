import express from "express";
import * as db from "../db.js";
import { config } from "../config.js";
import { authenticateToken, requireAdmin } from "../auth.js";
import { appendN8nCredentialHeaders } from "../n8nWebhookHeaders.js";

type RegisterAppPriorityRoutesDeps = {
  airtable: any | null;
};

function getOneuptickArticlesTableId(): string {
  const id = (config.airtable.oneuptickArticlesTableId || "tblFjxMEFtJvsyLZh").trim();
  return id || "tblFjxMEFtJvsyLZh";
}

export function registerAppPriorityRoutes(app: express.Application, deps: RegisterAppPriorityRoutesDeps): void {
  const { airtable } = deps;

  // Explicit /api/admin/groups routes on app so they always match (before router mount)
  app.get("/api/admin/groups", authenticateToken, requireAdmin, async (_req: express.Request, res: express.Response) => {
    const rows = await db.listGroups();
    res.json(rows);
  });

  app.post("/api/admin/groups", authenticateToken, requireAdmin, async (req: express.Request, res: express.Response) => {
    const { name } = req.body;
    const nameStr = typeof name === "string" ? name.trim() : "";
    if (!nameStr) {
      return res.status(400).json({ error: "Group name is required" });
    }
    try {
      const row = await db.insertGroup(nameStr);
      res.status(201).json(row);
    } catch (e: any) {
      if (e?.message === "UNIQUE_GROUP_NAME") {
        return res.status(400).json({ error: "A group with this name already exists" });
      }
      throw e;
    }
  });

  /** Oneuptick article publish -> n8n (registered on app so it always matches; same pattern as /api/capitalkeywords/generate). */
  app.post("/api/oneuptick/articles/:id/publish", authenticateToken, async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing article id" });
    const whUrl = config.oneuptickPublishWebhook.url;
    const cred = config.oneuptickPublishWebhook;
    if (!whUrl) {
      return res.status(503).json({
        error: "Publish webhook URL not configured (set N8N_ONEUPTICK_PUBLISH_WEBHOOK_URL).",
      });
    }
    if (!airtable) {
      return res.status(503).json({ error: "Airtable not configured." });
    }
    try {
      const record = await airtable(getOneuptickArticlesTableId()).find(id);
      const thumbRaw = record.get("thumb_url");
      const thumbStr =
        typeof thumbRaw === "string" ? thumbRaw.trim() : String(thumbRaw ?? "").trim();
      if (!thumbStr) {
        return res.status(400).json({
          error: "Set a thumbnail URL (thumb_url) before publishing.",
        });
      }
    } catch (e: any) {
      const status = e?.statusCode === 404 || e?.error === "NOT_FOUND" ? 404 : 500;
      return res.status(status).json({
        error: status === 404 ? "Article not found" : e?.message ?? "Failed to load article",
      });
    }
    try {
      const headers: Record<string, string> = {
        Record_ID: id,
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      appendN8nCredentialHeaders(headers, cred.user, cred.password);
      const webhookRes = await fetch(whUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ Record_ID: id }),
      });
      if (!webhookRes.ok) {
        const detail = await webhookRes.text().catch(() => "");
        console.error("n8n oneuptick publish webhook error:", webhookRes.status, detail);
        const is404 = webhookRes.status === 404;
        const is401 = webhookRes.status === 401;
        const hint = is404
          ? "Use the production Webhook URL (/webhook/ not /webhook-test/) and ensure the workflow is active."
          : is401
            ? "n8n rejected auth. Set N8N_ONEUPTICK_PUBLISH_WEBHOOK_USER and N8N_ONEUPTICK_PUBLISH_WEBHOOK_PASSWORD (or N8N_APPROVE_WEBHOOK_*). The server sends Authorization: Basic … and Credential: login:password."
            : undefined;
        return res.status(502).json({
          error: `Publish webhook failed (${webhookRes.status})`,
          detail: detail.slice(0, 500),
          ...(hint ? { hint } : {}),
        });
      }
      res.setHeader("Content-Type", "application/json").json({ ok: true });
    } catch (err: any) {
      console.error("oneuptick publish route error:", err);
      res.status(500).json({ error: err?.message ?? "Publish failed" });
    }
  });
}
