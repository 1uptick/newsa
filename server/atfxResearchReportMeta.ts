import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { config } from "./config.js";
import { callRequestyChat, extractFirstJsonObject } from "./atfxResearchRequesty.js";
import {
  generateAtfxThumbnailWithRetries,
  safeImagePromptFallback,
} from "./routes/atfxArticleGenerateCore.js";

const ARTICLE_IMAGES_BUCKET = "article-images";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Resolve ATFX logo for sharp composite (local dev + Cloud Functions lib bundle). */
function resolveAtfxLogoPath(): string | null {
  const candidates = new Set<string>([
    path.join(__dirname, "assets", "atfx-logo.png"),
    path.join(process.cwd(), "server", "assets", "atfx-logo.png"),
    path.join(process.cwd(), "public", "atfx logo.png"),
    path.join(process.cwd(), "lib", "server-app", "server", "assets", "atfx-logo.png"),
    path.join(process.cwd(), "src", "server-app", "server", "assets", "atfx-logo.png"),
  ]);

  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    candidates.add(path.join(dir, "public", "atfx logo.png"));
    candidates.add(path.join(dir, "server", "assets", "atfx-logo.png"));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function stripHtmlToPlainText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateResearchReportSeoExcerpt(
  title: string,
  reportHtml: string
): Promise<string> {
  const plain = stripHtmlToPlainText(reportHtml).slice(0, 2800);
  if (!plain && !title.trim()) return "";

  const model = config.requesty.atfxResearchChatModel;
  const raw = await callRequestyChat(
    model,
    [
      {
        role: "system",
        content:
          'You write SEO meta descriptions for institutional financial research reports. Return ONLY JSON: { "excerpt": "..." }. The excerpt must be 120–160 characters, plain text (no HTML), compelling for search/social previews, and accurate to the report.',
      },
      {
        role: "user",
        content: `Title: ${title.trim() || "Research report"}\n\nReport body (plain text excerpt):\n${plain || title}`,
      },
    ],
    { temperature: 0.35, max_tokens: 300 }
  );

  const jsonStr = extractFirstJsonObject(raw);
  if (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr) as { excerpt?: string };
      const excerpt = typeof parsed.excerpt === "string" ? parsed.excerpt.trim() : "";
      if (excerpt) return excerpt.slice(0, 320);
    } catch {
      /* fall through */
    }
  }

  const fallback = [title.trim(), plain.slice(0, 140)].filter(Boolean).join(" — ");
  return fallback.slice(0, 160);
}

async function ensureArticleImagesBucket(supabase: {
  storage: {
    listBuckets: () => Promise<{ data?: { name: string }[]; error?: unknown }>;
    createBucket: (name: string, opts: { public: boolean }) => Promise<{ error?: unknown }>;
    from: (bucket: string) => {
      upload: (
        name: string,
        body: Buffer,
        opts: { contentType: string; upsert: boolean }
      ) => Promise<{ data?: { path: string }; error?: unknown }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
}): Promise<void> {
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) console.warn("[research-report-meta] listBuckets:", listErr);
  const exists = buckets?.some((b) => b.name === ARTICLE_IMAGES_BUCKET);
  if (exists) return;
  const { error: createErr } = await supabase.storage.createBucket(ARTICLE_IMAGES_BUCKET, {
    public: true,
  });
  if (!createErr) return;
  const msg = String((createErr as { message?: string })?.message ?? "").toLowerCase();
  if (msg.includes("already") || msg.includes("exists")) return;
  throw createErr;
}

async function uploadResearchThumbnail(
  supabase: Parameters<typeof ensureArticleImagesBucket>[0],
  buffer: Buffer,
  mime = "image/png"
): Promise<string> {
  await ensureArticleImagesBucket(supabase);
  const ext = mime === "image/jpeg" ? ".jpg" : mime === "image/webp" ? ".webp" : ".png";
  const name = `atfx-research-thumb-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  const { data, error } = await supabase.storage.from(ARTICLE_IMAGES_BUCKET).upload(name, buffer, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from(ARTICLE_IMAGES_BUCKET).getPublicUrl(data!.path);
  return urlData.publicUrl;
}

/** Composite ATFX logo onto bottom-left of thumbnail (same public asset as marketing). */
export async function overlayAtfxLogoOnThumbnail(thumbnailBuffer: Buffer): Promise<Buffer> {
  const logoPath = resolveAtfxLogoPath();
  if (!logoPath) {
    console.warn("[research-report-meta] ATFX logo not found; skipping logo overlay.");
    return thumbnailBuffer;
  }

  const base = sharp(thumbnailBuffer);
  const meta = await base.metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 768;
  const logoWidth = Math.max(72, Math.round(width * 0.16));
  const pad = Math.max(10, Math.round(width * 0.025));

  const logo = await sharp(logoPath)
    .resize(logoWidth, undefined, { fit: "inside" })
    .png()
    .toBuffer();
  const logoMeta = await sharp(logo).metadata();
  const logoHeight = logoMeta.height ?? logoWidth;

  return base
    .composite([
      {
        input: logo,
        left: pad,
        top: Math.max(0, height - logoHeight - pad),
      },
    ])
    .png()
    .toBuffer();
}

export async function buildResearchReportMeta(
  supabase: { storage?: unknown } | null,
  title: string,
  reportHtml: string
): Promise<{ seo_excerpt: string; thumbnail_url?: string }> {
  const seo_excerpt = await generateResearchReportSeoExcerpt(title, reportHtml);
  const imagePrompt = safeImagePromptFallback(title, seo_excerpt);
  const thumb = await generateAtfxThumbnailWithRetries(imagePrompt);

  let thumbnail_url: string | undefined;
  if (thumb?.buffer?.length) {
    let imageBuffer = thumb.buffer;
    try {
      imageBuffer = await overlayAtfxLogoOnThumbnail(thumb.buffer);
    } catch (err) {
      console.warn("[research-report-meta] logo overlay failed; using raw thumbnail:", err);
    }

    try {
      if (supabase?.storage) {
        thumbnail_url = await uploadResearchThumbnail(
          supabase as Parameters<typeof uploadResearchThumbnail>[0],
          imageBuffer,
          thumb.mime || "image/png"
        );
      } else {
        thumbnail_url = `data:image/png;base64,${imageBuffer.toString("base64")}`;
      }
    } catch (err) {
      console.warn("[research-report-meta] thumbnail upload failed:", err);
    }
  } else {
    console.warn("[research-report-meta] thumbnail image generation returned no buffer.");
  }

  return { seo_excerpt, thumbnail_url };
}
