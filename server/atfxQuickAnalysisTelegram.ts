import { config } from "./config.js";
import { isOverallMarketHtmlReport, OVERALL_MARKET_HTML_MARKER } from "./atfxOverallMarketReport.js";

const TELEGRAM_MESSAGE_MAX = 4096;
const TELEGRAM_CAPTION_MAX = 1024;

const DRIVER_SUBSECTION_TITLE_RE =
  /\b(key\s+drivers|market\s+drivers|cross-asset|positioning|session\s+drivers|drivers)\b/i;
const WATCH_CONTEXT_SUBSECTION_TITLE_RE =
  /\b(what\s+to\s+watch|market\s+context|outlook|catalysts?\s+ahead|read-?through)\b/i;

function telegramApiUrl(method: string): string {
  const token = config.telegram.botToken.trim();
  return `https://api.telegram.org/bot${token}/${method}`;
}

function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Strip markdown to readable plain text for Telegram. */
export function quickAnalysisMarkdownToTelegramText(markdown: string): string {
  return markdown
    .replace(/\[\s*\d+\s*(?:,\s*\d+\s*)*\]/g, "")
    .replace(/［\s*\d+\s*(?:,\s*\d+\s*)*］/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/\r\n/g, "\n")
    .trim();
}

export type QuickAnalysisTelegramSections = {
  quickSnapshot: string;
  marketDrivers: string;
  marketContextAndWatch: string;
};

/** Split quick analysis markdown into Telegram message sections (order is fixed in report generation). */
export function splitQuickAnalysisReportSections(markdown: string): QuickAnalysisTelegramSections {
  const normalized = markdown.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { quickSnapshot: "", marketDrivers: "", marketContextAndWatch: "" };
  }

  const blocks = normalized.split(/\n\n(?=\*\*)/).map((b) => b.trim()).filter(Boolean);

  if (blocks.length === 0) {
    return { quickSnapshot: normalized, marketDrivers: "", marketContextAndWatch: "" };
  }
  if (blocks.length === 1) {
    return { quickSnapshot: blocks[0], marketDrivers: "", marketContextAndWatch: "" };
  }
  if (blocks.length === 2) {
    return { quickSnapshot: blocks[0], marketDrivers: blocks[1], marketContextAndWatch: "" };
  }

  return {
    quickSnapshot: blocks[0],
    marketDrivers: blocks[1],
    marketContextAndWatch: blocks.slice(2).join("\n\n"),
  };
}

function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlToPlainText(fragment: string): string {
  if (!fragment?.trim()) return "";
  let s = fragment
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "");
  s = decodeBasicHtmlEntities(s);
  return s
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function htmlListToPlainText(fragment: string): string {
  if (!fragment?.trim()) return "";
  const items = [...fragment.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => htmlToPlainText(m[1]))
    .filter(Boolean);
  if (items.length) return items.map((t) => `• ${t}`).join("\n");
  return htmlToPlainText(fragment);
}

function htmlTableToPlainText(fragment: string): string {
  const tableMatch = fragment.match(/<table\b[\s\S]*?<\/table>/i);
  if (!tableMatch) return htmlToPlainText(fragment);
  const rows: string[] = [];
  for (const row of tableMatch[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((c) => htmlToPlainText(c[1]))
      .filter(Boolean);
    if (!cells.length) continue;
    if (cells.every((c) => /^[A-Za-z][\w\s]*$/.test(c) && cells.length <= 4)) {
      const looksLikeHeader = row[1].includes("<th");
      if (looksLikeHeader) continue;
    }
    rows.push(cells.join(" | "));
  }
  return rows.join("\n");
}

function readHtmlAttr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i");
  return tag.match(re)?.[2] ?? null;
}

export type OverallMarketTelegramChart = { src: string; alt: string };

