/**
 * Centralized server-side configuration.
 * All API keys and secrets MUST be loaded only here and never exposed to the client.
 * The client should only call /api/* endpoints on this server; no secrets in Vite/build.
 */

import * as dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

function loadServiceAccountJson(): string | null {
  const fromEnv =
    process.env.FIREBASE_SERVICE_ACCOUNT && process.env.FIREBASE_SERVICE_ACCOUNT.trim();
  if (fromEnv) {
    const trimmed = fromEnv.trim();
    if (trimmed.startsWith("{")) return trimmed;
    const keyPath = path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
    try {
      const content = fs.readFileSync(keyPath, "utf8");
      return content;
    } catch (e) {
      console.error("Firebase Admin: failed to read key file at", keyPath, e);
      return null;
    }
  }
  const pathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  if (pathEnv) {
    const keyPath = path.isAbsolute(pathEnv) ? pathEnv : path.resolve(process.cwd(), pathEnv);
    try {
      return fs.readFileSync(keyPath, "utf8");
    } catch (e) {
      console.error("Firebase Admin: failed to read key file at", keyPath, e);
      return null;
    }
  }
  return null;
}

export const config = {
  port: Number(process.env.PORT) || 5001,

  // Airtable (server-only)
  airtable: {
    apiKey: process.env.AIRTABLE_API_KEY ?? "",
    baseId: process.env.AIRTABLE_BASE_ID ?? "",
    tableId: process.env.AIRTABLE_TABLE_ID ?? "",
    capitalTableId: process.env.AIRTABLE_CAPITAL_TABLE_ID ?? "",
  },

  // Firebase Admin (server-only)
  firebase: {
    serviceAccountJson: loadServiceAccountJson(),
  },

  // Supabase (server-only; service role key must never go to client)
  supabase: {
    url: process.env.SUPABASE_URL ?? "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  },

  // OpenRouter / LLM (server-only)
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
  },

  // Gemini (server-only; do not expose via Vite define)
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? "",
  },

  // SMTP (server-only). In production set SMTP_* and APP_BASE_URL in the host environment.
  smtp: {
    host: process.env.SMTP_HOST?.trim() ?? "",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true" || process.env.SMTP_SECURE === "1",
    user: process.env.SMTP_USER?.trim() ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.SMTP_FROM?.trim() || process.env.SMTP_USER || "noreply@newsa.io",
    // Set SMTP_TLS_REJECT_UNAUTHORIZED=false only if your provider uses a self-signed cert and verify fails.
    tlsRejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false",
  },

  // App URL for emails (server-only)
  appBaseUrl: process.env.APP_BASE_URL?.trim() || "http://localhost:5001",

  // Initial admin emails (optional)
  initialAdminEmails: (process.env.INITIAL_ADMIN_EMAIL || "support@1uptick.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
} as const;

/** Whether Airtable is configured (API key + base). */
export const isAirtableConfigured = Boolean(config.airtable.apiKey && config.airtable.baseId);

/** Whether Supabase is configured. */
export const isSupabaseConfigured = Boolean(config.supabase.url && config.supabase.serviceRoleKey);

/** Whether OpenRouter is configured. */
export const isOpenRouterConfigured = Boolean(config.openrouter.apiKey);

/** Whether Gemini is configured (for server-side article generation). */
export const isGeminiConfigured = Boolean(config.gemini.apiKey);
