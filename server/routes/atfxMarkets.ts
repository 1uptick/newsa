import express from "express";
import { authenticateToken } from "../auth.js";
import {
  fetchMarketMapData,
  refreshMarketMapDataFromServer,
} from "../atfxMarketMap.js";
import { runAtfxQuickAnalysis, type QuickAnalysisProgressSink } from "../atfxQuickAnalysis.js";
import { parseOverallMarketSegments, overallMarketSymbolForSegments, runAtfxOverallMarketReport } from "../atfxOverallMarketReport.js";
import { parseQuickAnalysisLookback } from "../atfxQuickAnalysisLookback.js";
import { startSseResponse, writeSse } from "../sseHelpers.js";
import {
  getAtfxQuickAnalysisById,
  listAtfxQuickAnalyses,
  listAtfxQuickAnalysisSummaries,
  rowToQuickAnalysisResult,
  rowToQuickAnalysisSummary,
  saveAtfxQuickAnalysis,
  updateAtfxQuickAnalysisTranslations,
} from "../atfxQuickAnalysisDb.js";
import {
  fetchMarketMovers,
  GAINERS_LOSERS_INDEXES,
  parseMarketMoversCategory,
} from "../atfxMarketMovers.js";
import { searchAtfxSymbols } from "../atfxSymbolSearch.js";
import { fetchForexPairQuotes } from "../atfxForexPairQuotes.js";
import {
  translateQuickAnalysisReportMarkdown,
  parseQuickAnalysisTranslateLocale,
} from "../atfxQuickAnalysisTranslate.js";
import { sendQuickAnalysisToTelegramChannel } from "../atfxQuickAnalysisTelegram.js";
import { resolveAtfxHistoryUids } from "../atfxGroupScope.js";
import { BROKERAGE_ATFX, getBrokerageTokenBalance } from "../brokerageTokenBilling.js";
import { respondBrokerageTokenError, withBrokerageTokenBilling } from "../brokerageTokenRouteHelpers.js";

type RegisterAtfxMarketsDeps = {
  supabase: { from: (table: string) => unknown; storage?: unknown } | null;
};

function quickAnalysisProgressSink(res: express.Response): QuickAnalysisProgressSink {
  return {
    phase: (message, step) => writeSse(res, { type: "phase", message, ...(step ? { step } : {}) }),
    stepComplete: (step) => writeSse(res, { type: "step_complete", step }),
    chart: (payload) => writeSse(res, { type: "chart", ...payload }),
    partialReport: (report) => writeSse(res, { type: "partial_report", report }),
    meta: (payload) => writeSse(res, { type: "meta", ...payload }),
  };
}

async function persistQuickAnalysisResult(
  supabase: RegisterAtfxMarketsDeps["supabase"],
  uid: string | undefined,
  result: Awaited<ReturnType<typeof runAtfxQuickAnalysis>>
) {
  if (!supabase || !uid || !result.success) return;
  const saved = await saveAtfxQuickAnalysis(
    supabase as Parameters<typeof saveAtfxQuickAnalysis>[0],
    uid,
    result
  );
  if (saved) {
    result.id = saved.id;
    if (saved.chartImageUrl) {
      result.chartImageUrl = saved.chartImageUrl;
    }
  }
}

