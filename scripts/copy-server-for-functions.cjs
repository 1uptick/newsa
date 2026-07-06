/**
 * Copies server.ts and server/* into functions/src/server-app/ so the Cloud Function can use them.
 * Run before firebase deploy --only functions.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dest = path.join(root, "functions", "src", "server-app");

// Ensure dest exists
fs.mkdirSync(path.join(dest, "server"), { recursive: true });
const serverTs = fs.readFileSync(path.join(root, "server.ts"), "utf8");
let patched = serverTs.replace(/from "\.\/server\//g, 'from "./');
patched = patched.replace(/mailTransporter\.verify\(\(err\) =>/g, "mailTransporter.verify((err: Error | null) =>");
fs.writeFileSync(path.join(dest, "server", "index.ts"), patched);

function copyDirRecursive(srcDir, dstDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, dstPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

// Copy entire server/ directory so modular imports work (routes/, auth.ts, etc)
copyDirRecursive(path.join(root, "server"), path.join(dest, "server"));

console.log("Copied server code to functions/src/server-app/");
