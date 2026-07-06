import express from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authenticateToken } from "../auth.js";
import { cache, CACHE_KEYS, CACHE_TTL } from "../cache.js";
import { loadAtfxDashboardWorkspace } from "../atfxDashboardWorkspace.js";
import type { AtfxDashboardWorkspacePayload } from "../atfxDashboardWorkspace.js";

type RegisterAtfxDashboardWorkspaceDeps = {
  supabase: SupabaseClient | null;
};

export function registerAtfxDashboardWorkspaceRoutes(
  apiRouter: express.Router,
  deps: RegisterAtfxDashboardWorkspaceDeps
): void {
  const { supabase } = deps;

  apiRouter.get("/atfx/dashboard/workspace", authenticateToken, async (req, res) => {
    const uid = (req as express.Request & { uid?: string }).uid;
    if (!supabase || !uid) {
      return res.status(503).json({ error: "Database not configured." });
    }

    const forceRefresh = req.headers["cache-control"]?.includes("no-cache");
    const cacheKey = CACHE_KEYS.ATFX_DASHBOARD_WORKSPACE(uid);

    if (!forceRefresh) {
      const cached = cache.get<AtfxDashboardWorkspacePayload>(cacheKey);
      if (cached) {
        res.setHeader("Cache-Control", "private, max-age=60");
        res.setHeader("ETag", cached.etag);
        return res.json(cached.data);
      }
    }

    try {
      const data = await loadAtfxDashboardWorkspace(supabase, uid);
      const etag = cache.set(cacheKey, data, CACHE_TTL.ATFX_DASHBOARD_WORKSPACE);
      res.setHeader("Cache-Control", "private, max-age=60");
      res.setHeader("ETag", etag);
      res.json(data);
    } catch (err) {
      console.error("[atfx/dashboard/workspace]", err);
      const message = err instanceof Error ? err.message : "Failed to load dashboard workspace";
      const status = message.includes("not configured") ? 503 : 500;
      res.status(status).json({ error: message });
    }
  });
}
