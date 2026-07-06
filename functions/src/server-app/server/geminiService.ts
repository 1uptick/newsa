/**
 * LLM service — server-only. All LLM calls go through Requesty.
 */

import { config, isRequestyConfigured } from "./config.js";

/** Strip common LLM preambles so the email can use the body as-is. */
function stripCapitalRewritePreamble(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i < lines.length) {
    const line = lines[i].trim();
    const sameLine =
      line.match(/^here'?s?\s+the\s+rewritten\s+message\s*:\s*(.+)$/i) ||
      line.match(/^here\s+is\s+the\s+rewritten\s+message\s*:\s*(.+)$/i) ||
      line.match(/^rewritten\s+message\s*:\s*(.+)$/i);
    if (sameLine?.[1]?.trim()) {
      return [sameLine[1].trim(), ...lines.slice(i + 1)].join("\n").trim();
    }
  }
  const lineRe =
    /^(here'?s?\s+the\s+rewritten\s+message|here\s+is\s+the\s+rewritten\s+message|rewritten\s+message|the\s+rewritten\s+(message|text))\s*:?\s*$/i;
  while (i < lines.length && lineRe.test(lines[i].trim())) i++;
  return lines.slice(i).join("\n").trim();
}

/** One bullet per non-empty line; no preamble; ready for email + plain text. */
function normalizeCapitalNotificationBullets(text: string): string {
  const body = stripCapitalRewritePreamble(text);
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.replace(/^[-•*]\s+/, "").replace(/^\d+[.)]\s+/, "").trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  return lines.map((l) => `- ${l}`).join("\n");
}

const CAPITAL_REWRITE_USER_PROMPT = (msg: string) =>
  `Rewrite the following notes for a short "Latest" section in an email notification.\n\n` +
  `Output rules (strict):\n` +
  `- English only.\n` +
  `- Point form only: output 2–8 lines.\n` +
  `- Each line MUST start with "- " (hyphen + space) followed by one short sentence.\n` +
  `- Keep the meaning; do not add new facts.\n` +
  `- No title line, no greeting, no sign-off.\n` +
  `- Do not write phrases like "Here's the rewritten message" or "Rewritten message:" or any preamble/commentary.\n` +
  `- No citations or URLs.\n\n` +
  `Notes to rewrite:\n${msg}\n\n` +
  `Return ONLY the bullet lines (each starting with "- "). Nothing else.`;

export async function rewriteCapitalNotificationMessage(raw: string): Promise<string> {
  const msg = typeof raw === "string" ? raw.trim() : "";
  if (!msg) return "";

  if (isRequestyConfigured) {
    const prompt = CAPITAL_REWRITE_USER_PROMPT(msg);
    try {
      const res = await fetch(config.requesty.chatCompletionsUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.requesty.apiKey}`,
          "HTTP-Referer": config.appBaseUrl,
          "X-Title": "Newsa Capital email rewrite",
        },
        body: JSON.stringify({
          model: "novita/deepseek/deepseek-v3-turbo",
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "You rewrite short internal notes into email-ready bullet points. Output only bullet lines starting with \"- \". No preamble or explanation.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (res.ok) {
        const j: any = await res.json().catch(() => ({}));
        const content = j?.choices?.[0]?.message?.content;
        const text =
          typeof content === "string"
            ? content
            : Array.isArray(content)
              ? content.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("")
              : "";
        const out = normalizeCapitalNotificationBullets(String(text || ""));
        if (out) return out;
      } else {
        const detail = await res.text().catch(() => "");
        console.warn("Requesty rewrite failed:", res.status, detail.slice(0, 300));
      }
    } catch (e) {
      console.warn("Requesty rewrite error:", e);
    }
  }

  return normalizeCapitalNotificationBullets(msg) || msg;
}
