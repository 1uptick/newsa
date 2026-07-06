import express from "express";
import multer from "multer";
import compression from "compression";
import rateLimit from "express-rate-limit";
import Airtable from "airtable";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import nodemailer from "nodemailer";
import { config, isAirtableConfigured, isSupabaseConfigured, isRequestyConfigured } from "./server/config.js";
import { cache } from "./server/cache.js";
import * as db from "./server/db.js";
import { authenticateToken, requireAdmin } from "./server/auth.js";
import { createEmailDelivery } from "./server/emailDelivery.js";
import { getAdminEmailsForNotification } from "./server/adminNotifications.js";
import { CAPITAL_KEYWORDS_TABLE_ID } from "./server/capitalAirtableIds.js";
import { registerAuthAdminRoutes } from "./server/routes/authAdmin.js";
import { registerBrokerageTokenRoutes } from "./server/routes/brokerageTokens.js";
import { registerNewsRoutes } from "./server/routes/news.js";
import { registerCapitalKeywordsRoutes } from "./server/routes/capitalKeywords.js";
import { registerCapitalArticlesRoutes } from "./server/routes/capitalArticles.js";
import { registerOneuptickArticlesRoutes } from "./server/routes/oneuptickArticles.js";
import { registerOneuptickSeoRoutes } from "./server/routes/oneuptickSeo.js";
import { registerOneuptickTradingViewRoutes } from "./server/routes/oneuptickTradingView.js";
import { registerCapitalUploadRoutes } from "./server/routes/capitalUpload.js";
import { registerAtfxPortalRoutes } from "./server/routes/atfxPortal.js";
import { registerAtfxArticlesRoutes } from "./server/routes/atfxArticles.js";
import { registerAppPriorityRoutes } from "./server/routes/appPriority.js";
import { registerTwittGenerateRoute } from "./server/routes/twittGenerate.js";
import { registerAtfxArticleGenerateRoute } from "./server/routes/atfxArticleGenerate.js";
import { registerAtfxResearchReportRoutes } from "./server/routes/atfxResearchReport.js";
import { registerAtfxMarketsRoutes } from "./server/routes/atfxMarkets.js";
import { registerAtfxDashboardWorkspaceRoutes } from "./server/routes/atfxDashboardWorkspace.js";
import { startAtfxMarketMapWarmScheduler } from "./server/atfxMarketMap.js";
import { isOneuptickFirestoreConfigured } from "./server/oneuptickMarketDataCache.js";
import { registerUserActivityRoutes } from "./server/routes/userActivity.js";
import { registerCapitalReadRoutes } from "./server/routes/capitalReadRoutes.js";
import { registerCapitalKeywordGenerateRoute } from "./server/routes/capitalKeywordGenerate.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Repo root (folder with vite.config.ts). Walks up from this file so it still works when copied under functions/src/server-app/. */
function resolveViteProjectRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, "vite.config.ts"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return __dirname;
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
// Stricter limit for article images (5MB)
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Initialize Firebase Admin from centralized config (secrets never leave server)
if (config.firebase.serviceAccountJson) {
  try {
    const serviceAccount = JSON.parse(config.firebase.serviceAccountJson);
    const storageBucket =
      config.firebase.storageBucket || `${(serviceAccount as { project_id?: string }).project_id ?? ""}.appspot.com`;
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      ...(storageBucket ? { storageBucket } : {}),
    });
    console.log("Firebase Admin initialized.");
  } catch (e) {
    console.error("Firebase Admin: failed to parse JSON (check FIREBASE_SERVICE_ACCOUNT or key file)", e);
  }
} else {
  console.warn(
    "Firebase Admin: not configured. Set FIREBASE_SERVICE_ACCOUNT (JSON string) or FIREBASE_SERVICE_ACCOUNT_PATH (path to JSON file) in .env"
  );
}

if (isOneuptickFirestoreConfigured()) {
  console.log("ATFX Markets: will read world map / movers from 1uptick Firestore (uptick-prod).");
} else {
  console.warn(
    "ATFX Markets: ONEUPTICK_FIREBASE_SERVICE_ACCOUNT_PATH not set — falling back to FMP for map/movers."
  );
}

const app = express();
const PORT = config.port;

// Behind a reverse proxy (Firebase Hosting → Functions, Render, etc.), trust X-Forwarded-For so req.ip
// and express-rate-limit are per-user instead of sharing one bucket for the load balancer.
app.set("trust proxy", 1);

// Cloud Run / Firebase Functions v2: runtime binds to PORT automatically; do NOT call app.listen()

