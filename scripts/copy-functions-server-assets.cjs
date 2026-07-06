/**
 * Copies server static assets (e.g. ATFX logo) into functions/lib after tsc.
 * Required because TypeScript does not emit non-.ts files.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const logoSrc = path.join(root, "public", "atfx logo.png");

if (!fs.existsSync(logoSrc)) {
  console.warn("[copy-functions-server-assets] Missing public/atfx logo.png — skip.");
  process.exit(0);
}

const targets = [
  path.join(root, "functions", "lib", "server-app", "server", "assets"),
  path.join(root, "functions", "src", "server-app", "server", "assets"),
  path.join(root, "server", "assets"),
];

for (const dir of targets) {
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(logoSrc, path.join(dir, "atfx-logo.png"));
}

console.log("Copied ATFX logo into functions/server assets.");