/** Extract inline chart images from overall market HTML (data URLs or hosted). */
export function extractOverallMarketChartImages(html: string): OverallMarketTelegramChart[] {
  const charts: OverallMarketTelegramChart[] = [];
  const seen = new Set<string>();
  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const src = readHtmlAttr(tag[0], "src")?.trim() ?? "";
    if (!src || seen.has(src)) continue;
    if (!/^data:image\//i.test(src) && !/^https?:\/\//i.test(src)) continue;
    seen.add(src);
    charts.push({ src, alt: htmlToPlainText(readHtmlAttr(tag[0], "alt") ?? "Chart") });
  }
  return charts;
}

/**
 * Split overall market HTML into the same three Telegram sections as single-symbol quick analysis:
 * 1) Quick Snapshot  2) Market drivers  3) Market context + What to watch
 */
export function splitOverallMarketHtmlReportSections(html: string): QuickAnalysisTelegramSections {
  let content = html.replace(new RegExp(`^${OVERALL_MARKET_HTML_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "").trim();
  content = content.replace(/^<article\b[^>]*>/i, "").replace(/<\/article>\s*$/i, "").trim();

  const snapshotLines: string[] = [];
  const driverLines: string[] = [];
  const contextLines: string[] = [];

  const h1 = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  if (h1) snapshotLines.push(`**${htmlToPlainText(h1)}**`);

  const sessionEm = content.match(/<p>\s*<em>([\s\S]*?)<\/em>\s*<\/p>/i)?.[1];
  if (sessionEm) snapshotLines.push(htmlToPlainText(sessionEm));

  const h2Parts = content.split(/<h2[^>]*>/i).slice(1);
  for (const part of h2Parts) {
    const titleEnd = part.indexOf("</h2>");
    if (titleEnd < 0) continue;
    const h2Title = htmlToPlainText(part.slice(0, titleEnd));
    const body = part.slice(titleEnd + 5);

    if (/executive\s+summary/i.test(h2Title)) {
      const execChunk = body.split(/<h4\b/i)[0].split(/<h2\b/i)[0];
      const execText = htmlToPlainText(execChunk);
      if (execText) snapshotLines.push(execText);
      continue;
    }

    snapshotLines.push(`**${h2Title}**`);

    const h4Parts = body.split(/<h4[^>]*>/i);
    const introText = htmlToPlainText(h4Parts[0] ?? "");
    if (introText.trim()) contextLines.push(`**${h2Title}**\n${introText}`);

    for (let i = 1; i < h4Parts.length; i++) {
      const chunk = h4Parts[i];
      const subTitleEnd = chunk.indexOf("</h4>");
      if (subTitleEnd < 0) continue;
      const subTitle = htmlToPlainText(chunk.slice(0, subTitleEnd));
      const subBody = chunk.slice(subTitleEnd + 5);
      const nextBreak = subBody.search(/<h4\b|<h2\b/i);
      const subContent = nextBreak >= 0 ? subBody.slice(0, nextBreak) : subBody;

      if (/session\s+snapshot/i.test(subTitle)) {
        const tableText = htmlTableToPlainText(subContent);
        if (tableText) snapshotLines.push(tableText);
        continue;
      }
      if (/hourly\s+charts/i.test(subTitle)) continue;

      const bodyText = htmlListToPlainText(subContent) || htmlToPlainText(subContent);
      if (!bodyText.trim()) continue;

      if (DRIVER_SUBSECTION_TITLE_RE.test(subTitle)) {
        driverLines.push(`**${h2Title} — ${subTitle}**\n${bodyText}`);
      } else if (WATCH_CONTEXT_SUBSECTION_TITLE_RE.test(subTitle)) {
        contextLines.push(`**${h2Title} — ${subTitle}**\n${bodyText}`);
      } else {
        contextLines.push(`**${h2Title} — ${subTitle}**\n${bodyText}`);
      }
    }
  }

  return {
    quickSnapshot: snapshotLines.filter(Boolean).join("\n\n").trim(),
    marketDrivers: driverLines.filter(Boolean).join("\n\n").trim(),
    marketContextAndWatch: contextLines.filter(Boolean).join("\n\n").trim(),
  };
}

function splitTelegramChunks(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let rest = text;
  while (rest.length > maxLen) {
    let splitAt = rest.lastIndexOf("\n\n", maxLen);
    if (splitAt < maxLen * 0.5) splitAt = rest.lastIndexOf("\n", maxLen);
    if (splitAt < maxLen * 0.5) splitAt = maxLen;
    chunks.push(rest.slice(0, splitAt).trim());
    rest = rest.slice(splitAt).trim();
  }
  if (rest) chunks.push(rest);
  return chunks.filter(Boolean);
}

function truncateTelegramCaption(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  let cut = text.lastIndexOf("\n\n", maxLen - 1);
  if (cut < maxLen * 0.45) cut = text.lastIndexOf("\n", maxLen - 1);
  if (cut < maxLen * 0.45) cut = maxLen - 1;
  return `${text.slice(0, cut).trim()}…`;
}

function formatTelegramSection(sectionMarkdown: string): string {
  if (!sectionMarkdown.trim()) return "";
  return escapeTelegramHtml(quickAnalysisMarkdownToTelegramText(sectionMarkdown));
}

async function sendTelegramTextMessages(channelId: string, text: string): Promise<void> {
  if (!text.trim()) return;
  for (const chunk of splitTelegramChunks(text, TELEGRAM_MESSAGE_MAX)) {
    await telegramRequest("sendMessage", {
      chat_id: channelId,
      text: chunk,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  }
}

function normalizeChannelId(raw: string): string {
  return raw.trim();
}

function isValidTelegramChannelId(channelId: string): boolean {
  if (!channelId) return false;
  if (/^@[A-Za-z0-9_]{4,}$/.test(channelId)) return true;
  if (/^-?\d+$/.test(channelId)) return true;
  return false;
}

async function telegramRequest(method: string, body: Record<string, unknown>): Promise<void> {
  const token = config.telegram.botToken.trim();
  if (!token) {
    throw new Error("Telegram is not configured (TELEGRAM_BOT_TOKEN missing on the server).");
  }

  const res = await fetch(telegramApiUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
  };

  if (!res.ok || data.ok === false) {
    throw new Error(data.description || `Telegram API failed (${res.status})`);
  }
}

async function telegramMultipartPhoto(
  channelId: string,
  buffer: Buffer,
  mimeType: string,
  fileName: string,
  caption?: string
): Promise<void> {
  const token = config.telegram.botToken.trim();
  if (!token) {
    throw new Error("Telegram is not configured (TELEGRAM_BOT_TOKEN missing on the server).");
  }

  const form = new FormData();
  form.append("chat_id", channelId);
  form.append("photo", new Blob([buffer], { type: mimeType }), fileName);
  if (caption?.trim()) {
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
  }

  const res = await fetch(telegramApiUrl("sendPhoto"), { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!res.ok || data.ok === false) {
    throw new Error(data.description || `Telegram API failed (${res.status})`);
  }
}

async function sendTelegramPhoto(channelId: string, imageUrl: string, caption?: string): Promise<void> {
  const src = imageUrl.trim();
  if (!src) return;

  const safeCaption = caption?.trim() ? truncateTelegramCaption(caption.trim(), TELEGRAM_CAPTION_MAX) : undefined;

  if (/^https?:\/\//i.test(src)) {
    await telegramRequest("sendPhoto", {
      chat_id: channelId,
      photo: src,
      ...(safeCaption ? { caption: safeCaption, parse_mode: "HTML" } : {}),
    });
    return;
  }

  const match = src.match(/^data:image\/(\w+);base64,(.+)$/s);
  if (!match) return;

  const imageType = match[1].toLowerCase();
  const ext = imageType === "jpeg" ? "jpg" : imageType;
  const buffer = Buffer.from(match[2], "base64");
  await telegramMultipartPhoto(
    channelId,
    buffer,
    `image/${imageType}`,
    `chart.${ext}`,
    safeCaption
  );
}

export type SendQuickAnalysisTelegramInput = {
  channelId: string;
  report: string;
  displayName?: string;
  symbol?: string;
  chartImageUrl?: string;
  languageLabel?: string;
};

async function sendOverallMarketReportToTelegramChannel(
  channelId: string,
  input: SendQuickAnalysisTelegramInput
): Promise<void> {
  const sections = splitOverallMarketHtmlReportSections(input.report);
  const quickSnapshotText = formatTelegramSection(sections.quickSnapshot);
  const marketDriversText = formatTelegramSection(sections.marketDrivers);
  const contextWatchText = formatTelegramSection(sections.marketContextAndWatch);

  if (!quickSnapshotText && !marketDriversText && !contextWatchText) {
    throw new Error("Report text is empty.");
  }

  const charts = extractOverallMarketChartImages(input.report);
  if (
    charts.length === 0 &&
    typeof input.chartImageUrl === "string" &&
    (/^https?:\/\//i.test(input.chartImageUrl.trim()) || /^data:image\//i.test(input.chartImageUrl.trim()))
  ) {
    charts.push({
      src: input.chartImageUrl.trim(),
      alt: input.displayName?.trim() || "Chart",
    });
  }

  if (charts.length > 0) {
    await sendTelegramPhoto(
      channelId,
      charts[0].src,
      quickSnapshotText || escapeTelegramHtml(charts[0].alt)
    );
    for (let i = 1; i < charts.length; i++) {
      const altCaption = escapeTelegramHtml(charts[i].alt || `Chart ${i + 1}`);
      await sendTelegramPhoto(channelId, charts[i].src, altCaption);
    }
  } else if (quickSnapshotText) {
    await sendTelegramTextMessages(channelId, quickSnapshotText);
  }

  await sendTelegramTextMessages(channelId, marketDriversText);
  await sendTelegramTextMessages(channelId, contextWatchText);
}

export async function sendQuickAnalysisToTelegramChannel(input: SendQuickAnalysisTelegramInput): Promise<void> {
  const channelId = normalizeChannelId(input.channelId);
  if (!isValidTelegramChannelId(channelId)) {
    throw new Error('Channel id must look like @channelname or -100xxxxxxxxxx');
  }

  if (!input.report.trim()) {
    throw new Error("Report text is empty.");
  }

  if (isOverallMarketHtmlReport(input.report)) {
    await sendOverallMarketReportToTelegramChannel(channelId, input);
    return;
  }

  const sections = splitQuickAnalysisReportSections(input.report);
  const quickSnapshotText = formatTelegramSection(sections.quickSnapshot);
  const marketDriversText = formatTelegramSection(sections.marketDrivers);
  const contextWatchText = formatTelegramSection(sections.marketContextAndWatch);

  if (!quickSnapshotText && !marketDriversText && !contextWatchText) {
    throw new Error("Report text is empty.");
  }

  const chartUrl =
    typeof input.chartImageUrl === "string" && /^https?:\/\//i.test(input.chartImageUrl.trim())
      ? input.chartImageUrl.trim()
      : "";

  // Message 1: chart + Quick Snapshot (caption max 1024)
  if (chartUrl) {
    await telegramRequest("sendPhoto", {
      chat_id: channelId,
      photo: chartUrl,
      caption: quickSnapshotText ? truncateTelegramCaption(quickSnapshotText, TELEGRAM_CAPTION_MAX) : undefined,
      parse_mode: quickSnapshotText ? "HTML" : undefined,
    });
  } else if (quickSnapshotText) {
    await sendTelegramTextMessages(channelId, quickSnapshotText);
  }

  // Message 2: Market drivers
  await sendTelegramTextMessages(channelId, marketDriversText);

  // Message 3: Market context + What to watch next
  await sendTelegramTextMessages(channelId, contextWatchText);
}

export { isValidTelegramChannelId };
