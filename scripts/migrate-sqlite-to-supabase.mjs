#!/usr/bin/env node
/**
 * One-time migration: newsa.db (SQLite) → Supabase.
 *
 * Prerequisites:
 *   1. Run supabase/schema.sql in Supabase SQL Editor
 *   2. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
 *
 * Usage:
 *   node scripts/migrate-sqlite-to-supabase.mjs [path/to/newsa.db]
 */
import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const dbPath = process.argv[2] || path.resolve(process.cwd(), "newsa.db");
const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.");
  process.exit(1);
}

const supabase = createClient(url, key);
const sqlite = new Database(dbPath, { readonly: true });

async function upsertTable(table, rows, onConflict) {
  if (!rows.length) {
    console.log(`  ${table}: 0 rows (skip)`);
    return;
  }
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`  ${table}: ${rows.length} rows migrated`);
}

async function main() {
  console.log(`Reading SQLite: ${dbPath}`);
  console.log(`Target Supabase: ${url}`);
  console.log("");

  const groups = sqlite.prepare("SELECT id, name, created_at FROM groups ORDER BY id").all();
  const userRoles = sqlite
    .prepare("SELECT firebase_uid, role, group_id, email, created_at FROM user_roles")
    .all();
  const invitations = sqlite
    .prepare("SELECT id, code, role, used, email, group_id, created_at FROM invitations ORDER BY id")
    .all();
  const tokens = sqlite
    .prepare("SELECT token, email, expires_at, created_at FROM password_reset_tokens")
    .all();

  console.log("Migrating groups...");
  await upsertTable(
    "groups",
    groups.map((g) => ({ id: g.id, name: g.name, created_at: g.created_at })),
    "id"
  );

  console.log("Migrating user_roles...");
  await upsertTable(
    "user_roles",
    userRoles.map((r) => ({
      firebase_uid: r.firebase_uid,
      role: r.role,
      group_id: r.group_id ?? null,
      email: r.email ?? null,
      created_at: r.created_at,
    })),
    "firebase_uid"
  );

  console.log("Migrating invitations...");
  await upsertTable(
    "invitations",
    invitations.map((i) => ({
      id: i.id,
      code: i.code,
      role: i.role || "client",
      used: i.used ?? 0,
      email: i.email ?? null,
      group_id: i.group_id ?? null,
      created_at: i.created_at,
    })),
    "id"
  );

  console.log("Migrating password_reset_tokens...");
  await upsertTable(
    "password_reset_tokens",
    tokens.map((t) => ({
      token: t.token,
      email: t.email,
      expires_at: t.expires_at,
      created_at: t.created_at,
    })),
    "token"
  );

  sqlite.close();
  console.log("");
  console.log("Done. Verify in Supabase Dashboard, then deploy latest code with SUPABASE_* in .env.");
}

main().catch((e) => {
  console.error("Migration failed:", e.message || e);
  process.exit(1);
});
