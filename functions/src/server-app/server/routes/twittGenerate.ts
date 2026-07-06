import express from "express";
import { authenticateToken } from "../auth.js";
import { stripCitationMarkers } from "../stripLlmCitations.js";
import { config } from "../config.js";

const ONEUPTICK_TWITT_PROMPT_TABLE_ID = "tblkbw5VF6McGmnQy";
const ONEUPTICK_TWITT_PROMPT_RECORD_ID = "recWh5bocozPIQQiF";
const ONEUPTICK_TWITT_OUTPUT_TABLE_ID = "tbl54WKvGCzPCtYMC";

function extractFirstJsonObject(raw: string): string | null {
  if (!raw) return null;
  const match = raw.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

function mapTwittRecord(record: any) {
  const createdRaw = record.get?.("Created date");
  const createdDate =
    typeof createdRaw === "string" ? createdRaw : createdRaw ? String(createdRaw) : "";
  return {
    id: record.id ?? "",
    createdDate,
    ideas: record.get?.("ideas") ?? "",
    image_url: record.get?.("image_url") ?? "",
    x_en: record.get?.("x_en") ?? "",
    x_jp: record.get?.("x_jp") ?? "",
    instagram_tc: record.get?.("instagram_tc") ?? "",
    facebook_tc: record.get?.("facebook_tc") ?? "",
  };
}

type RegisterTwittGenerateRouteDeps = {
  airtable: any | null;
};

export function registerTwittGenerateRoute(app: express.Application, deps: RegisterTwittGenerateRouteDeps): void {
  const { airtable } = deps;

  app.get("/api/oneuptick/twitt/items", authenticateToken, async (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (!airtable) return res.status(503).json({ error: "Airtable not configured." });
    try {
      const records = await airtable(ONEUPTICK_TWITT_OUTPUT_TABLE_ID)
        .select({ maxRecords: 200, sort: [{ field: "Created date", direction: "desc" }] })
        .firstPage();
      res.json(records.map(mapTwittRecord));
    } catch (err: any) {
      console.error("Twitt list error:", err);
      res.status(500).json({ error: err?.message ?? "Failed to fetch generated items" });
    }
  });

  app.patch("/api/oneuptick/twitt/items/:id", authenticateToken, async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (!airtable) return res.status(503).json({ error: "Airtable not configured." });
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing item id" });
    const body = req.body || {};
    const fields: Record<string, string> = {};
    if (typeof body.ideas === "string") fields.ideas = body.ideas;
    if (typeof body.x_en === "string") fields.x_en = body.x_en;
    if (typeof body.x_jp === "string") fields.x_jp = body.x_jp;
    if (typeof body.instagram_tc === "string") fields.instagram_tc = body.instagram_tc;
    if (typeof body.facebook_tc === "string") fields.facebook_tc = body.facebook_tc;
    if (typeof body.image_url === "string") fields.image_url = body.image_url;
    if (Object.keys(fields).length === 0) return res.status(400).json({ error: "No valid fields to update" });
    try {
      const updated = await airtable(ONEUPTICK_TWITT_OUTPUT_TABLE_ID).update(id, fields);
      res.json(mapTwittRecord(updated));
    } catch (err: any) {
      console.error("Twitt update error:", err);
      res.status(500).json({ error: err?.message ?? "Failed to update generated item" });
    }
  });

  app.post("/api/oneuptick/twitt/items/:id/post", authenticateToken, async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing item id" });
    const url = config.twittPostWebhook.url?.trim();
    if (!url) return res.status(503).json({ error: "Twitt post webhook URL not configured." });
    const user = config.twittPostWebhook.user?.trim();
    const password = config.twittPostWebhook.password ?? "";
    if (!user || !password) {
      return res.status(503).json({ error: "Twitt post webhook credentials not configured." });
    }
    try {
      const basic = Buffer.from(`${user}:${password}`, "utf8").toString("base64");
      const webhookRes = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Basic ${basic}`,
          Record_ID: id,
          record_id: id,
        },
        body: JSON.stringify({ record_id: id, Record_ID: id }),
      });
      const detail = await webhookRes.text().catch(() => "");
      if (!webhookRes.ok) {
        console.error("Twitt post webhook error:", webhookRes.status, detail);
        return res.status(502).json({
          error: `Post webhook failed (${webhookRes.status})`,
          detail: detail.slice(0, 500),
        });
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Twitt post route error:", err);
      res.status(500).json({ error: err?.message ?? "Post failed" });
    }
  });

  app.post("/api/oneuptick/twitt/generate-content", authenticateToken, async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (!airtable) return res.status(503).json({ error: "Airtable not configured." });
    if (!config.requesty.apiKey)
      return res.status(503).json({ error: "Content generation is not available (LLM not configured on the server)." });

    const ideaRaw = req.body?.idea;
    const idea = typeof ideaRaw === "string" ? ideaRaw.trim() : "";
    if (!idea) return res.status(400).json({ error: "Missing idea" });

    const defaultPromptTemplate = `# Role
You are a world-class social media copywriter for a finance/investing brand.

# Objective
Turn the user's idea into high-engagement, platform-optimized social posts.

# Input
Idea: {{IDEA}}

# Requirements (must follow)
- Generate 4 outputs:
  1) X in English (x_en)
  2) X in Japanese (x_jp)
  3) Instagram in Traditional Chinese (instagram_tc)
  4) Facebook in Traditional Chinese (facebook_tc)
