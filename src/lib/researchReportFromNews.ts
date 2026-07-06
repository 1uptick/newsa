import type { NewsItem } from "../types";
import { sanitizeHtml } from "./html";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function looksLikeHtml(s: string): boolean {
  return /<(?:div|img|p|span|figure|picture|br|iframe|video|source|a)\b/i.test(s);
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function summaryPlainText(summary: string): string {
  const trimmed = summary.trim();
  return looksLikeHtml(trimmed) ? stripHtmlToText(trimmed) : trimmed;
}

function formatSummaryHtmlBlock(summary: string): string {
  const trimmed = summary.trim();
  if (!trimmed) return "";
  if (looksLikeHtml(trimmed)) {
    const cleaned = sanitizeHtml(trimmed);
    return `<div class="research-chat-input-news__summary"><p><strong>Summary:</strong></p><div class="research-chat-input-news__summary-body">${cleaned}</div></div>`;
  }
  return `<p><strong>Summary:</strong> ${escapeHtml(trimmed)}</p>`;
}

const NEWS_INSTRUCTION =
  "Write an article based on this news story. Treat the headline and summary as the primary catalyst; add live quotes, charts, and outlook using your tools.";

/** Chat prompt when the user picks a headline from the trending news drawer. */
export function researchReportPromptFromNewsItem(item: NewsItem): string {
  const title = (item.title || "").trim();
  const summary = summaryPlainText(item.summary || "");
  const url = (item.url || "").trim();
  const source = (item.source || "").trim();

  const lines = [
    NEWS_INSTRUCTION,
    "",
    title ? `Headline: ${title}` : "",
    summary ? `Summary: ${summary}` : "",
    source ? `Source: ${source}` : "",
    url ? `URL: ${url}` : "",
  ].filter(Boolean);

  return lines.join("\n");
}

/** Sanitized HTML preview for the chat input (thumbnail + formatted fields). */
export function researchReportPromptHtmlFromNewsItem(item: NewsItem): string {
  const title = (item.title || "").trim();
  const summary = (item.summary || "").trim();
  const url = (item.url || "").trim();
  const source = (item.source || "").trim();
  const thumb = (item.thumbnail || "").trim() || `https://picsum.photos/seed/${item.id}/240/150`;

  const parts = [
    `<div class="research-chat-input-news">`,
    `<div class="research-chat-input-news__media">`,
    `<img src="${escapeHtml(thumb)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`,
    `</div>`,
    `<div class="research-chat-input-news__body">`,
    `<p class="research-chat-input-news__lead">${escapeHtml(NEWS_INSTRUCTION)}</p>`,
    title ? `<p><strong>Headline:</strong> ${escapeHtml(title)}</p>` : "",
    summary ? formatSummaryHtmlBlock(summary) : "",
    source ? `<p><strong>Source:</strong> ${escapeHtml(source)}</p>` : "",
    url
      ? `<p><strong>URL:</strong> <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(url)}</a></p>`
      : "",
    `</div>`,
    `</div>`,
  ];

  return parts.filter(Boolean).join("");
}
