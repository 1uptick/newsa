import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";

function tourDoneStorageKey(firebaseUid: string) {
  return `newsa.atfxTopics.tour.v1.${firebaseUid}`;
}

const TOUR_DONE_LEGACY_KEY = "newsa.atfxTopics.tour.v1";

const GAP_PX = 16;
const CARD_MAX_W_PX = 448;

type Hole = { top: number; left: number; width: number; height: number };

function tooltipFixedStyle(placementKey: string, hole: Hole): React.CSSProperties {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const cardW = Math.min(vw * 0.92, CARD_MAX_W_PX);
  const estCardH = Math.min(440, vh * 0.58);
  const holeMidX = hole.left + hole.width / 2;
  const holeBottom = hole.top + hole.height;

  if (placementKey === "newsPanel") {
    let left = GAP_PX;
    let top = hole.top;
    top = Math.max(GAP_PX, Math.min(top, vh - estCardH - GAP_PX));
    return {
      position: "fixed",
      left,
      top,
      width: cardW,
      maxHeight: `min(calc(100vh - ${GAP_PX * 2}px), 30rem)`,
    };
  }

  if (placementKey === "seoTrending") {
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
      maxHeight: `min(calc(100vh - ${GAP_PX * 2}px), 30rem)`,
    };
  }

  if (placementKey === "topicCard") {
    let left = hole.left - cardW - GAP_PX;
    let top = hole.top;
    if (left < GAP_PX) {
      left = holeMidX - cardW / 2;
      top = holeBottom + GAP_PX;
      if (top + estCardH > vh - GAP_PX) {
        top = hole.top - estCardH - GAP_PX;
      }
    }
    top = Math.max(GAP_PX, Math.min(top, vh - estCardH - GAP_PX));
    left = Math.max(GAP_PX, Math.min(left, vw - cardW - GAP_PX));
    return {
      position: "fixed",
      left,
      top,
      width: cardW,
      maxHeight: `min(calc(100vh - ${GAP_PX * 2}px), 30rem)`,
    };
  }

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
    maxHeight: `min(calc(100vh - ${GAP_PX * 2}px), 30rem)`,
  };
}

const STEPS: { id: string; title: string; paragraphs: string[] }[] = [
  {
    id: "audience",
    title: "Retail or institutional topics",
    paragraphs: [
      "Before you generate a topic, choose whether the content is aimed at retail traders or institutional clients. That setting guides tone, depth, and how the AI frames the SEO angle.",
      "You can switch anytime — each new generation uses the audience you have selected.",
    ],
  },
  {
    id: "fresh",
    title: "Generate fresh topics",
    paragraphs: [
      "Use Generate fresh topics when you want the AI to run a new research pass on the latest market trends and produce ready-to-review SEO topic ideas for ATFX.",
      "You pick retail or institutional in the dialog and how many topics to create in one run.",
      "If you plan to generate multiple topics, generate 2–3 in a single run rather than running three separate generations. We review prior topics to reduce repetition, and we vary the AI models and settings across topic #2/#3 to improve diversity.",
    ],
  },
  {
    id: "seoTrending",
    title: "Custom keywords and trending ideas",
    paragraphs: [
      "Under Generate a new SEO Topic, type your own theme or keywords, then run Generate.",
      "The Trending Keywords chart shows what is hot in HK or Global — drag a bubble into the topic box above to seed a new topic, or combine bubbles with your own text.",
    ],
  },
  {
    id: "newsDrawer",
    title: "Trending news panel",
    paragraphs: [
      "The tour highlights the Trending button first; then the panel slides open with the same animation as when you use it for real.",
      "Browse headlines, filter by category, and generate an ATFX SEO topic from a story when it fits your plan.",
    ],
  },
  {
    id: "approve",
    title: "Open a topic and approve",
    paragraphs: [
      "Each card is a proposed topic waiting on the Pending Approval tab. Click a card to open it.",
      "Review the details in the window that opens, then tap Approve to send it into article generation.",
    ],
  },
];

