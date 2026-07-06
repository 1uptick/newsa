/**
 * Frees ports used by `npm run dev` (Express + Vite HMR) so restarts don't hit EADDRINUSE.
 * Runs automatically via npm "predev" before "dev".
 */
const { execSync } = require("child_process");

const PORTS = [5001, 24679];

function freeWindows(ports) {
  for (const port of ports) {
    try {
      execSync(
        `powershell -NoProfile -Command "$pids = Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($p in $pids) { if ($p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } }"`,
        { stdio: "ignore" }
      );
    } catch {
      /* no listeners */
    }
    try {
      execSync(`for /f "tokens=5" %a in ('netstat -aon ^| findstr :${port} ^| findstr LISTENING') do taskkill /F /PID %a`, {
        shell: true,
        stdio: "ignore",
      });
    } catch {
      /* no listeners */
    }
  }
}

function freeUnix(ports) {
  for (const port of ports) {
    try {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, {
        shell: "/bin/sh",
        stdio: "ignore",
      });
    } catch {
      /* ignore */
    }
  }
}

if (process.platform === "win32") {
  freeWindows(PORTS);
} else {
  freeUnix(PORTS);
}
