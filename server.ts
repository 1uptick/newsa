import express from "express";
import multer from "multer";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import Airtable from "airtable";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import nodemailer from "nodemailer";
import { config, isAirtableConfigured, isSupabaseConfigured, isOpenRouterConfigured } from "./server/config.js";
import { cache, CACHE_KEYS, CACHE_TTL } from "./server/cache.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Initialize Firebase Admin from centralized config (secrets never leave server)
if (config.firebase.serviceAccountJson) {
  try {
    const serviceAccount = JSON.parse(config.firebase.serviceAccountJson);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
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

const app = express();
const PORT = config.port;

// Security & performance middleware
app.use(compression());

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

// Database setup
const db = new Database("newsa.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS invitations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'client')),
    used INTEGER DEFAULT 0,
    email TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS user_roles (
    firebase_uid TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('admin', 'client')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);
// Add role column to existing invitations if missing
try {
  db.prepare("ALTER TABLE invitations ADD COLUMN role TEXT DEFAULT 'client'").run();
} catch {}
try {
  db.prepare("ALTER TABLE invitations ADD COLUMN email TEXT").run();
} catch {}
try {
  db.prepare("ALTER TABLE invitations ADD COLUMN group_id INTEGER REFERENCES groups(id)").run();
} catch {}
try {
  db.prepare("ALTER TABLE user_roles ADD COLUMN group_id INTEGER REFERENCES groups(id)").run();
} catch {}
try {
  db.prepare("ALTER TABLE user_roles ADD COLUMN email TEXT").run();
} catch {}

// Performance: Add indexes for frequently queried columns
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_invitations_code_used ON invitations(code, used);
  CREATE INDEX IF NOT EXISTS idx_invitations_created_at ON invitations(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_user_roles_group_id ON user_roles(group_id);
  CREATE INDEX IF NOT EXISTS idx_user_roles_created_at ON user_roles(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON password_reset_tokens(expires_at);
`);

// Seed initial invitation if empty
const inviteCount: any = db.prepare("SELECT COUNT(*) as count FROM invitations").get();
if (inviteCount.count === 0) {
  db.prepare("INSERT INTO invitations (code, role) VALUES (?, ?)").run("WELCOME-NEWSA", "client");
  console.log("Seeded initial invitation code: WELCOME-NEWSA (client)");
}

// Ensure initial admin(s) by email (Firebase Auth must have the user already)
(async () => {
  if (admin.apps?.length && config.initialAdminEmails.length > 0) {
    for (const email of config.initialAdminEmails) {
      try {
        const user = await admin.auth().getUserByEmail(email);
        db.prepare("INSERT OR REPLACE INTO user_roles (firebase_uid, role) VALUES (?, ?)").run(
          user.uid,
          "admin"
        );
        console.log("Initial admin set:", email);
      } catch (e) {
        console.warn("Initial admin not found in Firebase (register first):", email);
      }
    }
  }
})();

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

if (!isOpenRouterConfigured) {
  console.warn("OPENROUTER_API_KEY not set. SEO topic generation will be disabled.");
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

const appBaseUrl = config.appBaseUrl;
const smtpFrom = config.smtp.from;

// Theme colors for email templates (matches app: primary #ff7900)
const EMAIL_PRIMARY = "#ff7900";
const EMAIL_PRIMARY_DARK = "#cc6100";
const EMAIL_BG = "#ffffff";
const EMAIL_CARD_BG = "#f8fafc";
const EMAIL_TEXT = "#1e293b";
const EMAIL_TEXT_MUTED = "#64748b";
const EMAIL_LINK = "#ff7900";
const EMAIL_FOOTER = "#94a3b8";
const EMAIL_HEADER_BG = "#1b1b1d";
const EMAIL_FOOTER_BG = "#1b1b1d";
const EMAIL_FOOTER_TEXT = "#ffffff";
const EMAIL_BUTTON_GRADIENT = "linear-gradient(to right, #ff7900, #facc15)";

// Header company logo for emails (full logo with name; must be absolute URL)
const EMAIL_HEADER_LOGO_URL = "https://newsa.io/wp-content/uploads/2026/03/newsa-app-logo.png";
const EMAIL_HEADER_LOGO_HEIGHT = 44;
const EMAIL_HEADER_LOGO_MAX_WIDTH = 200;
const EMAIL_HEADER_LINK = "https://portal.newsa.io";

function buildInvitationEmailHtml(registerUrl: string, code: string, role: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're invited to Newsa</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen-Sans,Ubuntu,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background-color:${EMAIL_BG};border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.07);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 24px;background-color:${EMAIL_HEADER_BG};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <a href="${EMAIL_HEADER_LINK}" style="display:inline-block;text-decoration:none;">
                      <img src="${EMAIL_HEADER_LOGO_URL}" alt="Newsa" style="display:block;height:${EMAIL_HEADER_LOGO_HEIGHT}px;width:auto;max-width:${EMAIL_HEADER_LOGO_MAX_WIDTH}px;object-fit:contain;" />
                    </a>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="font-size:14px;font-weight:600;color:#ffffff;">Invitation</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${EMAIL_TEXT};">
                You've been invited to join <strong>Newsa.io</strong> — your platform for financial content and market intelligence.
              </p>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${EMAIL_TEXT};">
                Click the button below to create your account and get started.
              </p>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:${EMAIL_TEXT_MUTED};">
                Invitation code: <strong style="color:${EMAIL_TEXT};">${code}</strong> (you may need this when you register). If you didn't expect this email, you can safely ignore it.
              </p>
              <p style="margin:0 0 20px;font-size:16px;color:${EMAIL_TEXT};">We look forward to having you.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                <tr>
                  <td>
                    <a href="${registerUrl}" style="display:inline-block;padding:14px 28px;background:${EMAIL_BUTTON_GRADIENT};background-color:${EMAIL_PRIMARY};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Accept invitation &amp; register</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:${EMAIL_TEXT_MUTED};">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:8px 0 0;">
                <a href="${registerUrl}" style="font-size:13px;color:${EMAIL_LINK};word-break:break-all;">${registerUrl}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:${EMAIL_FOOTER_BG};">
              <p style="margin:0;font-size:12px;color:${EMAIL_FOOTER_TEXT};"><a href="https://newsa.io" style="color:${EMAIL_FOOTER_TEXT};text-decoration:none;">Newsa.io</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildForgotPasswordEmailHtml(resetUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password – Newsa.io</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen-Sans,Ubuntu,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background-color:${EMAIL_BG};border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.07);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 24px;background-color:${EMAIL_HEADER_BG};">
              <a href="${EMAIL_HEADER_LINK}" style="display:inline-block;text-decoration:none;">
                <img src="${EMAIL_HEADER_LOGO_URL}" alt="Newsa" style="display:block;height:${EMAIL_HEADER_LOGO_HEIGHT}px;width:auto;max-width:${EMAIL_HEADER_LOGO_MAX_WIDTH}px;object-fit:contain;" />
              </a>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${EMAIL_TEXT};">
                You requested a password reset for your <strong>Newsa.io</strong> account.
              </p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:${EMAIL_TEXT};">
                Click the button below to set a new password. This link expires in 1 hour.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                <tr>
                  <td>
                    <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;background:${EMAIL_BUTTON_GRADIENT};background-color:${EMAIL_PRIMARY};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Reset password</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:${EMAIL_TEXT_MUTED};">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:8px 0 0;">
                <a href="${resetUrl}" style="font-size:13px;color:${EMAIL_LINK};word-break:break-all;">${resetUrl}</a>
              </p>
              <p style="margin:24px 0 0;font-size:13px;color:${EMAIL_TEXT_MUTED};">
                If you didn't request this, you can safely ignore this email. Your password will not be changed.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:${EMAIL_FOOTER_BG};">
              <p style="margin:0;font-size:12px;color:${EMAIL_FOOTER_TEXT};"><a href="https://newsa.io" style="color:${EMAIL_FOOTER_TEXT};text-decoration:none;">Newsa.io</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendForgotPasswordEmail(to: string, resetUrl: string): Promise<{ sent: boolean; error?: string }> {
  if (!mailTransporter) return { sent: false, error: "SMTP not configured" };
  const subject = "Reset your password – Newsa.io";
  const text = `You requested a password reset for your Newsa.io account.

Reset your password by visiting this link (expires in 1 hour):
${resetUrl}

If you didn't request this, you can safely ignore this email. Your password will not be changed.

— The Newsa.io team`;
  const html = buildForgotPasswordEmailHtml(resetUrl);
  try {
    await mailTransporter.sendMail({
      from: smtpFrom,
      to,
      subject,
      text,
      html,
    });
    return { sent: true };
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error("Failed to send forgot-password email to", to, msg);
    return { sent: false, error: msg };
  }
}

async function sendInvitationEmail(to: string, code: string, role: string): Promise<{ sent: boolean; error?: string }> {
  if (!mailTransporter) return { sent: false, error: "SMTP not configured" };
  const base = appBaseUrl.replace(/\/$/, "");
  const registerUrl = `${base}/register?code=${encodeURIComponent(code)}&email=${encodeURIComponent(to)}`;
  const subject = "You're invited to Newsa.io";
  const text = `You've been invited to join Newsa.io — your platform for financial content and market intelligence.

Create your account and get started here:
${registerUrl}

Invitation code: ${code}
(You may need this when you register.)

If you didn't expect this email, you can safely ignore it.

We look forward to having you.
— The Newsa.io team`;
  const html = buildInvitationEmailHtml(registerUrl, code, role);
  try {
    await mailTransporter.sendMail({
      from: smtpFrom,
      to,
      subject,
      text,
      html,
    });
    return { sent: true };
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.error("Failed to send invitation email to", to, msg);
    return { sent: false, error: msg };
  }
}

function buildTestEmailHtml(): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Newsa – SMTP test</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen-Sans,Ubuntu,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background-color:${EMAIL_BG};border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.07);overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 24px;background-color:${EMAIL_HEADER_BG};">
              <a href="${EMAIL_HEADER_LINK}" style="display:inline-block;text-decoration:none;">
                <img src="${EMAIL_HEADER_LOGO_URL}" alt="Newsa" style="display:block;height:${EMAIL_HEADER_LOGO_HEIGHT}px;width:auto;max-width:${EMAIL_HEADER_LOGO_MAX_WIDTH}px;object-fit:contain;" />
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0;font-size:16px;line-height:1.6;color:${EMAIL_TEXT};">
                This is a test email from your <strong>Newsa.io</strong> app. SMTP is working.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:${EMAIL_FOOTER_BG};">
              <p style="margin:0;font-size:12px;color:${EMAIL_FOOTER_TEXT};"><a href="https://newsa.io" style="color:${EMAIL_FOOTER_TEXT};text-decoration:none;">Newsa.io</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendTestEmail(to: string): Promise<{ ok: boolean; error?: string }> {
  if (!mailTransporter) return { ok: false, error: "SMTP not configured" };
  try {
    await mailTransporter.sendMail({
      from: smtpFrom,
      to,
      subject: "Newsa – SMTP test",
      text: "This is a test email from your Newsa app. SMTP is working.",
      html: buildTestEmailHtml(),
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

app.use(express.json());

// Firebase Auth: verify ID token and attach user + role
async function authenticateToken(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!admin.apps?.length) {
    return res.status(503).json({ error: "Auth not configured", code: "NO_FIREBASE" });
  }
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized", code: "NO_TOKEN" });
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;
    const row: any = db.prepare("SELECT role FROM user_roles WHERE firebase_uid = ?").get(uid);
    (req as any).uid = uid;
    (req as any).userEmail = decoded.email ?? null;
    (req as any).role = row?.role ?? null;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid or expired token", code: "INVALID_TOKEN" });
  }
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if ((req as any).role !== "admin") {
    return res.status(403).json({ error: "Admin only", code: "FORBIDDEN" });
  }
  next();
}

// Explicit API routes on app first so they always run before Vite (fixes blank /api in browser)
app.get("/api/ping", (_req, res) => {
  res.setHeader("Content-Type", "application/json").json({ pong: true });
});

app.get("/api/airtable/check", async (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (!airtable) {
    return res.status(503).json({
      ok: false,
      error: "Airtable not configured",
      hint: "Add AIRTABLE_API_KEY and AIRTABLE_BASE_ID to .env (see .env.example).",
    });
  }
  const tableId = config.airtable.tableId || "";
  if (!tableId) {
    return res.status(503).json({
      ok: false,
      error: "AIRTABLE_TABLE_ID not set",
      hint: "Add AIRTABLE_TABLE_ID (e.g. tblXXXXXXXXXXXXXX) to .env.",
    });
  }
  try {
    const records = await airtable(tableId)
      .select({ maxRecords: 1 })
      .firstPage();
    res.json({
      ok: true,
      message: "Connected to Airtable",
      baseId: config.airtable.baseId,
      tableId,
      recordCount: records.length,
    });
  } catch (err: any) {
    console.error("Airtable check error:", err);
    const status = err?.statusCode ?? 500;
    const message =
      err?.message ?? (typeof err === "string" ? err : "Unknown error");
    res.status(status >= 400 ? status : 500).json({
      ok: false,
      error: "Airtable request failed",
      details: message,
      hint:
        "Confirm AIRTABLE_API_KEY (personal access token), AIRTABLE_BASE_ID, and AIRTABLE_TABLE_ID match your base.",
    });
  }
});

// Capital keywords from Airtable table tblH4b2m3tjRRvouI (explicit on app so route is always registered)
app.get("/api/capitalkeywords", authenticateToken, async (req, res) => {
  if (!airtable) {
    return res.status(503).json({
      error: "Airtable not configured.",
    });
  }

  const forceRefresh = req.headers["cache-control"]?.includes("no-cache");

  // Check cache
  if (!forceRefresh) {
    const cached = cache.get<any[]>(CACHE_KEYS.CAPITAL_KEYWORDS);
    if (cached) {
      res.setHeader("Cache-Control", "private, max-age=120");
      res.setHeader("ETag", cached.etag);
      return res.json(cached.data);
    }
  }

  try {
    const tableId = "tblH4b2m3tjRRvouI";
    const records = await airtable(tableId)
      .select({
        maxRecords: 100,
        sort: [{ field: "Create date", direction: "desc" }],
        fields: ["Source", "Title", "summary", "Social_hook", "Keyword1", "Keyword2", "Keyword3", "Keyword_tag", "psy_trigger", "Stock_tag", "stockcode1", "stockcode2", "stockcode3", "Create date", "Status", "Approve", "Custome"],
      })
      .firstPage();

    const data = records.map((record: any) => {
      let createDate = "";
      const raw = record.get("Create date");
      if (raw != null && raw !== "") {
        createDate = typeof raw === "string" ? raw : (raw?.start ?? raw?.end ?? String(raw));
      }
      if (!createDate && record.fields && typeof record.fields === "object") {
        for (const [key, value] of Object.entries(record.fields)) {
          if (/create|date|created/i.test(key) && value != null && value !== "") {
            const v = typeof value === "string" ? value : (value && typeof value === "object" && ("start" in value || "end" in value) ? (value as any).start ?? (value as any).end : String(value));
            if (v) {
              createDate = v;
              break;
            }
          }
        }
      }
      return {
        id: record.id,
        source: record.get("Source") ?? "",
        title: record.get("Title") ?? "",
        summary: record.get("summary") ?? "",
        socialHook: record.get("Social_hook") ?? "",
        keyword1: record.get("Keyword1") ?? "",
        keyword2: record.get("Keyword2") ?? "",
        keyword3: record.get("Keyword3") ?? "",
        keywordTag: record.get("Keyword_tag") ?? "",
        psyTrigger: record.get("psy_trigger") ?? "",
        stockTag: record.get("Stock_tag") ?? "",
        createDate,
        status: record.get("Status") ?? "",
        approve: record.get("Approve") ?? "",
        custom: record.get("Custome") ?? "",
      };
    });

    const etag = cache.set(CACHE_KEYS.CAPITAL_KEYWORDS, data, CACHE_TTL.CAPITAL);
    res.setHeader("Cache-Control", "private, max-age=120");
    res.setHeader("ETag", etag);
    res.json(data);
  } catch (err) {
    console.error("Airtable capitalkeywords error:", err);
    res.status(500).json({ error: "Failed to fetch capitalkeywords" });
  }
});

const CAPITAL_KEYWORDS_TABLE_ID = "tblH4b2m3tjRRvouI";

const SEO_SYSTEM_PROMPT = `# Role
Act as a Senior Financial Content Marketing Expert at a major Hong Kong brokerage. You specialize in retail investor psychology and SEO.
# Objective
Identify the single most impactful global investment news story from the LAST 3 DAYS that affects Hong Kong retail investors and generate a professional content strategy for it.

# Step-by-Step Instructions
1. RESEARCH: Use your search tool to find the top financial headlines and market-moving events from the past 3 days. Look specifically for:
   - Global macro trends (Interest rates, Inflation, Geopolitics).
   - US stocks surges/drops (news and events that triggered)
   - Commodity surges (Gold, Oil) or "Safe Haven" movements.
2. FILTER: Select "ONE" core topic that has the highest "click potential" for a Hong Kong-based investor (focus on themes of potential profit, wealth protection or "catching the rebound").
3. GENERATE: Create a SEO-optimized title and summary based on the style pattern below.

# Style Reference (Pattern to follow)
- [Year], [Topic Name]\u662f\u5426\u5c07\u6210\u70ba\u95dc\u9375\u8f49\u6298\u9ede\uff1f
- [Company]\u7a81\u7834[Pattern]\u6574\u7406\uff0c[Driver]\u5e36\u52d5\u80a1\u50f9\u8d70\u52e2
- \u6b77\u53f2\u9ad8\u4f4d\uff01[Data]\u8cc7\u91d1\u300c[Action]\u300d\uff0c\u80cc\u5f8c\u91cb\u653e\u4e86\u4ec0\u9ebc\u8a0a\u865f\uff1f
- [Influencer Name]\u6e05\u5009[Asset]\uff1a\u662f\u7372\u5229\u4e86\u7d50\uff0c\u9084\u662f\u4f30\u503c\u9810\u8b66\uff1f

# Output Requirement
You must output ONLY valid JSON in Traditional Chinese (HK). Ensure the "summary" reflects the actual news found during your research. Do not include any citation markers like "[1]" in the output.

{
  "topics": [
    {
      "id": 1,
      "seo_title": "\u5728\u6b64\u8f38\u5165SEO\u7206\u7d05\u6a19\u984c\uff0830\u5b57\u5167\uff09",
      "keywords": ["\u95dc\u9375\u8a5e1", "\u95dc\u9375\u8a5e2", "\u95dc\u9375\u8a5e3", "\u95dc\u9375\u8a5e4"],
      "psychology_trigger": "\u89e3\u91cb\u70ba\u4ec0\u9ebc\u9019\u5247\u65b0\u805e\u6703\u5438\u5f15\u9999\u6e2f\u6295\u8cc7\u8005\u9ede\u64ca",
      "summary": "100\u5b57\u7684\u6587\u7ae0\u6458\u8981\uff0c\u5fc5\u9808\u5305\u542b\u5177\u9ad4\u7684\u6700\u65b0\u65b0\u805e\u6578\u64da\u6216\u4e8b\u4ef6\u80cc\u666f",
      "target_stock_codes": ["\u4f8b\u5982\uff1a0700", "9988"],
      "social_media_hook": "\u4e00\u53e5\u5f37\u5927\u7684FB/IG\u5438\u7c89\u77ed\u53e5"
    }
  ]
}`;

app.post("/api/capitalkeywords/generate", authenticateToken, async (req, res) => {
  if (!config.openrouter.apiKey) {
    return res.status(503).json({ error: "OPENROUTER_API_KEY not set. Add it to .env." });
  }
  if (!airtable) {
    return res.status(503).json({ error: "Airtable not configured." });
  }

  const { topic, source: sourceCategory } = req.body;
  const userMessage = topic && typeof topic === "string" && topic.trim()
    ? `The user wants a SEO topic about: "${topic.trim()}". Use this as the focus and research the latest news around it.`
    : "Research the latest market news and generate the best SEO topic for Hong Kong retail investors.";

  try {
    const llmRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.openrouter.apiKey}`,
      },
      body: JSON.stringify({
        model: "perplexity/sonar-pro",
        temperature: 0,
        search_recency_filter: "week",
        messages: [
          { role: "system", content: SEO_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!llmRes.ok) {
      const errBody = await llmRes.text();
      console.error("OpenRouter error:", llmRes.status, errBody);
      return res.status(502).json({ error: `LLM request failed (${llmRes.status})`, details: errBody });
    }

    const llmJson = await llmRes.json();
    const content = llmJson?.choices?.[0]?.message?.content ?? "";

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: "Failed to parse LLM response as JSON", raw: content });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return res.status(500).json({ error: "LLM returned invalid JSON", raw: jsonMatch[0] });
    }

    const topicData = Array.isArray(parsed.topics) ? parsed.topics[0] : parsed;
    if (!topicData) {
      return res.status(500).json({ error: "No topic in LLM response", raw: content });
    }

    const keywords = Array.isArray(topicData.keywords) ? topicData.keywords : [];
    const stockCodes = Array.isArray(topicData.target_stock_codes) ? topicData.target_stock_codes : [];

    const airtableFields: Record<string, string> = {
      Title: topicData.seo_title || "",
      summary: topicData.summary || "",
      Social_hook: topicData.social_media_hook || "",
      Keyword1: keywords[0] || "",
      Keyword2: keywords[1] || "",
      Keyword3: keywords[2] || "",
      psy_trigger: topicData.psychology_trigger || "",
      stockcode1: stockCodes[0] || "",
      stockcode2: stockCodes[1] || "",
      stockcode3: stockCodes[2] || "",
      Source: (sourceCategory && typeof sourceCategory === "string") ? sourceCategory : "AI Generated",
      input: topic?.trim() || "",
      Approve: "Approved",
    };

    const table = airtable(CAPITAL_KEYWORDS_TABLE_ID) as any;
    const created = await table.create(airtableFields);

    const record = created;
    const createDateVal = record?.get?.("Create date");
    const item = {
      id: record?.id ?? "",
      source: airtableFields.Source,
      title: airtableFields.Title,
      summary: airtableFields.summary,
      socialHook: airtableFields.Social_hook,
      keyword1: airtableFields.Keyword1,
      keyword2: airtableFields.Keyword2,
      keyword3: airtableFields.Keyword3,
      keywordTag: airtableFields.Keyword_tag,
      psyTrigger: airtableFields.psy_trigger,
      stockTag: airtableFields.Stock_tag,
      createDate: createDateVal != null ? String(createDateVal) : new Date().toISOString(),
      status: "",
      approve: "Approved",
      custom: "",
    };

    // Invalidate cache so next fetch gets fresh data
    cache.invalidate(CACHE_KEYS.CAPITAL_KEYWORDS);
    res.setHeader("Content-Type", "application/json").json(item);
  } catch (err: any) {
    console.error("Generate SEO topic error:", err);
    res.status(500).json({ error: err?.message ?? "Failed to generate topic" });
  }
});

function capitalKeywordsFieldsFromBody(body: any): Record<string, string> {
  const fields: Record<string, string> = {};
  if (typeof body.source === "string") fields["Source"] = body.source;
  if (typeof body.title === "string") fields["Title"] = body.title;
  if (typeof body.summary === "string") fields["summary"] = body.summary;
  if (typeof body.socialHook === "string") fields["Social_hook"] = body.socialHook;
  if (typeof body.keyword1 === "string") fields["Keyword1"] = body.keyword1;
  if (typeof body.keyword2 === "string") fields["Keyword2"] = body.keyword2;
  if (typeof body.keyword3 === "string") fields["Keyword3"] = body.keyword3;
  // Keyword_tag is a computed field in Airtable — skip it
  if (typeof body.psyTrigger === "string") fields["psy_trigger"] = body.psyTrigger;
  // Stock_tag is a computed field — write to stockcode1/2/3 instead
  if (typeof body.stockcode1 === "string") fields["stockcode1"] = body.stockcode1;
  if (typeof body.stockcode2 === "string") fields["stockcode2"] = body.stockcode2;
  if (typeof body.stockcode3 === "string") fields["stockcode3"] = body.stockcode3;
  if (typeof body.custom === "string") fields["Custome"] = body.custom;
  return fields;
}

// API router — remaining /api routes (ping & airtable/check are on app above)
const apiRouter = express.Router();

// SMTP status (no auth) — check configuration and connection
apiRouter.get("/smtp/status", async (_req, res) => {
  const configured = !!mailTransporter;
  if (!mailTransporter) {
    return res.json({
      configured: false,
      message: "SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env",
    });
  }
  try {
    await mailTransporter.verify();
    res.json({ configured: true, verified: true, message: "SMTP connection OK" });
  } catch (e: any) {
    res.status(500).json({
      configured: true,
      verified: false,
      message: "SMTP connection failed",
      error: e?.message || String(e),
    });
  }
});

// Auth status check (no token required) — use to verify Firebase is configured
apiRouter.get("/auth/status", (_req, res) => {
  const firebaseAdminReady = Boolean(admin.apps?.length);
  res.json({
    firebaseAdmin: firebaseAdminReady,
    message: firebaseAdminReady ? "Firebase Admin ready" : "Firebase Admin not configured (check FIREBASE_SERVICE_ACCOUNT in .env)",
  });
});

apiRouter.post("/auth/verify-invitation", authLimiter, (req, res) => {
  const { invitationCode } = req.body;
  const code = typeof invitationCode === "string" ? invitationCode.trim().toUpperCase() : "";
  const invitation: any = db
    .prepare("SELECT * FROM invitations WHERE code = ? AND used = 0")
    .get(code);

  if (!invitation) {
    return res.status(400).json({ error: "Invalid or used invitation code" });
  }
  res.json({ success: true, role: invitation.role || "client" });
});

apiRouter.post("/auth/use-invitation", authLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  let uid: string;
  let userEmail: string | null = null;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    uid = decoded.uid;
    userEmail = decoded.email ?? null;
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }

  const { invitationCode } = req.body;
  const code = typeof invitationCode === "string" ? invitationCode.trim().toUpperCase() : "";
  const invitation: any = db
    .prepare("SELECT * FROM invitations WHERE code = ? AND used = 0")
    .get(code);

  if (!invitation) {
    return res.status(400).json({ error: "Invalid or used invitation" });
  }
  const role = invitation.role || "client";
  const groupId = invitation.group_id ?? null;
  db.prepare("UPDATE invitations SET used = 1 WHERE id = ?").run(invitation.id);
  db.prepare("INSERT OR REPLACE INTO user_roles (firebase_uid, role, group_id, email) VALUES (?, ?, ?, ?)").run(uid, role, groupId, userEmail);
  res.json({ success: true, role, groupId });
});

