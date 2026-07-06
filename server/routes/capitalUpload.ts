import path from "path";
import express from "express";
import { authenticateToken } from "../auth.js";

const ARTICLE_IMAGES_BUCKET = "article-images";

type RegisterCapitalUploadRoutesDeps = {
  supabase: any | null;
  uploadLimiter: any;
  imageUpload: any;
};

function isBucketAlreadyExistsError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? "").toLowerCase();
  const code = (err as { statusCode?: string })?.statusCode;
  return (
    msg.includes("already") ||
    msg.includes("exists") ||
    msg.includes("duplicate") ||
    code === "409" ||
    code === "Duplicate"
  );
}

/** Ensure article-images bucket exists; create it if missing (public so getPublicUrl works). */
async function ensureArticleImagesBucket(supabase: any): Promise<void> {
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) {
    console.warn("[article-images] listBuckets:", listErr.message);
  }
  const exists = buckets?.some((b: { name: string }) => b.name === ARTICLE_IMAGES_BUCKET);
  if (exists) return;

  const { error: createErr } = await supabase.storage.createBucket(ARTICLE_IMAGES_BUCKET, { public: true });
  if (!createErr) {
    console.log("Created storage bucket:", ARTICLE_IMAGES_BUCKET);
    return;
  }
  if (isBucketAlreadyExistsError(createErr)) {
    return;
  }
  console.error("Failed to create bucket", ARTICLE_IMAGES_BUCKET, createErr.message);
  throw createErr;
}

function sendMulterError(res: express.Response, err: unknown): void {
  const code = (err as { code?: string })?.code;
  const message = (err as Error)?.message ?? String(err);
  if (code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "Image must be 5MB or smaller" });
    return;
  }
  if (code === "LIMIT_UNEXPECTED_FILE") {
    res.status(400).json({ error: "Unexpected file field. Use the field name 'file'." });
    return;
  }
  if (/unexpected end of form/i.test(message)) {
    res.status(400).json({
      error:
        "Upload was cut off before it finished. Try again, use a smaller image (under 5MB), or check your network. If it keeps happening, contact support.",
    });
    return;
  }
  console.error("[upload] multer:", code, message);
  res.status(400).json({ error: message || "Could not read uploaded file" });
}

export function registerCapitalUploadRoutes(apiRouter: express.Router, deps: RegisterCapitalUploadRoutesDeps): void {
  const { supabase, uploadLimiter, imageUpload } = deps;

  apiRouter.post("/capital/upload-image", uploadLimiter, authenticateToken, (req, res, next) => {
    imageUpload.single("file")(req, res, (err: any) => {
      if (err) {
        sendMulterError(res, err);
        return;
      }
      next();
    });
  }, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });
    // Validate image content type
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({ error: "Only image files (JPEG, PNG, GIF, WebP) are allowed" });
    }
    const ext = path.extname(file.originalname) || ".jpg";
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    try {
      await ensureArticleImagesBucket(supabase);
      const { data, error } = await supabase.storage.from(ARTICLE_IMAGES_BUCKET).upload(name, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from(ARTICLE_IMAGES_BUCKET).getPublicUrl(data.path);
      res.json({ url: urlData.publicUrl });
    } catch (err: any) {
      console.error("Upload image error:", err);
      res.status(500).json({ error: err?.message ?? "Upload failed" });
    }
  });

  apiRouter.post("/atfx/upload-image", uploadLimiter, authenticateToken, (req, res, next) => {
    imageUpload.single("file")(req, res, (err: any) => {
      if (err) {
        sendMulterError(res, err);
        return;
      }
      next();
    });
  }, async (req, res) => {
    if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
    const file = (req as any).file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({ error: "Only image files (JPEG, PNG, GIF, WebP) are allowed" });
    }
    const ext = path.extname(file.originalname) || ".jpg";
    const name = `atfx-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    try {
      await ensureArticleImagesBucket(supabase);
      const { data, error } = await supabase.storage.from(ARTICLE_IMAGES_BUCKET).upload(name, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from(ARTICLE_IMAGES_BUCKET).getPublicUrl(data.path);
      res.json({ url: urlData.publicUrl });
    } catch (err: any) {
      console.error("ATFX upload image error:", err);
      res.status(500).json({ error: err?.message ?? "Upload failed" });
    }
  });
}
