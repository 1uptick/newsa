import type { ReportLanguage } from "./atfxResearchReportOptions.js";

export type AtfxWordPressConfig = {
  siteUrl: string;
  username: string;
  appPassword: string;
  postStatus: "draft" | "publish" | "pending" | "private";
};

export type PublishResearchReportToWordPressInput = {
  locale: ReportLanguage;
  category: string;
  title: string;
  reportHtml: string;
  seoExcerpt?: string;
  thumbnailUrl?: string;
};

export type PublishResearchReportToWordPressResult = {
  postId: number;
  postUrl: string;
  editUrl?: string;
  featuredMediaId?: number;
};

type WordPressApiError = Error & {
  status?: number;
  detail?: string;
  hint?: string;
};

type ThumbnailImage = {
  buffer: Buffer;
  mime: string;
  filename: string;
};

function wordPressError(message: string, extra?: Partial<WordPressApiError>): WordPressApiError {
  const err = new Error(message) as WordPressApiError;
  if (extra?.status !== undefined) err.status = extra.status;
  if (extra?.detail !== undefined) err.detail = extra.detail;
  if (extra?.hint !== undefined) err.hint = extra.hint;
  return err;
}

export function normalizeWordPressSiteUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function wordPressApiBase(siteUrl: string): string {
  return `${normalizeWordPressSiteUrl(siteUrl)}/wp-json/wp/v2`;
}

export function wordPressAuthHeader(username: string, appPassword: string): string {
  const user = username.trim();
  const pass = appPassword.replace(/\s+/g, "");
  return `Basic ${Buffer.from(`${user}:${pass}`, "utf8").toString("base64")}`;
}

/** Polylang / WPML-style locale slugs used as `?lang=` on REST requests when available. */
export function wordPressLangSlug(locale: ReportLanguage): string {
  switch (locale) {
    case "tc":
      return "zh-hant";
    case "sc":
      return "zh-hans";
    case "th":
      return "th";
    case "vi":
      return "vi";
    default:
      return "en";
  }
}

function cleanWordPressHtml(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  let s = raw;
  s = s.replace(/\\r\\n/g, "\n");
  s = s.replace(/\\n/g, "\n");
  s = s.replace(/\\r/g, "\n");
  s = s.replace(/\\t/g, "\t");
  s = s.replace(/(?:\s*\\\s*){2,}/g, " ");
  s = s.replace(/\\{2,}/g, "");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

function mimeToExtension(mime: string): string {
  const normalized = mime.split(";")[0]?.trim().toLowerCase() || "image/png";
  switch (normalized) {
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return ".png";
  }
}

function sanitizeFilenameBase(title: string): string {
  const base = title
    .trim()
    .slice(0, 80)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "research-thumbnail";
}

async function parseWordPressResponse(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function wordPressErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") {
    return typeof body === "string" && body.trim() ? body.trim().slice(0, 300) : fallback;
  }
  const row = body as Record<string, unknown>;
  const message = typeof row.message === "string" ? row.message.trim() : "";
  const code = typeof row.code === "string" ? row.code.trim() : "";
  if (message && code) return `${message} (${code})`;
  return message || code || fallback;
}