// Forgot password: send branded email with reset link (no auth required)
apiRouter.post("/auth/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Valid email address required" });
  }
  const message = "If an account exists with that email, we've sent you a link to reset your password.";
  if (!mailTransporter) {
    return res.status(503).json({ error: "Password reset email is not configured.", message });
  }
  if (!admin.apps?.length) {
    return res.status(503).json({ error: "Auth not configured.", message });
  }
  try {
    const user = await admin.auth().getUserByEmail(email).catch(() => null);
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
      db.prepare("INSERT INTO password_reset_tokens (token, email, expires_at) VALUES (?, ?, ?)").run(
        token,
        email,
        expiresAt
      );
      const base = appBaseUrl.replace(/\/$/, "");
      const resetUrl = `${base}/reset-password?token=${encodeURIComponent(token)}`;
      const sendResult = await sendForgotPasswordEmail(email, resetUrl);
      if (!sendResult.sent) {
        console.error("Forgot-password email send failed:", sendResult.error);
        return res.status(503).json({
          error: "We couldn't send the password reset email. Please try again later or contact support.",
          message: message,
        });
      }
    }
  } catch (e) {
    console.error("Forgot password error:", e);
    return res.status(500).json({
      error: "Something went wrong. Please try again later.",
      message: message,
    });
  }
  res.json({ success: true, message });
});

