import express from "express";
import { cache, CACHE_KEYS, CACHE_TTL } from "../cache.js";
import { config } from "../config.js";
import { authenticateToken } from "../auth.js";

type RegisterNewsRoutesDeps = {
  airtable: any | null;
};

export function registerNewsRoutes(apiRouter: express.Router, deps: RegisterNewsRoutesDeps): void {
  const { airtable } = deps;

  apiRouter.get("/news", authenticateToken, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({
        error: "News feed is not configured on the server.",
      });
    }

    const forceRefresh = req.headers["cache-control"]?.includes("no-cache");
    const clientEtag = req.headers["if-none-match"];

    // Check cache (unless force refresh)
    if (!forceRefresh) {
      const cached = cache.get<any[]>(CACHE_KEYS.NEWS);
      if (cached) {
        // Return 304 if client has latest version
        if (cache.matches(CACHE_KEYS.NEWS, clientEtag as string)) {
          return res.status(304).end();
        }
        res.setHeader("Cache-Control", "private, max-age=60");
        res.setHeader("ETag", cached.etag);
        return res.json(cached.data);
      }
    }

    try {
      const tableId = config.airtable.tableId || "tblumZoMzuIr24zvz";
      const rawUrl = (record: any) =>
        record.get("Link") ?? record.get("URL") ?? "";
      const trimLink = (url: string) => {
        if (!url || typeof url !== "string") return "";
        try {
          return new URL(url).hostname.replace(/^www\./, "");
        } catch {
          return url.slice(0, 50);
        }
      };

      const records = await airtable(tableId)
        .select({
          maxRecords: 100,
          sort: [{ field: "Date", direction: "desc" }],
          filterByFormula: "OR({Category} = 'FX', {Category} = 'Commodities', {Category} = 'Global')",
        })
        .firstPage();

      const news = records.map((record: any) => {
        const url = rawUrl(record);
        const imageField = record.get("image");
        const yahooImage = record.get("yahoo image");
        const thumbnail =
          typeof imageField === "string" && imageField
            ? imageField
            : Array.isArray(yahooImage) && yahooImage[0]?.url
              ? yahooImage[0].url
              : typeof yahooImage === "string"
                ? yahooImage
                : "";
        return {
          id: record.id,
          title: record.get("Tittle") ?? record.get("Title") ?? "",
          thumbnail,
          url,
          linkTrim: trimLink(url),
          summary: record.get("Summary") ?? "",
          category: record.get("Category") ?? "",
          source: record.get("Source") ?? "",
          date: record.get("Date") ?? record.get("Created") ?? record.get("Created Time") ?? "",
        };
      });

      // Store in cache
      const etag = cache.set(CACHE_KEYS.NEWS, news, CACHE_TTL.NEWS);
      res.setHeader("Cache-Control", "private, max-age=60");
      res.setHeader("ETag", etag);
      res.json(news);
    } catch (err) {
      console.error("Airtable error:", err);
      res.status(500).json({ error: "Failed to fetch news" });
    }
  });

  apiRouter.get("/news/sources", authenticateToken, async (req, res) => {
    if (!airtable) {
      return res.status(503).json({
        error: "Airtable not configured.",
      });
    }

    const forceRefresh = req.headers["cache-control"]?.includes("no-cache");

    // Check cache
    if (!forceRefresh) {
      const cached = cache.get<string[]>(CACHE_KEYS.NEWS_SOURCES);
      if (cached) {
        res.setHeader("Cache-Control", "private, max-age=300");
        res.setHeader("ETag", cached.etag);
        return res.json(cached.data);
      }
    }

    try {
      const tableId = config.airtable.tableId || "tblumZoMzuIr24zvz";
      const sourceSet = new Set<string>();

      // Bound the scan to the most recent records (sorted by Date) instead of walking the entire
      // table on every cache miss. Active sources appear within recent rows, so this keeps the
      // filter list complete while capping worst-case latency as the table grows.
      const records = await airtable(tableId)
        .select({
          fields: ["Source", "Date"],
          maxRecords: 1000,
          sort: [{ field: "Date", direction: "desc" }],
          filterByFormula: "OR({Category} = 'FX', {Category} = 'Commodities', {Category} = 'Global')",
        })
        .all();
      for (const record of records as any[]) {
        const src = record.get("Source");
        if (src && typeof src === "string" && src.trim()) sourceSet.add(src.trim());
      }

      const sources = Array.from(sourceSet).sort();
      const etag = cache.set(CACHE_KEYS.NEWS_SOURCES, sources, CACHE_TTL.NEWS_SOURCES);
      res.setHeader("Cache-Control", "private, max-age=300");
      res.setHeader("ETag", etag);
      res.json(sources);
    } catch (err) {
      console.error("Airtable sources scan error:", err);
      res.status(500).json({ error: "Failed to fetch sources" });
    }
  });
}
