#!/usr/bin/env node
/**
 * Security check: ensure no server-only secrets are exposed to the client.
 * Run: node scripts/security-check.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");
const ALLOWED_CLIENT_ENV_PREFIXES = ["VITE_"];
const SECRET_ENV_NAMES = [
  "AIRTABLE_API_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "REQUESTY_API_KEY",
  "GEMINI_API_KEY",
  "FIREBASE_SERVICE_ACCOUNT",
  "SMTP_PASS",
  "SMTP_USER",
];

function getAllFiles(dir, ext = ".ts,.tsx,.js,.jsx", out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "dist" && e.name !== "build")
        getAllFiles(full, ext, out);
    } else if (ext.split(",").some((x) => e.name.endsWith(x))) {
      out.push(full);
    }
  }
  return out;
}

function checkClientEnvUsage() {
  const clientFiles = getAllFiles(SRC);
  const issues = [];
  for (const file of clientFiles) {
    const content = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);
    const processEnvMatches = content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g);
    for (const m of processEnvMatches) {
      const varName = m[1];
      if (!ALLOWED_CLIENT_ENV_PREFIXES.some((p) => varName.startsWith(p))) {
        issues.push({
          file: rel,
          rule: "client_process_env",
          message: `Client code should not use process.env.${varName}. Use import.meta.env.VITE_* for client config.`,
        });
      }
    }
    const metaEnvMatches = content.matchAll(/import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g);
    for (const m of metaEnvMatches) {
      const varName = m[1];
      if (!ALLOWED_CLIENT_ENV_PREFIXES.some((p) => varName.startsWith(p))) {
        issues.push({
          file: rel,
          rule: "client_meta_env",
          message: `Only VITE_* vars are exposed to the client. import.meta.env.${varName} may expose secrets.`,
        });
      }
    }
  }
  return issues;
}

function checkGitignore() {
  const gitignorePath = path.join(ROOT, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    return [{ rule: "gitignore", message: ".gitignore missing" }];
  }
  const content = fs.readFileSync(gitignorePath, "utf8");
  if (!content.includes(".env") && !content.includes(".env*")) {
    return [{ rule: "gitignore", message: ".gitignore should include .env or .env* to avoid committing secrets" }];
  }
  return [];
}

function checkViteConfig() {
  const vitePath = path.join(ROOT, "vite.config.ts");
  if (!fs.existsSync(vitePath)) return [];
  const content = fs.readFileSync(vitePath, "utf8");
  const issues = [];
  for (const name of SECRET_ENV_NAMES) {
    if (content.includes(name) && (content.includes("define") || content.includes("loadEnv"))) {
      issues.push({
        file: "vite.config.ts",
        rule: "vite_define_secret",
        message: `vite.config should NOT inject ${name} into the client bundle. Keep secrets on the server (server/config.ts).`,
      });
    }
  }
  return issues;
}

function main() {
  console.log("Running security check...\n");
  const all = [...checkClientEnvUsage(), ...checkGitignore(), ...checkViteConfig()];
  if (all.length === 0) {
    console.log("OK – No obvious secret exposure detected.");
    console.log("  - Client code uses only VITE_* or relative API URLs.");
    console.log("  - .env is ignored by git.");
    console.log("  - Vite config does not inject server secrets.");
    process.exit(0);
  }
  console.log("Issues found:\n");
  for (const i of all) {
    console.log(`  [${i.rule}] ${i.file || ""}`);
    console.log(`    ${i.message}\n`);
  }
  process.exit(1);
}

main();
