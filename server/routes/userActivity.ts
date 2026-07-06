import express from "express";
import { authenticateToken } from "../auth.js";
import { appendUserActivity, getUserActivitySnapshot } from "../userActivityLog.js";

export function registerUserActivityRoutes(apiRouter: express.Router): void {
  apiRouter.get("/auth/activity", authenticateToken, (req, res) => {
    try {
      const uid = (req as express.Request & { uid?: string }).uid;
      res.json(getUserActivitySnapshot(uid));
    } catch (e) {
      console.error("[auth/activity] GET failed:", (e as Error)?.message ?? e);
      res.status(500).json({ error: "Activity snapshot failed", code: "ACTIVITY_ERROR" });
    }
  });

  apiRouter.post("/auth/activity", authenticateToken, (req, res) => {
    try {
      const uid = (req as express.Request & { uid?: string }).uid;
      const msg = typeof req.body?.message === "string" ? req.body.message.trim().slice(0, 400) : "";
      if (!msg) {
        return res.status(400).json({ error: "message is required" });
      }
      appendUserActivity(uid, msg);
      res.json({ ok: true });
    } catch (e) {
      console.error("[auth/activity] POST failed:", (e as Error)?.message ?? e);
      res.status(500).json({ error: "Activity update failed", code: "ACTIVITY_ERROR" });
    }
  });
}
