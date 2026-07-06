import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";

/** Per Firebase user so each Capital account gets the auto tour once. */
function tourDoneStorageKey(firebaseUid: string) {
  return `newsa.capitalDashboard.tour.v1.${firebaseUid}`;
}

/** Pre–per-user key: if set, do not auto-run for anyone on this browser. */
const TOUR_DONE_LEGACY_KEY = "newsa.capitalDashboard.tour.v1";

const GAP_PX = 16;
const CARD_MAX_W_PX = 448; // matches max-w-md-ish / 28rem

type Hole = { top: number; left: number; width: number; height: number };

/** Keep the tooltip out of the spotlight so it does not cover the highlighted panel. */
function tooltipFixedStyle(stepId: string, hole: Hole): React.CSSProperties {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const cardW = Math.min(vw * 0.92, CARD_MAX_W_PX);
  /** Conservative height budget for placement (card scrolls if content is taller). */
  const estCardH = Math.min(340, vh * 0.45);

  const holeMidX = hole.left + hole.width / 2;
  const holeBottom = hole.top + hole.height;

  if (stepId === "approved") {
    // Desktop: sit in the main column to the right of the sidebar highlight.
    let left = hole.left + hole.width + GAP_PX;
    let top = hole.top;
    if (left + cardW > vw - GAP_PX) {
      left = Math.max(GAP_PX, (vw - cardW) / 2);
      top = holeBottom + GAP_PX;
    }
    top = Math.max(GAP_PX, Math.min(top, vh - estCardH - GAP_PX));
    left = Math.max(GAP_PX, Math.min(left, vw - cardW - GAP_PX));
    return {
      position: "fixed",
      left,
      top,
      width: cardW,
      maxHeight: `min(calc(100vh - ${GAP_PX * 2}px), 22rem)`,
    };
  }

  // ready: highlight is low on the page — prefer above the block so the card stays on-screen
  if (stepId === "ready") {
    let top = hole.top - estCardH - GAP_PX;
    if (top < GAP_PX) {
      top = holeBottom + GAP_PX;
    }
    top = Math.max(GAP_PX, Math.min(top, vh - estCardH - GAP_PX));
    let left = holeMidX - cardW / 2;
    left = Math.max(GAP_PX, Math.min(left, vw - cardW - GAP_PX));
    return {
      position: "fixed",
      left,
      top,
      width: cardW,
      maxHeight: `min(calc(100vh - ${GAP_PX * 2}px), 22rem)`,
    };
  }

  // pending: prefer below the highlight, else above
  let top = holeBottom + GAP_PX;
  if (top + estCardH > vh - GAP_PX) {
    top = hole.top - estCardH - GAP_PX;
  }
  top = Math.max(GAP_PX, top);

  let left = holeMidX - cardW / 2;
  left = Math.max(GAP_PX, Math.min(left, vw - cardW - GAP_PX));

  return {
    position: "fixed",
    left,
    top,
    width: cardW,
    maxHeight: `min(calc(100vh - ${GAP_PX * 2}px), 22rem)`,
  };
}

const STEPS: { id: string; title: string; paragraphs: string[] }[] = [
  {
    id: "welcome",
    title: "Welcome to your Capital dashboard",
    paragraphs: [
      "The purpose of this system is to streamline your content production process—from topic ideas through research, writing, and handoff when articles are ready to post.",
      "This quick tour walks through how topics move from approval to finished content. You can skip anytime.",
    ],
  },
  {
    id: "pending",
    title: "Pending approval topics",
    paragraphs: [
      "Our team generates SEO-focused, trending topics for you to approve. When something new needs your decision, we email you so you do not miss it.",
      "If you want our team to run deep research and produce detailed content for a topic, approve it. Add any special requests in the comment area when you review the topic.",
    ],
  },
  {
    id: "approved",
    title: "Approved topics",
    paragraphs: [
      "Once you approve a topic, our team runs deep research and creates unique, customized content tailored to your strategy.",
      "Production can take up to 24 hours. Approved topics stay listed here while work is in progress.",
    ],
  },
  {
    id: "ready",
    title: "Ready to post",
    paragraphs: [
      "When an article is ready, we email you again. Open a row to preview, use Edit to refine it in Articles, and download HTML or plain text from there when you need a file.",
      "For articles from April 2026 onward, a New tag appears until you open the preview once—so you can spot fresh items quickly.",
    ],
  },
];

export type CapitalDashboardTourRefs = {
  pendingRef: React.RefObject<HTMLDivElement | null>;
  approvedRef: React.RefObject<HTMLDivElement | null>;
  readyRef: React.RefObject<HTMLDivElement | null>;
};

type Props = {
  refs: CapitalDashboardTourRefs;
  /** Start tour only when dashboard shell is ready (e.g. main column loaded). */
  enabled: boolean;
  /** Only Capital group clients get the automatic first-login tour. */
  autoTourEligible: boolean;
  /** Firebase uid — required for auto tour and for persisting “done” per user. */
  tourUserId: string | null;
  /** From `?capitaltour` — opens tour even if the user finished it before. */
  manualOpen?: boolean;
};

