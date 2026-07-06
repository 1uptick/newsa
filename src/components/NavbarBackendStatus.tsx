import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useNavbarSupplementValue } from "../contexts/NavbarSupplementContext";
import { usePageVisible } from "../hooks/usePageVisible";

type ActivityEntry = { id: string; ts: string; message: string };

type ActivityResponse = {
  latest: string | null;
  latestAt: string | null;
  activeJobs: number;
  entries: ActivityEntry[];
};

/** Fast cadence while the user is actively watching (dropdown open) or a job is running. */
const POLL_MS_ACTIVE = 2500;
/** Idle cadence: keep the strip roughly fresh without hammering the backend every 2.5s. */
const POLL_MS_IDLE = 15000;
const TOP_VISIBLE = 10;

function formatTs(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Status strip + dropdown for recent activity and long-running tasks. */
export function NavbarBackendStatus() {
  const centerSupplement = useNavbarSupplementValue();
  const { user, authFetch } = useAuth();
  const visible = usePageVisible();
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const busy = (data?.activeJobs ?? 0) > 0;

  const pull = useCallback(async () => {
    if (!user) {
      setData(null);
      return;
    }
    try {
      const res = await authFetch("/api/auth/activity", { cache: "no-store" });
      if (!res.ok) return;
      const j = (await res.json()) as ActivityResponse;
      if (j && Array.isArray(j.entries)) setData(j);
    } catch {
      /* ignore */
    }
  }, [user, authFetch]);

  // Poll only while the tab is visible. Use the fast cadence when the user is watching
  // (dropdown open) or a job is running; otherwise fall back to a relaxed idle cadence so a
  // logged-in session isn't firing an authenticated request every 2.5s for the whole app.
  useEffect(() => {
    if (!user || !visible) return;
    void pull();
    const intervalMs = open || busy ? POLL_MS_ACTIVE : POLL_MS_IDLE;
    const t = setInterval(() => void pull(), intervalMs);
    return () => clearInterval(t);
  }, [user, visible, open, busy, pull]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!user) return null;

  const activityLine = data?.latest?.trim() || (busy ? "Working in the background…" : "No recent activity");
  const supplement = centerSupplement?.trim() || "";
  const latest = supplement ? `${supplement} · ${activityLine}` : activityLine;
  const entries = data?.entries ?? [];
  const top = entries.slice(0, TOP_VISIBLE);
  const rest = entries.slice(TOP_VISIBLE);

  return (
    <div
      ref={wrapRef}
      className={`${supplement ? "flex" : "hidden md:flex"} flex-1 min-w-0 max-w-xl lg:max-w-2xl mx-2 lg:mx-4 relative justify-center`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full max-w-full flex items-center gap-2 min-w-0 rounded-lg border px-3 py-1.5 text-left text-xs transition-colors ${
          busy
            ? "border-primary/50 bg-primary/10 text-white shadow-[0_0_0_1px_rgba(248,182,45,0.15)]"
            : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
        }`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Recent activity"
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-primary" aria-hidden />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" aria-hidden />
        )}
        <span className="truncate flex-1 font-medium">{latest}</span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 top-full mt-1.5 w-full min-w-0 rounded-xl border border-white/15 bg-slate-900 shadow-2xl z-[120] overflow-hidden flex flex-col"
          role="listbox"
        >
          <div className="px-3 py-2 border-b border-white/10 bg-black/40">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Recent activity</p>
            {data?.latestAt ? (
              <p className="text-[10px] text-slate-500 mt-0.5 tabular-nums">Last update: {formatTs(data.latestAt)}</p>
            ) : null}
          </div>

          <div className="max-h-[min(18rem,50vh)] overflow-y-auto overscroll-contain">
            {entries.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-500 text-center">Nothing here yet. Actions like approving a topic or writing an article will show up.</p>
            ) : (
              <>
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-primary/90">
                  Latest {Math.min(TOP_VISIBLE, top.length)} updates
                </p>
                <ul className="px-2 pb-2 space-y-0.5">
                  {top.map((e) => (
                    <li
                      key={e.id}
                      className="rounded-md px-2 py-1.5 text-xs text-slate-200 bg-white/5 border border-transparent hover:border-white/10"
                    >
                      <span className="text-[10px] text-slate-500 tabular-nums block mb-0.5">{formatTs(e.ts)}</span>
                      <span className="leading-snug break-words">{e.message}</span>
                    </li>
                  ))}
                </ul>
                {rest.length > 0 ? (
                  <>
                    <div className="mx-2 border-t border-white/10" />
                    <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Earlier ({rest.length} more) — scroll
                    </p>
                    <ul className="px-2 pb-3 space-y-0.5">
                      {rest.map((e) => (
                        <li
                          key={e.id}
                          className="rounded-md px-2 py-1.5 text-xs text-slate-300 bg-black/20 border border-white/5"
                        >
                          <span className="text-[10px] text-slate-500 tabular-nums block mb-0.5">{formatTs(e.ts)}</span>
                          <span className="leading-snug break-words">{e.message}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