// Reset password with token from email link (no auth required)
apiRouter.post("/auth/reset-password", authLimiter, async (req, res) => {
  const { token, newPassword } = req.body;
  const password = typeof newPassword === "string" ? newPassword.trim() : "";
  const tokenStr = typeof token === "string" ? token.trim() : "";
  if (!tokenStr || !password) {
    return res.status(400).json({ error: "Token and new password are required." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }
  if (!admin.apps?.length) {
    return res.status(503).json({ error: "Auth not configured." });
  }
  const row: any = db.prepare("SELECT email, expires_at FROM password_reset_tokens WHERE token = ?").get(tokenStr);
  if (!row) {
    return res.status(400).json({ error: "Invalid or expired reset link. Please request a new one." });
  }
  if (new Date(row.expires_at) < new Date()) {
    db.prepare("DELETE FROM password_reset_tokens WHERE token = ?").run(tokenStr);
    return res.status(400).json({ error: "This reset link has expired. Please request a new one." });
  }
  try {
    const user = await admin.auth().getUserByEmail(row.email);
    await admin.auth().updateUser(user.uid, { password });
    db.prepare("DELETE FROM password_reset_tokens WHERE token = ?").run(tokenStr);
    res.json({ success: true, message: "Password updated. You can sign in with your new password." });
  } catch (e: any) {
    console.error("Reset password error:", e);
    res.status(500).json({ error: e?.message || "Failed to update password." });
  }
});

apiRouter.get("/auth/me", authenticateToken, (req, res) => {
  const uid = (req as any).uid;
  const row: any = db.prepare(
    "SELECT ur.role, ur.group_id, g.name AS group_name FROM user_roles ur LEFT JOIN groups g ON ur.group_id = g.id WHERE ur.firebase_uid = ?"
  ).get(uid);
  res.json({
    uid,
    email: (req as any).userEmail,
    role: (req as any).role,
    groupId: row?.group_id ?? null,
    groupName: row?.group_name ?? null,
  });
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

apiRouter.get("/admin/groups", authenticateToken, requireAdmin, (_req, res) => {
  const rows = db.prepare("SELECT id, name, created_at FROM groups ORDER BY name ASC").all();
  res.json(rows);
});

apiRouter.post("/admin/groups", authenticateToken, requireAdmin, (req, res) => {
  const { name } = req.body;
  const nameStr = typeof name === "string" ? name.trim() : "";
  if (!nameStr) {
    return res.status(400).json({ error: "Group name is required" });
  }
  try {
    const result = db.prepare("INSERT INTO groups (name) VALUES (?)").run(nameStr);
    const row: any = db.prepare("SELECT id, name, created_at FROM groups WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (e: any) {
    if (e?.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(400).json({ error: "A group with this name already exists" });
    }
    throw e;
  }
});

apiRouter.post("/admin/invite", authenticateToken, requireAdmin, async (req, res) => {
  const { role = "client", email, groupId } = req.body;
  const r = role === "admin" ? "admin" : "client";
  const gid = groupId != null && Number.isInteger(Number(groupId)) ? Number(groupId) : null;
  if (gid == null) {
    return res.status(400).json({ error: "User group is required for invitations" });
  }
  const code = Math.random().toString(36).substring(2, 10).toUpperCase();
  const emailStr = typeof email === "string" ? email.trim() : null;
  db.prepare("INSERT INTO invitations (code, role, email, group_id) VALUES (?, ?, ?, ?)").run(
    code,
    r,
    emailStr,
    gid
  );
  let emailSent = false;
  let emailError: string | undefined;
  if (emailStr && mailTransporter) {
    const sendResult = await sendInvitationEmail(emailStr, code, r);
    emailSent = sendResult.sent;
    if (!sendResult.sent) emailError = sendResult.error;
  }
  const row: any = db.prepare("SELECT id, code, role, email, group_id FROM invitations WHERE code = ?").get(code);
  res.json({ code: row.code, role: r, email: emailStr, emailSent, emailError: emailError ?? null, groupId: row.group_id ?? null });
});

apiRouter.get("/admin/invitations", authenticateToken, requireAdmin, (_req, res) => {
  const rows = db.prepare(
    `SELECT i.id, i.code, i.role, i.used, i.email, i.created_at, i.group_id, g.name AS group_name
     FROM invitations i LEFT JOIN groups g ON i.group_id = g.id
     ORDER BY i.created_at DESC`
  ).all();
  res.json(rows);
});

apiRouter.delete("/admin/invitations/:id", authenticateToken, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Invalid invitation id" });
  }
  const result = db.prepare("DELETE FROM invitations WHERE id = ?").run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "Invitation not found" });
  }
  res.json({ ok: true, deleted: id });
});