export function CapitalDashboardTour({
  refs,
  enabled,
  autoTourEligible,
  tourUserId,
  manualOpen = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [hole, setHole] = useState<Hole | null>(null);

  useEffect(() => {
    if (!enabled || manualOpen || !autoTourEligible || !tourUserId) return;
    let cancelled = false;
    try {
      if (localStorage.getItem(TOUR_DONE_LEGACY_KEY) === "1") return;
      if (localStorage.getItem(tourDoneStorageKey(tourUserId)) === "1") return;
    } catch {
      /* private mode etc. */
    }
    const t = window.setTimeout(() => {
      if (!cancelled) setOpen(true);
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [enabled, manualOpen, autoTourEligible, tourUserId]);

  useEffect(() => {
    if (!enabled || !manualOpen) return;
    setStepIndex(0);
    let cancelled = false;
    const t = window.setTimeout(() => {
      if (!cancelled) setOpen(true);
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [enabled, manualOpen]);

  const complete = useCallback(() => {
    try {
      if (tourUserId) {
        localStorage.setItem(tourDoneStorageKey(tourUserId), "1");
      }
    } catch {
      /* ignore */
    }
    setOpen(false);
  }, [tourUserId]);

  const step = STEPS[stepIndex];
  const isWelcome = step?.id === "welcome";

  const measureHole = useCallback(() => {
    if (!open || !step) {
      setHole(null);
      return;
    }
    if (isWelcome) {
      setHole(null);
      return;
    }
    const refMap = {
      pending: refs.pendingRef,
      approved: refs.approvedRef,
      ready: refs.readyRef,
    } as const;
    const key = step.id as keyof typeof refMap;
    const el = refMap[key]?.current;
    if (!el) {
      setHole(null);
      return;
    }
    el.scrollIntoView({ block: "nearest", behavior: "auto" });
    const r = el.getBoundingClientRect();
    const pad = 10;
    setHole({
      top: r.top - pad,
      left: r.left - pad,
      width: r.width + pad * 2,
      height: r.height + pad * 2,
    });
  }, [open, step, isWelcome, refs.pendingRef, refs.approvedRef, refs.readyRef]);

  useLayoutEffect(() => {
    if (!open) return;
    measureHole();
    const onChange = () => measureHole();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onChange) : null;
    if (ro) {
      [refs.pendingRef.current, refs.approvedRef.current, refs.readyRef.current].forEach((n) => {
        if (n) ro.observe(n);
      });
    }
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
      ro?.disconnect();
    };
  }, [open, stepIndex, measureHole, refs.pendingRef, refs.approvedRef, refs.readyRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") complete();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, complete]);

  if (!open || !step) return null;

  const isLast = stepIndex >= STEPS.length - 1;

  const centerCard = isWelcome || !hole;

  const panel = (
    <div
      className={`fixed inset-0 z-[120] flex flex-col pointer-events-none ${centerCard ? "items-center justify-center p-4" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="capital-dashboard-tour-title"
      aria-describedby="capital-dashboard-tour-desc"
    >
      {/* Dim layer + spotlight (four panels so clicks are blocked outside the hole) */}
      <div className="absolute inset-0 pointer-events-auto" aria-hidden>
        {isWelcome || !hole ? (
          <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-[2px]" />
        ) : (
          <>
            <div
              className="absolute left-0 right-0 top-0 bg-slate-900/70 transition-[height] duration-300 ease-out"
              style={{ height: Math.max(0, hole.top) }}
            />
            <div
              className="absolute left-0 bg-slate-900/70 transition-[width,top,height] duration-300 ease-out"
              style={{
                top: hole.top,
                width: Math.max(0, hole.left),
                height: hole.height,
              }}
            />
            <div
              className="absolute right-0 bg-slate-900/70 transition-[top,height,left] duration-300 ease-out"
              style={{
                top: hole.top,
                left: hole.left + hole.width,
                height: hole.height,
              }}
            />
            <div
              className="absolute left-0 right-0 bottom-0 bg-slate-900/70 transition-[top] duration-300 ease-out"
              style={{ top: hole.top + hole.height }}
            />
            <div
              className="absolute rounded-xl pointer-events-none ring-4 ring-[#ff7900] shadow-[0_0_0_4px_rgba(255,121,0,0.3)] transition-all duration-300 ease-out"
              style={{
                top: hole.top,
                left: hole.left,
                width: hole.width,
                height: hole.height,
              }}
            />
          </>
        )}
      </div>

      {/* Tooltip card — welcome centered; other steps positioned from spotlight */}
      <div
        className={`pointer-events-auto z-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl flex flex-col overflow-hidden ${
          isWelcome || !hole
            ? "relative m-auto w-[min(92vw,28rem)] max-h-[min(85vh,32rem)]"
            : "overflow-y-auto"
        }`}
        style={!isWelcome && hole ? tooltipFixedStyle(step.id, hole) : undefined}
      >
        <div className="flex items-start gap-3 mb-4 shrink-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff7900]/10 text-[#ff7900]">
            <Sparkles className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Step {stepIndex + 1} of {STEPS.length}
            </p>
            <h2 id="capital-dashboard-tour-title" className="text-lg font-bold text-slate-900 leading-tight">
              {step.title}
            </h2>
          </div>
        </div>
        <div
          id="capital-dashboard-tour-desc"
          className="space-y-3 text-sm text-slate-600 leading-relaxed min-h-0 overflow-y-auto pr-1 -mr-1"
        >
          {step.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={complete}
            className="text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => setStepIndex((i) => i - 1)}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (isLast) complete();
                else setStepIndex((i) => i + 1);
              }}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#ff7900] hover:bg-[#e56d00] transition-colors"
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