function parseWordPressMediaId(body: unknown): number | null {
  const row = body as { id?: unknown };
  const id = typeof row.id === "number" ? row.id : Number.parseInt(String(row.id ?? ""), 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function wordPressFetch(
  config: AtfxWordPressConfig,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const base = wordPressApiBase(config.siteUrl);
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: wordPressAuthHeader(config.username, config.appPassword),
    ...(init.headers as Record<string, string> | undefined),
  };
  return fetch(url, { ...init, headers });
}

/** Step 0: load thumbnail bytes from a public URL or data URL. */
async function loadThumbnailImage(imageUrl: string, title: string): Promise<ThumbnailImage> {
  const sourceUrl = imageUrl.trim();
  if (!sourceUrl) {
    throw wordPressError("Thumbnail URL is missing.", { status: 400 });
  }

  const dataUrlMatch = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.+)$/i.exec(sourceUrl);
  if (dataUrlMatch) {
    const mime = (dataUrlMatch[1] || "image/png").trim().toLowerCase();
    const buffer = Buffer.from(dataUrlMatch[2], "base64");
    if (!buffer.length) {
      throw wordPressError("Thumbnail data URL is empty.", { status: 400 });
    }
    return {
      buffer,
      mime,
      filename: `${sanitizeFilenameBase(title)}${mimeToExtension(mime)}`,
    };
  }

  if (!/^https?:\/\//i.test(sourceUrl)) {
    throw wordPressError("Thumbnail must be an http(s) URL or a data:image URL.", { status: 400 });
  }

  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw wordPressError(`Could not download thumbnail (${res.status}).`, {
      status: 502,
      hint: "Ensure the thumbnail URL is publicly reachable by the server.",
    });
  }

  const mime = (res.headers.get("content-type") || "image/png").split(";")[0]?.trim().toLowerCase();
  if (!mime.startsWith("image/")) {
    throw wordPressError(`Thumbnail URL did not return an image (content-type: ${mime || "unknown"}).`, {
      status: 400,
    });
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (!buffer.length) {
    throw wordPressError("Downloaded thumbnail is empty.", { status: 400 });
  }

  let filename = `${sanitizeFilenameBase(title)}${mimeToExtension(mime)}`;
  try {
    const parsed = new URL(sourceUrl);
    const last = parsed.pathname.split("/").pop() || "";
    if (/\.(png|jpe?g|webp|gif)$/i.test(last)) {
      filename = last;
    }
  } catch {
    /* keep generated filename */
  }

  return { buffer, mime, filename };
}

/** Step 1: upload thumbnail binary to WordPress media library and return media ID. */
async function uploadWordPressThumbnail(
  config: AtfxWordPressConfig,
  image: ThumbnailImage,
  title: string
): Promise<number> {
  const altText = title.slice(0, 120) || "Featured image";
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(image.buffer)], { type: image.mime });
  formData.append("file", blob, image.filename);
  formData.append("title", altText);
  formData.append("alt_text", altText);
  formData.append("caption", altText);

  const res = await wordPressFetch(config, "/media", {
    method: "POST",
    body: formData,
  });

  const body = await parseWordPressResponse(res);
  if (!res.ok) {
    throw wordPressError(`WordPress thumbnail upload failed (${res.status})`, {
      status: res.status === 401 || res.status === 403 ? 502 : res.status,
      detail: wordPressErrorMessage(body, "media upload failed"),
      hint:
        res.status === 401
          ? "WordPress rejected auth for media upload. Check ATFX_WORDPRESS_USERNAME and ATFX_WORDPRESS_APP_PASSWORD."
          : res.status === 403
            ? "The WordPress user may lack upload_files capability."
            : undefined,
    });
  }

  const mediaId = parseWordPressMediaId(body);
  if (!mediaId) {
    throw wordPressError("WordPress media upload succeeded but did not return a media id.");
  }

  return mediaId;
}

export async function resolveWordPressCategoryId(
  config: AtfxWordPressConfig,
  category: string
): Promise<number> {
  const trimmed = category.trim();
  if (!trimmed) {
    throw wordPressError("category is required");
  }
  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }

  const res = await wordPressFetch(
    config,
    `/categories?slug=${encodeURIComponent(trimmed)}&per_page=1`
  );
  const body = await parseWordPressResponse(res);
  if (!res.ok) {
    throw wordPressError(`WordPress category lookup failed (${res.status})`, {
      status: res.status,
      detail: wordPressErrorMessage(body, "Category not found"),
      hint:
        res.status === 401
          ? "Check ATFX_WORDPRESS_USERNAME and ATFX_WORDPRESS_APP_PASSWORD (use a WordPress Application Password)."
          : undefined,
    });
  }

  if (!Array.isArray(body) || body.length === 0) {
    throw wordPressError(`WordPress category not found for slug "${trimmed}"`, {
      status: 404,
      hint: "Use a numeric category ID or an exact category slug from WordPress.",
    });
  }

  const first = body[0] as { id?: unknown };
  const id = typeof first.id === "number" ? first.id : Number.parseInt(String(first.id ?? ""), 10);
  if (!Number.isFinite(id) || id <= 0) {
    throw wordPressError(`WordPress returned an invalid category id for slug "${trimmed}"`);
  }
  return id;
}