// CORS — required when the frontend calls the Cloud Functions URL directly (bypasses Firebase Hosting's 60s timeout)
const ALLOWED_ORIGINS = [
  "https://portal.newsa.io",
  "https://newsa-ea4dc.web.app",
  "https://newsa-ea4dc.firebaseapp.com",
];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Cache-Control, X-Requested-With");
    res.setHeader("Access-Control-Max-Age", "86400");
    return res.sendStatus(204);
  }
  next();
});

// Security & performance middleware (skip in dev: compression + Vite middleware mode can break transforms / lazy chunks)
if (process.env.NODE_ENV === "production") {
  app.use(compression());
}

// Rate limiters for sensitive endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window
  message: { error: "Too many requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 requests per hour per IP
  message: { error: "Too many password reset requests, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 uploads per minute
  message: { error: "Too many uploads, please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Supabase required for API (set in .env locally, or in Firebase Console for Functions)
if (!isSupabaseConfigured) {
  console.warn("Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env or Functions env vars).");
}

// Seed Supabase tables and initial admin (async)
if (isSupabaseConfigured) {
  (async () => {
    try {
      const seeded = await db.seedInvitation("WELCOME-NEWSA", "client");
      if (seeded) console.log("Seeded initial invitation code: WELCOME-NEWSA (client)");
    } catch (e) {
      console.warn("Seed invitation:", (e as Error).message);
    }
    if (admin.apps?.length && config.initialAdminEmails.length > 0) {
      for (const email of config.initialAdminEmails) {
        try {
          const user = await admin.auth().getUserByEmail(email);
          await db.upsertUserRole({ firebase_uid: user.uid, role: "admin" });
          console.log("Initial admin set:", email);
        } catch (e) {
          console.warn("Initial admin not found in Firebase (register first):", email);
        }
      }
    }
  })();
}

// Airtable setup from centralized config (server-only)
const airtable =
  isAirtableConfigured
    ? new Airtable({ apiKey: config.airtable.apiKey }).base(config.airtable.baseId)
    : null;
if (!airtable) {
  console.warn(
    "AIRTABLE_API_KEY and/or AIRTABLE_BASE_ID not set. /api/news will return an error until you add them to .env (see .env.example)."
  );
}

// Supabase from centralized config (service role key never exposed to client)
const supabase =
  isSupabaseConfigured
    ? createClient(config.supabase.url, config.supabase.serviceRoleKey)
    : null;
if (!supabase) {
  console.warn("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set. Capital edit/sync and image upload will be disabled.");
}

if (!isRequestyConfigured) {
  console.warn("REQUESTY_API_KEY not set. SEO topic generation will be disabled.");
}

// SMTP from centralized config (server-only)
// In production, set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, APP_BASE_URL in the host environment.
// If SMTP_PASS contains $ or %, avoid shell interpolation (e.g. use env file or quote in export).
let mailTransporter: nodemailer.Transporter | null = null;
if (config.smtp.host && config.smtp.user && config.smtp.pass) {
  try {
    mailTransporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
      tls: { rejectUnauthorized: config.smtp.tlsRejectUnauthorized },
    });
    console.log("SMTP configured:", config.smtp.host + ":" + config.smtp.port);
    mailTransporter.verify((err) => {
      if (err) console.error("SMTP verify failed (emails may not send):", err.message || err);
      else console.log("SMTP connection verified.");
    });
  } catch (e) {
    console.error("SMTP setup failed:", e);
  }
} else {
  console.warn("SMTP not configured (SMTP_HOST, SMTP_USER, SMTP_PASS). Invitation emails will not be sent.");
}

const email = createEmailDelivery({
  mailTransporter,
  smtpFrom: config.smtp.from,
  appBaseUrl: config.appBaseUrl,
});

// Do not run JSON body parser on multipart uploads — consuming or mis-handling the stream causes
// multer/busboy to fail with "Unexpected end of form" in production (e.g. Cloud Functions + Hosting).
const jsonParser = express.json({ limit: "10mb" });
app.use((req, res, next) => {
  const ct = String(req.headers["content-type"] ?? "").toLowerCase();
  if (ct.startsWith("multipart/form-data")) {
    return next();
  }
  jsonParser(req, res, next);
});

registerCapitalReadRoutes(app, { airtable, supabase });
registerCapitalKeywordGenerateRoute(app, { airtable });

registerTwittGenerateRoute(app, { airtable });

// API router — remaining /api routes (ping & airtable/check are on app above)
const apiRouter = express.Router();

registerAuthAdminRoutes(apiRouter, {
  authLimiter,
  forgotPasswordLimiter,
  mailTransporter,
  appBaseUrl: config.appBaseUrl,
  sendForgotPasswordEmail: email.sendForgotPasswordEmail,
  sendInvitationEmail: email.sendInvitationEmail,
  sendTestEmail: email.sendTestEmail,
});
registerBrokerageTokenRoutes(apiRouter);
registerUserActivityRoutes(apiRouter);
registerNewsRoutes(apiRouter, { airtable });
registerCapitalKeywordsRoutes(apiRouter, {
  airtable,
  capitalKeywordsTableId: CAPITAL_KEYWORDS_TABLE_ID,
  sendTopicApprovedEmail: email.sendTopicApprovedEmail,
  sendCustomEmail: email.sendCustomEmail,
  getAdminEmailsForNotification,
  sendAdminTopicApprovedEmail: email.sendAdminTopicApprovedEmail,
  sendAdminTopicRejectedEmail: email.sendAdminTopicRejectedEmail,
  sendAdminTopicDirectionEmail: email.sendAdminTopicDirectionEmail,
});
registerCapitalArticlesRoutes(apiRouter, {
  airtable,
  supabase,
  sendArticlesNotificationEmail: email.sendArticlesNotificationEmail,
});
registerAtfxPortalRoutes(apiRouter, {
  airtable,
  capitalKeywordsTableId: CAPITAL_KEYWORDS_TABLE_ID,
});
registerAtfxArticlesRoutes(apiRouter, {
  airtable,
  supabase,
  sendAtfxArticlesNotificationEmail: email.sendAtfxArticlesNotificationEmail,
});
registerAtfxArticleGenerateRoute(apiRouter, { airtable, supabase });
registerAtfxResearchReportRoutes(apiRouter, { supabase });
registerAtfxMarketsRoutes(apiRouter, { supabase });
registerAtfxDashboardWorkspaceRoutes(apiRouter, { supabase });
startAtfxMarketMapWarmScheduler();
registerOneuptickArticlesRoutes(apiRouter, {
  airtable,
  uploadLimiter,
  imageUpload,
});
registerOneuptickTradingViewRoutes(apiRouter, { airtable, supabase, uploadLimiter });
registerOneuptickSeoRoutes(apiRouter, {
  airtable,
  supabase,
  uploadLimiter,
  imageUpload,
});
registerCapitalUploadRoutes(apiRouter, {
  supabase,
  uploadLimiter,
  imageUpload,
});

// Cache management (admin only)
apiRouter.get("/admin/cache", authenticateToken, requireAdmin, (_req, res) => {
  res.json(cache.stats());
});

apiRouter.delete("/admin/cache", authenticateToken, requireAdmin, (_req, res) => {
  cache.invalidateAll();
  res.json({ ok: true, message: "All caches cleared" });
});

apiRouter.delete("/admin/cache/:key", authenticateToken, requireAdmin, (req, res) => {
  const { key } = req.params;
  cache.invalidate(key);
  res.json({ ok: true, cleared: key });
});

registerAppPriorityRoutes(app, { airtable });

// Mount API router so /api/* is handled (groups routes also on router for consistency)
app.use("/api", apiRouter);

// Ensure /api requests never fall through to Vite (return 404 if router didn't handle)
apiRouter.use((_req, res) => {
  res.status(404).setHeader("Content-Type", "application/json").json({ error: "API route not found" });
});

// Global error handler for async route/middleware rejections (Express 4 doesn't catch these automatically)
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[global error handler]", err?.message ?? err);
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Dev-only: never serve SPA for /api (guard before Vite)
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).setHeader("Content-Type", "application/json").json({ error: "API route not found" });
  }
  next();
});

// Cloud Run: must listen on PORT immediately so the container passes health check.
// Firebase CLI analyze or local dev: skip or add Vite/static.
const isCloudFunction = !!process.env.K_SERVICE || process.cwd().includes("functions");
(async () => {
  if (isCloudFunction) return; // Already handled above (K_SERVICE) or don't start during analyze
  if (process.env.NODE_ENV !== "production") {
    const { createServer } = await import("vite");
    const projectRoot = resolveViteProjectRoot();
    const vite = await createServer({
      root: projectRoot,
      configFile: path.join(projectRoot, "vite.config.ts"),
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use("/assets", express.static(path.join(__dirname, "dist/assets"), { maxAge: "1y", immutable: true }));
    app.use(express.static(path.join(__dirname, "dist"), { maxAge: "1h", index: false }));
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    void db.probeSupabaseHealth();
  });
})();

export { app };