apiRouter.get("/admin/users", authenticateToken, requireAdmin, async (_req, res) => {
  const rows: any[] = db.prepare(
    `SELECT ur.firebase_uid, ur.email, ur.role, ur.group_id, ur.created_at, g.name AS group_name
     FROM user_roles ur LEFT JOIN groups g ON ur.group_id = g.id
     ORDER BY ur.created_at DESC`
  ).all();
  if (admin.apps?.length) {
    for (const row of rows) {
      if (row.firebase_uid) {
        try {
          const userRecord = await admin.auth().getUser(row.firebase_uid);
          if (!row.email && userRecord?.email) {
            row.email = userRecord.email;
            db.prepare("UPDATE user_roles SET email = ? WHERE firebase_uid = ?").run(userRecord.email, row.firebase_uid);
          }
          const lastSignIn = userRecord?.metadata?.lastSignInTime;
          row.last_login = lastSignIn || null;
        } catch {
          row.last_login = null;
        }
      } else {
        row.last_login = null;
      }
    }
  } else {
    rows.forEach((row) => { row.last_login = null; });
  }
  res.json(rows);
});

apiRouter.delete("/admin/users/:uid", authenticateToken, requireAdmin, async (req, res) => {
  const uid = typeof req.params.uid === "string" ? req.params.uid.trim() : "";
  if (!uid) {
    return res.status(400).json({ error: "Invalid user id" });
  }
  const currentUid = (req as any).uid;
  if (uid === currentUid) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }
  const row = db.prepare("SELECT firebase_uid FROM user_roles WHERE firebase_uid = ?").get(uid);
  if (!row) {
    return res.status(404).json({ error: "User not found" });
  }
  try {
    if (admin.apps?.length) {
      await admin.auth().deleteUser(uid);
    }
  } catch (e: any) {
    console.error("Firebase deleteUser error:", e);
    return res.status(500).json({
      error: e?.message?.includes("not found") ? "User not found in auth" : "Failed to delete user from authentication",
    });
  }
  db.prepare("DELETE FROM user_roles WHERE firebase_uid = ?").run(uid);
  res.json({ ok: true, deleted: uid });
});