- Make it catchy with a strong hook in the first line.
- Use short punchy lines. Avoid corporate tone.
- Include a clear CTA asking users to leave a comment (ask a specific question).
- Include 2–6 relevant hashtags per post to improve searchability.
- Platform fit:
  - X: aim for <= 280 characters; if too long, tighten rather than splitting into threads.
  - Instagram: allow slightly longer, keep readable with line breaks.
  - Facebook: conversational, slightly longer ok, but still skimmable.
- No markdown code fences.
- Output MUST be ONLY valid JSON matching the schema exactly (no extra keys).

# Output JSON schema
{
  "x_en": "string",
  "x_jp": "string",
  "instagram_tc": "string",
  "facebook_tc": "string"
}`;

    let promptTemplate = defaultPromptTemplate;
    try {
      const promptTable = airtable(ONEUPTICK_TWITT_PROMPT_TABLE_ID) as any;
      const rec = await promptTable.find(ONEUPTICK_TWITT_PROMPT_RECORD_ID);
      const stored = rec?.get?.("Prompt");
      if (typeof stored === "string" && stored.trim()) promptTemplate = stored;
    } catch (e) {
      console.warn("Failed to load Twitt prompt from Airtable; using default:", e);
    }

    const prompt =
      typeof promptTemplate === "string" && promptTemplate.includes("{{IDEA}}")
        ? promptTemplate.replace(/\{\{\s*IDEA\s*\}\}/g, idea)
        : `${promptTemplate}\n\nIdea: ${idea}`;

    try {
      const llmRes = await fetch(config.requesty.chatCompletionsUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.requesty.apiKey}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          temperature: 0.6,
          messages: [
            { role: "system", content: "Return ONLY valid JSON. No markdown. No extra keys." },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!llmRes.ok) {
        const errBody = await llmRes.text().catch(() => "");
        console.error("Requesty error:", llmRes.status, errBody);
        return res.status(502).json({
          error: "Upstream LLM request failed. Try again later.",
          upstreamStatus: llmRes.status,
        });
      }

      const llmJson: any = await llmRes.json().catch(() => ({}));
      const text = llmJson?.choices?.[0]?.message?.content ?? "";
      const jsonStr = extractFirstJsonObject(text);
      if (!jsonStr) return res.status(500).json({ error: "LLM returned non-JSON output." });

      let parsed: any;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        return res.status(500).json({ error: "LLM returned invalid JSON." });
      }

      const out = {
        x_en: stripCitationMarkers(typeof parsed?.x_en === "string" ? parsed.x_en : ""),
        x_jp: stripCitationMarkers(
          typeof parsed?.x_jp === "string"
            ? parsed.x_jp
            : typeof parsed?.x_ja === "string"
              ? parsed.x_ja
              : ""
        ),
        instagram_tc: stripCitationMarkers(
          typeof parsed?.instagram_tc === "string"
            ? parsed.instagram_tc
            : typeof parsed?.ig_zh_hant === "string"
              ? parsed.ig_zh_hant
              : ""
        ),
        facebook_tc: stripCitationMarkers(
          typeof parsed?.facebook_tc === "string"
            ? parsed.facebook_tc
            : typeof parsed?.fb_zh_hant === "string"
              ? parsed.fb_zh_hant
              : ""
        ),
      };

      // Save output in Airtable
      const outputTable = airtable(ONEUPTICK_TWITT_OUTPUT_TABLE_ID) as any;
      const created = await outputTable.create({
        ideas: idea,
        x_en: out.x_en,
        x_jp: out.x_jp,
        instagram_tc: out.instagram_tc,
        facebook_tc: out.facebook_tc,
      });

      return res.json({
        ok: true,
        recordId: created?.id ?? null,
        item: mapTwittRecord(created),
        x_en: out.x_en,
        x_jp: out.x_jp,
        instagram_tc: out.instagram_tc,
        facebook_tc: out.facebook_tc,
        // Backward-compatible aliases for the current UI
        x_ja: out.x_jp,
        ig_zh_hant: out.instagram_tc,
        fb_zh_hant: out.facebook_tc,
      });
    } catch (err: any) {
      console.error("Twitt generate-content error:", err);
      return res.status(500).json({ error: err?.message ?? "Failed to generate content" });
    }
  });
}