export type AtfxTopicsTourRefs = {
  audienceRef: React.RefObject<HTMLElement | null>;
  freshTopicsRef: React.RefObject<HTMLElement | null>;
  seoTrendingRef: React.RefObject<HTMLElement | null>;
  trendingButtonRef: React.RefObject<HTMLElement | null>;
  newsDrawerRef: React.RefObject<HTMLElement | null>;
  newsDrawerGenerateIconRef: React.RefObject<HTMLElement | null>;
  topicCardRef: React.RefObject<HTMLElement | null>;
  topicEmptyRef: React.RefObject<HTMLElement | null>;
};

type Props = {
  refs: AtfxTopicsTourRefs;
  enabled: boolean;
  autoTourEligible: boolean;
  tourUserId: string | null;
  manualOpen?: boolean;
  /** Open the news drawer (used mid-step with a short delay). */
  onOpenNewsDrawer: () => void;
  /** Close the drawer when leaving the news step or ending the tour. */
  onCloseNewsDrawer: () => void;
  /** Switch to Pending Approval and close the news drawer for the final step. */
  onPrepareApproveStep: () => void;
};

export function AtfxTopicsTour({
  refs,
  enabled,
  autoTourEligible,
  tourUserId,
  manualOpen = false,
  onOpenNewsDrawer,
  onCloseNewsDrawer,
  onPrepareApproveStep,
}: Props) {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [hole, setHole] = useState<Hole | null>(null);
  const [newsPhase, setNewsPhase] = useState<"button" | "panel" | "icon">("button");
  const [newsTooltipAnchorHole, setNewsTooltipAnchorHole] = useState<Hole | null>(null);
  const prepareApproveRef = useRef(onPrepareApproveStep);
  prepareApproveRef.current = onPrepareApproveStep;

  useEffect(() => {
    if (!enabled || manualOpen || !autoTourEligible || !tourUserId) return;
    let cancelled = false;
    try {
      if (localStorage.getItem(TOUR_DONE_LEGACY_KEY) === "1") return;
      if (localStorage.getItem(tourDoneStorageKey(tourUserId)) === "1") return;
    } catch {
      /* ignore */
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
    onCloseNewsDrawer();
    setOpen(false);
  }, [tourUserId, onCloseNewsDrawer]);

  const step = STEPS[stepIndex];

  useEffect(() => {
    if (!open) return;
    if (step?.id !== "newsDrawer") {
      onCloseNewsDrawer();
      setNewsPhase("button");
      setNewsTooltipAnchorHole(null);
    }
  }, [open, step?.id, onCloseNewsDrawer]);

  useEffect(() => {
    if (!open || step?.id !== "newsDrawer") return;
    setNewsPhase("button");
    const t = window.setTimeout(() => {
      onOpenNewsDrawer();
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setNewsPhase("panel"));
        window.setTimeout(() => setNewsPhase("icon"), 600);
      });
    }, 750);
    return () => clearTimeout(t);
  }, [open, stepIndex, step?.id, onOpenNewsDrawer]);

  useEffect(() => {
    if (!open || step?.id !== "approve") return;
    prepareApproveRef.current();
  }, [open, step?.id]);

  const placementKeyForStep = useCallback(() => {
    if (!step) return "default";
    if (step.id === "newsDrawer" && newsPhase !== "button") return "newsPanel";
    if (step.id === "seoTrending") return "seoTrending";
    if (step.id === "approve") return "topicCard";
    return "default";
  }, [step, newsPhase]);

  const measureHole = useCallback(() => {
    if (!open || !step) {
      setHole(null);
      return;
    }
    const pad = 10;
    const measureEl = (el: HTMLElement | null) => {
      if (!el) return null;
      el.scrollIntoView({ block: "nearest", behavior: "auto" });
      const r = el.getBoundingClientRect();
      return {
        top: r.top - pad,
        left: r.left - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      } as Hole;
    };

    if (step.id === "audience") {
      setHole(measureEl(refs.audienceRef.current));
      return;
    }
    if (step.id === "fresh") {
      setHole(measureEl(refs.freshTopicsRef.current));
      return;
    }
    if (step.id === "seoTrending") {
      setHole(measureEl(refs.seoTrendingRef.current));
      return;
    }
    if (step.id === "newsDrawer") {
      // Keep the tooltip card anchored to the panel location (so it doesn't jump
      // when we animate the spotlight onto the icon).
      const el =
        newsPhase === "button"
          ? refs.trendingButtonRef.current
          : newsPhase === "icon"
            ? refs.newsDrawerGenerateIconRef.current
            : refs.newsDrawerRef.current;
      const h = measureEl(el);
      setHole(h);
      if (newsPhase !== "button") {
        const anchor = measureEl(refs.newsDrawerRef.current);
        if (anchor) setNewsTooltipAnchorHole(anchor);
      }
      return;
    }
    if (step.id === "approve") {
      const cardEl = refs.topicCardRef.current;
      const emptyEl = refs.topicEmptyRef.current;
      const h = measureEl(cardEl ?? emptyEl);
      setHole(h);
      return;
    }
    setHole(null);
  }, [open, step, newsPhase, refs]);

  useLayoutEffect(() => {
    if (!open) return;
    measureHole();
    const onChange = () => measureHole();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onChange) : null;
    const nodes = [
      refs.audienceRef.current,
      refs.freshTopicsRef.current,
      refs.seoTrendingRef.current,
      refs.trendingButtonRef.current,
      refs.newsDrawerRef.current,
      refs.topicCardRef.current,
      refs.topicEmptyRef.current,
    ];
    nodes.forEach((n) => {
      if (n && ro) ro.observe(n);
    });
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
      ro?.disconnect();
    };
  }, [open, stepIndex, newsPhase, measureHole, refs]);

  useEffect(() => {
    if (!open || step?.id !== "approve") return;
    const t = window.setTimeout(() => measureHole(), 450);
    return () => clearTimeout(t);
  }, [open, step?.id, measureHole]);

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
  const centerCard = !hole;
  const placementKey = placementKeyForStep();
  const tooltipHole =
    step.id === "newsDrawer" && newsTooltipAnchorHole ? newsTooltipAnchorHole : hole;
  const tooltipStyle =
    !centerCard && tooltipHole ? tooltipFixedStyle(placementKey, tooltipHole) : undefined;

  const panel = (
    <div
      className={`fixed inset-0 z-[130] flex flex-col pointer-events-none ${centerCard ? "items-center justify-center p-4" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="atfx-topics-tour-title"
      aria-describedby="atfx-topics-tour-desc"
    >
      <div className="absolute inset-0 pointer-events-auto" aria-hidden>
        {centerCard ? (
          <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-[2px]" />
        ) : (
          <>
            <div
              className="absolute left-0 right-0 top-0 bg-slate-900/70 transition-[height] duration-500 ease-in-out"
              style={{ height: Math.max(0, hole.top) }}
            />
            <div
              className="absolute left-0 bg-slate-900/70 transition-[width,top,height] duration-500 ease-in-out"
              style={{
                top: hole.top,
                width: Math.max(0, hole.left),
                height: hole.height,
              }}
            />
            <div
              className="absolute right-0 bg-slate-900/70 transition-[top,height,left] duration-500 ease-in-out"
              style={{
                top: hole.top,
                left: hole.left + hole.width,
                height: hole.height,
              }}
            />
            <div
              className="absolute left-0 right-0 bottom-0 bg-slate-900/70 transition-[top] duration-500 ease-in-out"
              style={{ top: hole.top + hole.height }}
            />
            <div
              className="absolute rounded-xl pointer-events-none ring-4 ring-[#ff7900] shadow-[0_0_0_4px_rgba(255,121,0,0.3)] transition-all duration-500 ease-in-out"
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

      <div
        className={`pointer-events-auto z-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl flex flex-col overflow-hidden ${
          centerCard
            ? "relative m-auto w-[min(92vw,28rem)] min-h-[22rem] max-h-[min(85vh,40rem)]"
            : "overflow-y-auto"
        }`}
        style={tooltipStyle}
      >
        <div className="flex items-start gap-3 mb-4 shrink-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ff7900]/10 text-[#ff7900]">
            <Sparkles className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Step {stepIndex + 1} of {STEPS.length}
            </p>
            <h2 id="atfx-topics-tour-title" className="text-lg font-bold text-slate-900 leading-tight">
              {step.title}
            </h2>
          </div>
        </div>
        <div
          id="atfx-topics-tour-desc"
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