apiRouter.post("/admin/send-test-email", authenticateToken, requireAdmin, async (req, res) => {
  const { to } = req.body;
  const email = typeof to === "string" ? to.trim() : null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Valid email address required" });
  }
  const result = await sendTestEmail(email);
  if (result.ok) {
    res.json({ success: true, message: "Test email sent to " + email });
  } else {
    res.status(500).json({ error: result.error || "Failed to send" });
  }
});

apiRouter.get("/news", authenticateToken, async (req, res) => {
  if (!airtable) {
    return res.status(503).json({
      error: "Airtable not configured. Add AIRTABLE_API_KEY and AIRTABLE_BASE_ID to .env (see .env.example).",
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

    const news = records.map((record) => {
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

    await airtable(tableId)
      .select({
        fields: ["Source"],
        filterByFormula: "OR({Category} = 'FX', {Category} = 'Commodities', {Category} = 'Global')",
      })
      .eachPage((records, fetchNextPage) => {
        for (const record of records) {
          const src = record.get("Source");
          if (src && typeof src === "string" && src.trim()) sourceSet.add(src.trim());
        }
        fetchNextPage();
      });

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

apiRouter.patch("/capitalkeywords/:id", authenticateToken, async (req, res) => {
  if (!airtable) {
    return res.status(503).json({ error: "Airtable not configured." });
  }
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Missing record id" });
  const fields = capitalKeywordsFieldsFromBody(req.body || {});
  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ error: "No valid fields to update" });
  }
  try {
    const table = airtable(CAPITAL_KEYWORDS_TABLE_ID) as any;
    const record = await table.update(id, fields);
    const get = (name: string) => (record && typeof record.get === "function" ? record.get(name) : undefined) ?? "";
    const createDate = record && typeof record.get === "function" ? record.get("Create date") : null;
    cache.invalidate(CACHE_KEYS.CAPITAL_KEYWORDS);
    res.setHeader("Content-Type", "application/json").json({
      id: record?.id ?? id,
      source: get("Source"),
      title: get("Title"),
      summary: get("summary"),
      socialHook: get("Social_hook"),
      keyword1: get("Keyword1"),
      keyword2: get("Keyword2"),
      keyword3: get("Keyword3"),
      keywordTag: get("Keyword_tag"),
      psyTrigger: get("psy_trigger"),
      stockTag: get("Stock_tag"),
      createDate: createDate != null ? String(createDate) : "",
      custom: get("Custome"),
    });
  } catch (err: any) {
    console.error("Airtable capitalkeywords update error:", err);
    res.status(500).json({ error: err?.message ?? "Failed to update record" });
  }
});

apiRouter.patch("/capitalkeywords/:id/approve", authenticateToken, requireAdmin, async (req, res) => {
  if (!airtable) {
    return res.status(503).json({ error: "Airtable not configured." });
  }
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Missing record id" });
  try {
    const table = airtable(CAPITAL_KEYWORDS_TABLE_ID) as any;
    await table.update(id, { Approve: "Approved" });
    cache.invalidate(CACHE_KEYS.CAPITAL_KEYWORDS);
    res.setHeader("Content-Type", "application/json").json({ ok: true });
  } catch (err: any) {
    console.error("Airtable capitalkeywords approve error:", err);
    res.status(500).json({ error: err?.message ?? "Failed to approve record" });
  }
});

apiRouter.patch("/capitalkeywords/:id/unapprove", authenticateToken, requireAdmin, async (req, res) => {
  if (!airtable) {
    return res.status(503).json({ error: "Airtable not configured." });
  }
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Missing record id" });
  try {
    const table = airtable(CAPITAL_KEYWORDS_TABLE_ID) as any;
    await table.update(id, { Approve: "" });
    cache.invalidate(CACHE_KEYS.CAPITAL_KEYWORDS);
    res.setHeader("Content-Type", "application/json").json({ ok: true });
  } catch (err: any) {
    console.error("Airtable capitalkeywords unapprove error:", err);
    res.status(500).json({ error: err?.message ?? "Failed to clear approval" });
  }
});

apiRouter.patch("/capitalkeywords/:id/status-approve", authenticateToken, requireAdmin, async (req, res) => {
  if (!airtable) {
    return res.status(503).json({ error: "Airtable not configured." });
  }
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Missing record id" });
  try {
    const table = airtable(CAPITAL_KEYWORDS_TABLE_ID) as any;
    await table.update(id, { Status: "Approved" });
    cache.invalidate(CACHE_KEYS.CAPITAL_KEYWORDS);
    res.setHeader("Content-Type", "application/json").json({ ok: true });
  } catch (err: any) {
    console.error("Airtable capitalkeywords status-approve error:", err);
    res.status(500).json({ error: err?.message ?? "Failed to approve record" });
  }
});

apiRouter.patch("/capitalkeywords/:id/status-unapprove", authenticateToken, requireAdmin, async (req, res) => {
  if (!airtable) {
    return res.status(503).json({ error: "Airtable not configured." });
  }
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Missing record id" });
  try {
    const table = airtable(CAPITAL_KEYWORDS_TABLE_ID) as any;
    await table.update(id, { Status: "" });
    cache.invalidate(CACHE_KEYS.CAPITAL_KEYWORDS);
    res.setHeader("Content-Type", "application/json").json({ ok: true });
  } catch (err: any) {
    console.error("Airtable capitalkeywords status-unapprove error:", err);
    res.status(500).json({ error: err?.message ?? "Failed to clear approval" });
  }
});

apiRouter.get("/capital", authenticateToken, async (req, res) => {
  if (!airtable) {
    return res.status(503).json({
      error: "Airtable not configured.",
    });
  }

  const forceRefresh = req.headers["cache-control"]?.includes("no-cache");

  // Check cache
  if (!forceRefresh) {
    const cached = cache.get<any[]>(CACHE_KEYS.CAPITAL_ARTICLES);
    if (cached) {
      res.setHeader("Cache-Control", "private, max-age=120");
      res.setHeader("ETag", cached.etag);
      return res.json(cached.data);
    }
  }

  const capitalTableId = config.airtable.capitalTableId || "tblNqlepjy0uCP9CU";
  try {
    const records = await airtable(capitalTableId)
      .select({ maxRecords: 200 })
      .firstPage();

    const items = records.map((record: any) => {
      const created = record.get("Create date") ?? record.get("Created") ?? record.get("created date") ?? "";
      const title = record.get("title") ?? record.get("Title") ?? "";
      const excerpt = record.get("excerpt") ?? record.get("Excerpt") ?? "";
      const calculation = record.get("Calculation") ?? record.get("calculation") ?? "";
      return {
        id: record.id,
        createdDate: typeof created === "string" ? created : created ? String(created) : "",
        title: typeof title === "string" ? title : String(title ?? ""),
        excerpt: typeof excerpt === "string" ? excerpt : String(excerpt ?? ""),
        calculation: typeof calculation === "string" ? calculation : String(calculation ?? ""),
      };
    });

    items.sort((a, b) => {
      if (!a.createdDate || !b.createdDate) return 0;
      return new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime();
    });

    // Override titles from Supabase when user has edited them
    if (supabase && items.length > 0) {
      const ids = items.map((i: any) => i.id);
      const { data: overrides } = await supabase.from("capital_articles").select("airtable_id, title").in("airtable_id", ids);
      const titleMap = new Map((overrides ?? []).map((r: any) => [r.airtable_id, r.title]));
      items.forEach((item: any) => {
        const overrideTitle = titleMap.get(item.id);
        if (overrideTitle != null && overrideTitle !== "") item.title = overrideTitle;
      });
    }

    const etag = cache.set(CACHE_KEYS.CAPITAL_ARTICLES, items, CACHE_TTL.CAPITAL);
    res.setHeader("Cache-Control", "private, max-age=120");
    res.setHeader("ETag", etag);
    res.json(items);
  } catch (err: any) {
    console.error("Airtable capital error:", err);
    const message = err?.message ?? err?.error ?? "Failed to fetch capital data";
    res.status(500).json({ error: message });
  }
});

function appendAirtableImagesToContent(content: string, record: any): string {
  const imgUrls: string[] = [];
  for (const key of ["image 1", "image 2", "image A", "image B"]) {
    const v = record.get(key);
    if (v && typeof v === "string" && v.startsWith("http")) imgUrls.push(v);
  }
  const seen = new Set<string>();
  for (const url of imgUrls) {
    if (seen.has(url)) continue;
    seen.add(url);
    content += `<img src="${url.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" alt="" style="max-width:100%;height:auto;display:block;margin:1rem 0;" />`;
  }
  return content;
}

async function getCapitalRecordFromAirtable(recordId: string): Promise<{ createdDate: string; title: string; excerpt: string; content: string } | null> {
  if (!airtable) return null;
  const capitalTableId = config.airtable.capitalTableId || "tblNqlepjy0uCP9CU";
  try {
    const record: any = await airtable(capitalTableId).find(recordId);
    const created = record.get("Create date") ?? record.get("Created") ?? record.get("created date") ?? "";
    const title = record.get("title") ?? record.get("Title") ?? "";
    const excerpt = record.get("excerpt") ?? record.get("Excerpt") ?? "";
    let content = record.get("Calculation") ?? record.get("calculation") ?? "";
    content = typeof content === "string" ? content : String(content ?? "");
    content = appendAirtableImagesToContent(content, record);
    return {
      createdDate: typeof created === "string" ? created : created ? String(created) : "",
      title: typeof title === "string" ? title : String(title ?? ""),
      excerpt: typeof excerpt === "string" ? excerpt : String(excerpt ?? ""),
      content,
    };
  } catch {
    return null;
  }
}

apiRouter.get("/capital/:id/content", authenticateToken, async (req, res) => {
  const { id } = req.params;
  if (!id) return res.status(400).json({ error: "Missing article id" });
  try {
    if (supabase) {
      const { data: row } = await supabase.from("capital_articles").select("content").eq("airtable_id", id).single();
      if (row?.content != null) {
        return res.json({ content: row.content, fromSupabase: true });
      }
    }
    const fromAirtable = await getCapitalRecordFromAirtable(id);
    if (fromAirtable) {
      if (supabase) {
        await supabase.from("capital_articles").upsert(
          {
            airtable_id: id,
            title: fromAirtable.title,
            excerpt: fromAirtable.excerpt,
            created_date: fromAirtable.createdDate,
            content: fromAirtable.content,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "airtable_id" }
        );
      }
      return res.json({ content: fromAirtable.content, fromSupabase: false });
    }
    res.status(404).json({ error: "Article not found" });
  } catch (err: any) {
    console.error("Capital content error:", err);
    res.status(500).json({ error: err?.message ?? "Failed to get content" });
  }
});

apiRouter.post("/capital/sync", authenticateToken, requireAdmin, async (_req, res) => {
  if (!airtable) return res.status(503).json({ error: "Airtable not configured" });
  if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
  const capitalTableId = config.airtable.capitalTableId || "tblNqlepjy0uCP9CU";
  try {
    const listRecords = await airtable(capitalTableId).select({ maxRecords: 200 }).firstPage();
    for (const listRecord of listRecords as any[]) {
      // Always fetch the full individual record so long text fields are not truncated
      const record: any = await airtable(capitalTableId).find(listRecord.id);
      const created = record.get("Create date") ?? record.get("Created") ?? record.get("created date") ?? "";
      const title = record.get("title") ?? record.get("Title") ?? "";
      const excerpt = record.get("excerpt") ?? record.get("Excerpt") ?? "";
      const calculation = record.get("Calculation") ?? record.get("calculation") ?? "";
      let content = typeof calculation === "string" ? calculation : String(calculation ?? "");
      content = appendAirtableImagesToContent(content, record);

      await supabase.from("capital_articles").upsert({
        airtable_id: record.id,
        title: typeof title === "string" ? title : String(title ?? ""),
        excerpt: typeof excerpt === "string" ? excerpt : String(excerpt ?? ""),
        created_date: typeof created === "string" ? created : created ? String(created) : "",
        content,
        updated_at: new Date().toISOString(),
      }, { onConflict: "airtable_id" });
    }
    cache.invalidate(CACHE_KEYS.CAPITAL_ARTICLES);
    cache.invalidatePrefix("capital:article:");
    res.json({ synced: listRecords.length });
  } catch (err: any) {
    console.error("Capital sync error:", err);
    res.status(500).json({ error: err?.message ?? "Sync failed" });
  }
});

apiRouter.patch("/capital/:id/content", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { content } = req.body;
  if (!id) return res.status(400).json({ error: "Missing article id" });
  if (typeof content !== "string") return res.status(400).json({ error: "Missing or invalid content" });
  if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
  try {
    const { error } = await supabase.from("capital_articles").upsert(
      { airtable_id: id, content, updated_at: new Date().toISOString() },
      { onConflict: "airtable_id" }
    );
    if (error) throw error;
    cache.invalidate(CACHE_KEYS.CAPITAL_ARTICLE(id));
    res.json({ ok: true });
  } catch (err: any) {
    console.error("Capital update content error:", err);
    res.status(500).json({ error: err?.message ?? "Update failed" });
  }
});

apiRouter.patch("/capital/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  if (!id) return res.status(400).json({ error: "Missing article id" });
  if (typeof title !== "string") return res.status(400).json({ error: "Missing or invalid title" });
  if (!supabase) return res.status(503).json({ error: "Supabase not configured" });
  try {
    const { data: existing } = await supabase.from("capital_articles").select("content").eq("airtable_id", id).single();
    const updated_at = new Date().toISOString();
    if (existing) {
      const { error } = await supabase.from("capital_articles").update({ title, updated_at }).eq("airtable_id", id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("capital_articles").insert({
        airtable_id: id,
        title,
        content: "",
        updated_at,
      });
      if (error) throw error;
    }
    cache.invalidate(CACHE_KEYS.CAPITAL_ARTICLES);
    res.json({ ok: true });
  } catch (err: any) {
    console.error("Capital update title error:", err);
    res.status(500).json({ error: err?.message ?? "Update failed" });
  }
});

const ARTICLE_IMAGES_BUCKET = "article-images";

apiRouter.post("/capital/upload-image", uploadLimiter, authenticateToken, upload.single("file"), async (req, res) => {
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

// Explicit /api/admin/groups routes on app so they always match (before router mount)
app.get("/api/admin/groups", authenticateToken, requireAdmin, (_req: express.Request, res: express.Response) => {
  const rows = db.prepare("SELECT id, name, created_at FROM groups ORDER BY name ASC").all();
  res.json(rows);
});
app.post("/api/admin/groups", authenticateToken, requireAdmin, (req: express.Request, res: express.Response) => {
  const { name } = req.body;
  const nameStr = typeof name === "string" ? name.trim() : "";
  if (!nameStr) {
    return res.status(400).json({ error: "Group name is required" });
  }
  try {
    const result = db.prepare("INSERT INTO groups (name) VALUES (?)").run(nameStr);
    const row: any = db.prepare("SELECT id, name, created_at FROM groups WHERE id = ?").get(result.lastInsertRowid);
    res.status(201).json(row);
  } catch (e: any) {
    if (e?.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(400).json({ error: "A group with this name already exists" });
    }
    throw e;
  }
});

// Mount API router so /api/* is handled (groups routes also on router for consistency)
app.use("/api", apiRouter);

// Ensure /api requests never fall through to Vite (return 404 if router didn't handle)
apiRouter.use((_req, res) => {
  res.status(404).setHeader("Content-Type", "application/json").json({ error: "API route not found" });
});

// Dev-only: never serve SPA for /api (guard before Vite)
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) {
    return res.status(404).setHeader("Content-Type", "application/json").json({ error: "API route not found" });
  }
  next();
});

// Vite middleware for development
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  // Hashed assets: long cache (1 year)
  app.use("/assets", express.static(path.join(__dirname, "dist/assets"), {
    maxAge: "1y",
    immutable: true,
  }));
  // Other static files: short cache
  app.use(express.static(path.join(__dirname, "dist"), {
    maxAge: "1h",
    index: false,
  }));
  // SPA fallback: no cache for index.html
  app.get("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