export function registerAtfxMarketsRoutes(apiRouter: express.Router, deps: RegisterAtfxMarketsDeps): void {
  const { supabase } = deps;

  apiRouter.get("/atfx/markets/world-map", authenticateToken, async (req, res) => {
    try {
      const forceRefresh =
        req.query.refresh === "1" ||
        req.query.refresh === "true" ||
        req.headers["cache-control"]?.includes("no-cache");

      const data = forceRefresh ? await refreshMarketMapDataFromServer() : await fetchMarketMapData();
      res.json(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load market map data";
      console.error("[atfx/markets/world-map]", message);
      res.status(500).json({ error: message });
    }
  });

  apiRouter.get("/atfx/markets/quick-analysis", authenticateToken, async (req, res) => {
    try {
      const uid = (req as express.Request & { uid?: string }).uid;
      if (!supabase || !uid) {
        res.json({ items: [] });
        return;
      }

      const lite =
        req.query.lite === "1" ||
        req.query.lite === "true" ||
        req.query.lite === "yes";

      const group = await resolveAtfxHistoryUids(supabase as Parameters<typeof resolveAtfxHistoryUids>[0], uid);
      if (lite) {
        const rows = await listAtfxQuickAnalysisSummaries(
          supabase as Parameters<typeof listAtfxQuickAnalysisSummaries>[0],
          group.uids
        );
        res.json({
          items: rows.map((row) =>
            rowToQuickAnalysisSummary(row, group.emailByUid.get(row.firebase_uid) ?? null)
          ),
        });
        return;
      }

      const rows = await listAtfxQuickAnalyses(
        supabase as Parameters<typeof listAtfxQuickAnalyses>[0],
        group.uids
      );
      res.json({
        items: rows.map((row) => ({
          ...rowToQuickAnalysisResult(row),
          owner_uid: row.firebase_uid,
          owner_email: group.emailByUid.get(row.firebase_uid) ?? null,
        })),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load quick analysis history";
      console.error("[atfx/markets/quick-analysis GET]", message);
      res.status(500).json({ error: message });
    }
  });

  apiRouter.get("/atfx/markets/quick-analysis/:id", authenticateToken, async (req, res) => {
    try {
      const uid = (req as express.Request & { uid?: string }).uid;
      if (!supabase || !uid) {
        res.status(503).json({ error: "Database not configured" });
        return;
      }

      const group = await resolveAtfxHistoryUids(supabase as Parameters<typeof resolveAtfxHistoryUids>[0], uid);
      const row = await getAtfxQuickAnalysisById(
        supabase as Parameters<typeof getAtfxQuickAnalysisById>[0],
        group.uids,
        req.params.id
      );
      if (!row) {
        res.status(404).json({ error: "Quick analysis not found" });
        return;
      }

      res.json({
        ...rowToQuickAnalysisResult(row),
        owner_uid: row.firebase_uid,
        owner_email: group.emailByUid.get(row.firebase_uid) ?? null,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load quick analysis";
      console.error("[atfx/markets/quick-analysis GET id]", message);
      res.status(500).json({ error: message });
    }
  });

  apiRouter.get("/atfx/markets/movers", authenticateToken, async (req, res) => {
    try {
      const category = parseMarketMoversCategory(req.query.category);
      if (!category) {
        res.status(400).json({ error: "category must be stocks, forex, commodities, or crypto" });
        return;
      }

      const forceRefresh =
        req.query.refresh === "1" ||
        req.query.refresh === "true" ||
        req.headers["cache-control"]?.includes("no-cache");

      const indexSymbol =
        typeof req.query.index === "string" && req.query.index.trim()
          ? req.query.index.trim()
          : "^GSPC";

      const data = await fetchMarketMovers(category, { indexSymbol, forceRefresh });
      res.json(data);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load market movers";
      console.error("[atfx/markets/movers]", message);
      res.status(500).json({ error: message });
    }
  });

  apiRouter.get("/atfx/markets/movers/indexes", authenticateToken, (_req, res) => {
    res.json({ indexes: GAINERS_LOSERS_INDEXES });
  });

  apiRouter.get("/atfx/markets/symbol-search", authenticateToken, async (req, res) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 12;
      const limit = Number.isFinite(limitRaw) ? limitRaw : 12;

      if (q.length < 2) {
        res.json({ results: [] });
        return;
      }

      const results = await searchAtfxSymbols(q, limit);
      res.json({ results });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to search symbols";
      console.error("[atfx/markets/symbol-search]", message);
      res.status(500).json({ error: message });
    }
  });

  apiRouter.get("/atfx/markets/forex-quotes", authenticateToken, async (req, res) => {
    try {
      const raw = typeof req.query.symbols === "string" ? req.query.symbols : "";
      const symbols = raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 40);

      if (symbols.length === 0) {
        res.json({ quotes: [] });
        return;
      }

      const quotes = await fetchForexPairQuotes(symbols);
      res.json({ quotes });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to load forex quotes";
      console.error("[atfx/markets/forex-quotes]", message);
      res.status(500).json({ error: message });
    }
  });

  apiRouter.post("/atfx/markets/quick-analysis", authenticateToken, async (req, res) => {
    try {
      const symbol = typeof req.body?.symbol === "string" ? req.body.symbol.trim() : "";
      const displayName = typeof req.body?.displayName === "string" ? req.body.displayName.trim() : "";
      const forceRefresh = req.body?.forceRefresh === true || req.body?.forceRefresh === "true";
      const lookback = parseQuickAnalysisLookback(req.body?.lookback);

      if (!symbol) {
        res.status(400).json({ error: "symbol is required" });
        return;
      }

      const uid = (req as express.Request & { uid?: string }).uid;
      const result = await withBrokerageTokenBilling(
        BROKERAGE_ATFX,
        "quick_analysis",
        () => runAtfxQuickAnalysis(symbol, displayName || symbol, { forceRefresh, lookback }),
        {
          firebaseUid: uid,
          symbol,
          ensureBilledOnSuccess: (r) => r.success === true && Boolean(r.report?.trim()),
          fallbackModel: forceRefresh ? "usage-fallback" : "cached-response",
        }
      );
      if (!result.success) {
        res.status(result.error?.includes("not configured") ? 503 : 502).json(result);
        return;
      }

      if (supabase && uid) {
        await persistQuickAnalysisResult(supabase, uid, result);
      }

      const tokenBalance = await getBrokerageTokenBalance(BROKERAGE_ATFX);
      res.json({ ...result, tokenBalance });
    } catch (e) {
      if (respondBrokerageTokenError(res, e)) return;
      const message = e instanceof Error ? e.message : "Failed to run quick analysis";
      console.error("[atfx/markets/quick-analysis]", message);
      res.status(500).json({ error: message });
    }
  });

  apiRouter.post("/atfx/markets/quick-analysis/stream", authenticateToken, async (req, res) => {
    const stopKeepalive = startSseResponse(res);
    try {
      const symbol = typeof req.body?.symbol === "string" ? req.body.symbol.trim() : "";
      const displayName = typeof req.body?.displayName === "string" ? req.body.displayName.trim() : "";
      const forceRefresh = req.body?.forceRefresh === true || req.body?.forceRefresh === "true";
      const lookback = parseQuickAnalysisLookback(req.body?.lookback);

      if (!symbol) {
        writeSse(res, { type: "error", error: "symbol is required" });
        res.end();
        return;
      }

      const uid = (req as express.Request & { uid?: string }).uid;
      writeSse(res, { type: "phase", message: "Starting quick analysis…" });

      const sink = quickAnalysisProgressSink(res);
      const result = await withBrokerageTokenBilling(
        BROKERAGE_ATFX,
        "quick_analysis",
        () => runAtfxQuickAnalysis(symbol, displayName || symbol, { forceRefresh, lookback, onProgress: sink }),
        {
          firebaseUid: uid,
          symbol,
          ensureBilledOnSuccess: (r) => r.success === true && Boolean(r.report?.trim()),
          fallbackModel: forceRefresh ? "usage-fallback" : "cached-response",
        }
      );

      if (!result.success) {
        writeSse(res, { type: "error", error: result.error || "Quick analysis failed" });
        res.end();
        return;
      }

      if (supabase && uid) {
        await persistQuickAnalysisResult(supabase, uid, result);
      }

      const tokenBalance = await getBrokerageTokenBalance(BROKERAGE_ATFX);
      writeSse(res, { type: "done", ...result, tokenBalance });
      res.end();
    } catch (e) {
      if (respondBrokerageTokenError(res, e)) {
        res.end();
        return;
      }
      const message = e instanceof Error ? e.message : "Failed to run quick analysis";
      console.error("[atfx/markets/quick-analysis/stream]", message);
      writeSse(res, { type: "error", error: message });
      res.end();
    } finally {
      stopKeepalive();
    }
  });

  apiRouter.post("/atfx/markets/overall-market-report", authenticateToken, async (req, res) => {
    try {
      const segments = parseOverallMarketSegments(req.body?.segments);
      if (!segments.length) {
        res.status(400).json({ error: "Select at least one market: us_stocks, forex, or commodities." });
        return;
      }

      const uid = (req as express.Request & { uid?: string }).uid;
      const result = await withBrokerageTokenBilling(
        BROKERAGE_ATFX,
        "quick_analysis",
        () => runAtfxOverallMarketReport(segments),
        {
          firebaseUid: uid,
          symbol: overallMarketSymbolForSegments(segments),
          ensureBilledOnSuccess: (r) => r.success === true && Boolean(r.report?.trim()),
          fallbackModel: "overall-market-report",
        }
      );
      if (!result.success) {
        res.status(result.error?.includes("not configured") ? 503 : 502).json(result);
        return;
      }

      if (supabase && uid) {
        await persistQuickAnalysisResult(supabase, uid, result);
      }

      const tokenBalance = await getBrokerageTokenBalance(BROKERAGE_ATFX);
      res.json({ ...result, tokenBalance });
    } catch (e) {
      if (respondBrokerageTokenError(res, e)) return;
      const message = e instanceof Error ? e.message : "Failed to generate overall market report";
      console.error("[atfx/markets/overall-market-report]", message);
      res.status(500).json({ error: message });
    }
  });

  apiRouter.post("/atfx/markets/overall-market-report/stream", authenticateToken, async (req, res) => {
    const stopKeepalive = startSseResponse(res);
    try {
      const segments = parseOverallMarketSegments(req.body?.segments);
      if (!segments.length) {
        writeSse(res, { type: "error", error: "Select at least one market: us_stocks, forex, or commodities." });
        res.end();
        return;
      }

      const uid = (req as express.Request & { uid?: string }).uid;
      writeSse(res, { type: "phase", message: "Starting overall market report…" });

      const sink = quickAnalysisProgressSink(res);
      const result = await withBrokerageTokenBilling(
        BROKERAGE_ATFX,
        "quick_analysis",
        () => runAtfxOverallMarketReport(segments, sink),
        {
          firebaseUid: uid,
          symbol: overallMarketSymbolForSegments(segments),
          ensureBilledOnSuccess: (r) => r.success === true && Boolean(r.report?.trim()),
          fallbackModel: "overall-market-report",
        }
      );

      if (!result.success) {
        writeSse(res, { type: "error", error: result.error || "Overall market report failed" });
        res.end();
        return;
      }

      if (supabase && uid) {
        await persistQuickAnalysisResult(supabase, uid, result);
      }

      const tokenBalance = await getBrokerageTokenBalance(BROKERAGE_ATFX);
      writeSse(res, { type: "done", ...result, tokenBalance });
      res.end();
    } catch (e) {
      if (respondBrokerageTokenError(res, e)) {
        res.end();
        return;
      }
      const message = e instanceof Error ? e.message : "Failed to generate overall market report";
      console.error("[atfx/markets/overall-market-report/stream]", message);
      writeSse(res, { type: "error", error: message });
      res.end();
    } finally {
      stopKeepalive();
    }
  });

  apiRouter.post("/atfx/markets/quick-analysis/translate", authenticateToken, async (req, res) => {
    try {
      const report = typeof req.body?.report === "string" ? req.body.report.trim() : "";
      const localeRaw = typeof req.body?.locale === "string" ? req.body.locale.trim() : "";

      if (!report) {
        res.status(400).json({ error: "report is required" });
        return;
      }

      const locale = parseQuickAnalysisTranslateLocale(localeRaw);
      if (!locale) {
        res.status(400).json({ error: 'locale must be "zh-TW", "zh-CN", "th", or "vi"' });
        return;
      }

      const uid = (req as express.Request & { uid?: string }).uid;
      const analysisId = typeof req.body?.analysisId === "string" ? req.body.analysisId.trim() : "";
      const translated = await withBrokerageTokenBilling(
        BROKERAGE_ATFX,
        "translation",
        () => translateQuickAnalysisReportMarkdown(report, locale),
        {
          firebaseUid: uid,
          referenceId: analysisId || undefined,
          ensureBilledOnSuccess: (text) => Boolean(text?.trim()),
          fallbackModel: "quick-analysis-translate",
        }
      );
      const tokenBalance = await getBrokerageTokenBalance(BROKERAGE_ATFX);
      res.json({ report: translated, tokenBalance });
    } catch (e) {
      if (respondBrokerageTokenError(res, e)) return;
      const message = e instanceof Error ? e.message : "Failed to translate quick analysis";
      const status = message.includes("not configured") || message.includes("not available") ? 503 : 500;
      console.error("[atfx/markets/quick-analysis/translate]", message);
      res.status(status).json({ error: message });
    }
  });

  apiRouter.patch("/atfx/markets/quick-analysis/:id/translations", authenticateToken, async (req, res) => {
    try {
      const uid = (req as express.Request & { uid?: string }).uid;
      if (!supabase || !uid) {
        res.status(503).json({ error: "Database not configured" });
        return;
      }

      const { id } = req.params;
      if (!id?.trim()) {
        res.status(400).json({ error: "Missing record id" });
        return;
      }

      const reportTc = typeof req.body?.reportTc === "string" ? req.body.reportTc : undefined;
      const reportSc = typeof req.body?.reportSc === "string" ? req.body.reportSc : undefined;
      const reportTh = typeof req.body?.reportTh === "string" ? req.body.reportTh : undefined;
      const reportVi = typeof req.body?.reportVi === "string" ? req.body.reportVi : undefined;

      if (!reportTc?.trim() && !reportSc?.trim() && !reportTh?.trim() && !reportVi?.trim()) {
        res.status(400).json({ error: "At least one translation field is required" });
        return;
      }

      const group = await resolveAtfxHistoryUids(supabase as Parameters<typeof resolveAtfxHistoryUids>[0], uid);

      const ok = await updateAtfxQuickAnalysisTranslations(
        supabase as Parameters<typeof updateAtfxQuickAnalysisTranslations>[0],
        group.uids,
        id.trim(),
        { reportTc, reportSc, reportTh, reportVi }
      );

      if (!ok) {
        res.status(500).json({ error: "Failed to save translations" });
        return;
      }

      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save translations";
      console.error("[atfx/markets/quick-analysis/translations]", message);
      res.status(500).json({ error: message });
    }
  });

  apiRouter.post("/atfx/markets/quick-analysis/telegram", authenticateToken, async (req, res) => {
    try {
      const channelId = typeof req.body?.channelId === "string" ? req.body.channelId.trim() : "";
      const report = typeof req.body?.report === "string" ? req.body.report.trim() : "";
      const displayName = typeof req.body?.displayName === "string" ? req.body.displayName.trim() : "";
      const symbol = typeof req.body?.symbol === "string" ? req.body.symbol.trim() : "";
      const chartImageUrl = typeof req.body?.chartImageUrl === "string" ? req.body.chartImageUrl.trim() : "";
      const languageLabel = typeof req.body?.languageLabel === "string" ? req.body.languageLabel.trim() : "";

      if (!channelId) {
        res.status(400).json({ error: "channelId is required" });
        return;
      }
      if (!report) {
        res.status(400).json({ error: "report is required" });
        return;
      }

      await sendQuickAnalysisToTelegramChannel({
        channelId,
        report,
        displayName: displayName || symbol || "Quick Analysis",
        symbol: symbol || undefined,
        chartImageUrl: chartImageUrl || undefined,
        languageLabel: languageLabel || undefined,
      });

      res.json({ ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to send to Telegram";
      const status =
        message.includes("not configured") || message.includes("TELEGRAM_BOT_TOKEN") ? 503 : 500;
      console.error("[atfx/markets/quick-analysis/telegram]", message);
      res.status(status).json({ error: message });
    }
  });
}
