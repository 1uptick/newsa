import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { ArticleChartEmbed } from "./contentChartPlanner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Persisted after LLM succeeds so Airtable-only retry does not re-spend tokens. */
export type AtfxArticleDraftV1 = {
  v: 1;
  sourceTopicRecordId: string;
  topicTitle: string;
  articleType: "Retail" | "Institutional";
  article: {
    titleEn: string;
    titleTc: string;
    excerptEn: string;
    excerptTc: string;
    contentEn: string;
    contentTc: string;
    charts: ArticleChartEmbed[];
  };
  savedAt: string;
};

export type AtfxArticleDraftMeta = {
  recordId: string;
  savedAt: string;
  articleType: "Retail" | "Institutional";
  topicTitle: string;
};

function draftsDir(): string {
  return path.resolve(__dirname, "..", ".cache", "atfx-article-drafts");
}

function draftPathForRecord(recordId: string): string {
  const safe = recordId.replace(/[^a-zA-Z0-9]/g, "_");
  return path.join(draftsDir(), `draft-${safe}.json`);
}

export async function writeAtfxArticleDraft(draft: AtfxArticleDraftV1): Promise<void> {
  const dir = draftsDir();
  await fs.mkdir(dir, { recursive: true });
  const p = draftPathForRecord(draft.sourceTopicRecordId);
  await fs.writeFile(p, JSON.stringify(draft, null, 0), "utf8");
}

export async function readAtfxArticleDraft(recordId: string): Promise<AtfxArticleDraftV1 | null> {
  try {
    const raw = await fs.readFile(draftPathForRecord(recordId), "utf8");
    const j = JSON.parse(raw) as AtfxArticleDraftV1;
    if (j?.v !== 1 || !j.article || !j.sourceTopicRecordId) return null;
    return j;
  } catch {
    return null;
  }
}

export async function deleteAtfxArticleDraft(recordId: string): Promise<void> {
  try {
    await fs.unlink(draftPathForRecord(recordId));
  } catch {
    /* ignore */
  }
}

export async function getAtfxArticleDraftMeta(recordId: string): Promise<AtfxArticleDraftMeta | null> {
  const d = await readAtfxArticleDraft(recordId);
  if (!d) return null;
  return {
    recordId: d.sourceTopicRecordId,
    savedAt: d.savedAt,
    articleType: d.articleType,
    topicTitle: d.topicTitle,
  };
}

export async function listAtfxArticleDrafts(): Promise<AtfxArticleDraftMeta[]> {
  const dir = draftsDir();
  let names: string[] = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: AtfxArticleDraftMeta[] = [];
  for (const name of names) {
    if (!name.startsWith("draft-") || !name.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, name), "utf8");
      const j = JSON.parse(raw) as AtfxArticleDraftV1;
      if (j?.v !== 1 || !j.sourceTopicRecordId) continue;
      out.push({
        recordId: j.sourceTopicRecordId,
        savedAt: j.savedAt,
        articleType: j.articleType,
        topicTitle: j.topicTitle,
      });
    } catch {
      continue;
    }
  }
  out.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  return out;
}
