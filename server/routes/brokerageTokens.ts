import express from "express";
import { authenticateToken, requireAdmin } from "../auth.js";
import {
  BROKERAGE_ATFX,
  BROKERAGE_SOURCE_LABELS,
  DEFAULT_BROKERAGE_MULTIPLIERS,
  type BrokerageTokenFeature,
  type BrokerageTokenSource,
  getBrokerageTokenBalance,
  getBrokerageTokenConfig,
  listBrokerageTokenConfigs,
  listBrokerageTokenUsageLogsPage,
  upsertBrokerageTokenConfig,
} from "../brokerageTokenBilling.js";

const FEATURE_KEYS = Object.keys(DEFAULT_BROKERAGE_MULTIPLIERS) as BrokerageTokenFeature[];

function parseBrokerageId(raw: unknown): string {
  const id = typeof raw === "string" ? raw.trim().toLowerCase() : BROKERAGE_ATFX;
  return id || BROKERAGE_ATFX;
}

function parseSource(raw: unknown): BrokerageTokenSource | "all" {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (FEATURE_KEYS.includes(s as BrokerageTokenFeature)) return s as BrokerageTokenSource;
  return "all";
}

export function registerBrokerageTokenRoutes(apiRouter: express.Router): void {
  apiRouter.get("/brokerage/:brokerageId/tokens/balance", authenticateToken, async (req, res) => {
    try {
      const brokerageId = parseBrokerageId(req.params.brokerageId);
      const balance = await getBrokerageTokenBalance(brokerageId);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.json(balance);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load token balance";
      const status = message.includes("Unknown brokerage") ? 404 : 500;
      res.status(status).json({ error: message });
    }
  });

  apiRouter.get("/admin/brokerage-tokens/config", authenticateToken, requireAdmin, async (_req, res) => {
    try {
      const configs = await listBrokerageTokenConfigs();
      res.json({ configs, sourceLabels: BROKERAGE_SOURCE_LABELS, defaultMultipliers: DEFAULT_BROKERAGE_MULTIPLIERS });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load token config" });
    }
  });

  apiRouter.put("/admin/brokerage-tokens/config/:brokerageId", authenticateToken, requireAdmin, async (req, res) => {
    try {
      const brokerageId = parseBrokerageId(req.params.brokerageId);
      const body = req.body ?? {};
      const multipliersRaw = body.multipliers;
      const multipliers =
        multipliersRaw && typeof multipliersRaw === "object"
          ? FEATURE_KEYS.reduce(
              (acc, key) => {
                const v = (multipliersRaw as Record<string, unknown>)[key];
                if (typeof v === "number" && Number.isFinite(v) && v >= 0) acc[key] = v;
                return acc;
              },
              { ...DEFAULT_BROKERAGE_MULTIPLIERS }
            )
          : undefined;

      const saved = await upsertBrokerageTokenConfig({
        brokerage_id: brokerageId,
        display_name: typeof body.display_name === "string" ? body.display_name.trim() : undefined,
        monthly_token_limit:
          typeof body.monthly_token_limit === "number"
            ? body.monthly_token_limit
            : typeof body.monthly_token_limit === "string"
              ? Number(body.monthly_token_limit)
              : undefined,
        billing_cycle_start_date:
          typeof body.billing_cycle_start_date === "string" ? body.billing_cycle_start_date.slice(0, 10) : undefined,
        multipliers,
      });
      res.json(saved);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Failed to save token config" });
    }
  });

  apiRouter.get("/admin/brokerage-tokens/usage", authenticateToken, requireAdmin, async (req, res) => {
    try {
      const brokerageId = parseBrokerageId(req.query.brokerageId);
      const daysRaw = typeof req.query.days === "string" ? Number(req.query.days) : 30;
      const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 365) : 30;
      const source = parseSource(req.query.source);
      const pageRaw = typeof req.query.page === "string" ? Number(req.query.page) : 1;
      const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
      const pageSizeRaw = typeof req.query.pageSize === "string" ? Number(req.query.pageSize) : 25;
      const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(Math.max(Math.floor(pageSizeRaw), 1), 100) : 25;
      const [usagePage, balance, tokenConfig] = await Promise.all([
        listBrokerageTokenUsageLogsPage(brokerageId, { days, source, page, pageSize }),
        getBrokerageTokenBalance(brokerageId),
        getBrokerageTokenConfig(brokerageId),
      ]);
      res.json({
        logs: usagePage.logs,
        total: usagePage.total,
        page: usagePage.page,
        pageSize: usagePage.pageSize,
        totals: usagePage.totals,
        balance,
        config: tokenConfig,
        sourceLabels: BROKERAGE_SOURCE_LABELS,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Failed to load token usage" });
    }
  });
}