/** Step 2: create the WordPress post with featured_media set to the uploaded thumbnail id. */
async function createWordPressPost(
  config: AtfxWordPressConfig,
  input: {
    locale: ReportLanguage;
    title: string;
    content: string;
    categoryId: number;
    seoExcerpt?: string;
    featuredMediaId: number;
  }
): Promise<{ postId: number; postUrl: string }> {
  const lang = wordPressLangSlug(input.locale);
  const postBody: Record<string, unknown> = {
    title: input.title,
    content: input.content,
    status: config.postStatus,
    categories: [input.categoryId],
    featured_media: input.featuredMediaId,
    ...(input.seoExcerpt?.trim() ? { excerpt: input.seoExcerpt.trim() } : {}),
  };

  const res = await wordPressFetch(config, `/posts?lang=${encodeURIComponent(lang)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(postBody),
  });

  const body = await parseWordPressResponse(res);
  if (!res.ok) {
    throw wordPressError(`WordPress publish failed (${res.status})`, {
      status: res.status,
      detail: wordPressErrorMessage(body, "post create failed"),
      hint:
        res.status === 401
          ? "WordPress rejected auth. Create an Application Password for the editor user (Users → Profile → Application Passwords)."
          : res.status === 403
            ? "The WordPress user may lack permission to create posts in this category."
            : undefined,
    });
  }

  const row = body as { id?: unknown; link?: unknown };
  const postId = typeof row.id === "number" ? row.id : Number.parseInt(String(row.id ?? ""), 10);
  const postUrl = typeof row.link === "string" ? row.link.trim() : "";
  if (!Number.isFinite(postId) || postId <= 0) {
    throw wordPressError("WordPress did not return a post id.");
  }

  return { postId, postUrl };
}

export async function publishResearchReportToWordPress(
  config: AtfxWordPressConfig,
  input: PublishResearchReportToWordPressInput
): Promise<PublishResearchReportToWordPressResult> {
  if (!config.siteUrl.trim()) {
    throw wordPressError("WordPress site URL is not configured (set ATFX_WORDPRESS_SITE_URL).", {
      status: 503,
    });
  }
  if (!config.username.trim() || !config.appPassword.trim()) {
    throw wordPressError(
      "WordPress credentials are not configured (set ATFX_WORDPRESS_USERNAME and ATFX_WORDPRESS_APP_PASSWORD).",
      { status: 503 }
    );
  }

  const thumbnailUrl = input.thumbnailUrl?.trim() ?? "";
  if (!thumbnailUrl) {
    throw wordPressError("Set a thumbnail on the report before publishing to WordPress.", { status: 400 });
  }

  const categoryId = await resolveWordPressCategoryId(config, input.category);
  const content = cleanWordPressHtml(input.reportHtml);
  if (!content) {
    throw wordPressError("Article HTML is empty after cleanup.");
  }

  // Step 1 — upload thumbnail, get media ID
  const thumbnailImage = await loadThumbnailImage(thumbnailUrl, input.title);
  const featuredMediaId = await uploadWordPressThumbnail(config, thumbnailImage, input.title);

  // Step 2 — create post with featured_media
  const { postId, postUrl } = await createWordPressPost(config, {
    locale: input.locale,
    title: input.title,
    content,
    categoryId,
    seoExcerpt: input.seoExcerpt,
    featuredMediaId,
  });

  const site = normalizeWordPressSiteUrl(config.siteUrl);
  return {
    postId,
    postUrl,
    editUrl: `${site}/wp-admin/post.php?post=${postId}&action=edit`,
    featuredMediaId,
  };
}

export function isWordPressConfigured(config: AtfxWordPressConfig): boolean {
  return Boolean(config.siteUrl.trim() && config.username.trim() && config.appPassword.trim());
}
