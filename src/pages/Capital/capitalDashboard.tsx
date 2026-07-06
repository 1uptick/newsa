import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Loader2, X, Send, Clock, Hash, Share2, Target, Zap, TrendingUp, Check, Plus, MessageSquareText, CheckCircle, BarChart3, Settings, Pencil, Download } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../../contexts/AuthContext";
import { groupNameToId } from "../../config/menu";
import { escapeAttr, getHtmlContent, getMarkdownHtml, htmlToPlainText } from "../../lib/html";
import { formatDate } from "../../lib/date";
import type { DashboardItem, PendingItem } from "./types";
import { CapitalDashboardTour } from "./CapitalDashboardTour";
import { ContentAreaLoader } from "../../components/ContentAreaLoader";

const ESTIMATED_ROW_HEIGHT_PX = 56;
const MIN_PAGE_SIZE = 10;
/** How long the Ready to Post "Sent" badge shows after a Capital Articles notify email. */
const CAPITAL_NOTIFY_BADGE_TTL_MS = 72 * 60 * 60 * 1000;

function isCapitalNotifyBadgeActive(notifySentAt: string | null | undefined): boolean {
  if (notifySentAt == null || typeof notifySentAt !== "string") return false;
  const trimmed = notifySentAt.trim();
  if (!trimmed) return false;
  const t = Date.parse(trimmed);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < CAPITAL_NOTIFY_BADGE_TTL_MS;
}

function safeDownloadFilename(title: string, ext: string): string {
  const base =
    (title || "article")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "article";
  return `${base}.${ext}`;
}

function triggerTextDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const PIE_COLORS = ["#ff7900", "#fece24", "#4ade80", "#60a5fa", "#a78bfa", "#f472b6", "#94a3b8"];

const PIE_VIEWBOX_W = 500;
const PIE_VIEWBOX_H = 200;
const PIE_CX = 250;
const PIE_CY = 100;
const PIE_OUTER_R = 72;
const PIE_INNER_R = 46;
const LABEL_X_OFFSET = 165;
const ELBOW_X_OFFSET = 120;

function PieChart({ data }: { data: { category: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return null;

  let cumulative = 0;
  let rightSideCount = 0;
  let leftSideCount = 0;
  
  const rawSlices = data.map((d, i) => {
    const pct = d.count / total;
    const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    cumulative += pct;
    const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    const midAngle = (startAngle + endAngle) / 2;
    const cos = Math.cos(midAngle);
    const sin = Math.sin(midAngle);
    const onRight = cos >= 0;
    
    if (onRight) rightSideCount++;
    else leftSideCount++;

    return {
      startAngle,
      endAngle,
      midAngle,
      pct,
      onRight,
      category: d.category,
      count: d.count,
      i,
    };
  });

  const LABEL_Y_STEP = 34;

  const edgeYFor = (midAngle: number) => PIE_CY + PIE_OUTER_R * Math.sin(midAngle);
  const leftByY = rawSlices
    .filter((s) => !s.onRight)
    .slice()
    .sort((a, b) => edgeYFor(a.midAngle) - edgeYFor(b.midAngle));
  const rightByY = rawSlices
    .filter((s) => s.onRight)
    .slice()
    .sort((a, b) => edgeYFor(a.midAngle) - edgeYFor(b.midAngle));
  const leftRankByIndex = new Map(leftByY.map((s, rank) => [s.i, rank]));
  const rightRankByIndex = new Map(rightByY.map((s, rank) => [s.i, rank]));

  const sliceInfo = rawSlices.map((s) => {
    const { midAngle, onRight, i } = s;
    const cos = Math.cos(midAngle);
    
    const edgeX = PIE_CX + PIE_OUTER_R * cos;
    const edgeY = PIE_CY + PIE_OUTER_R * Math.sin(midAngle);
    
    const elbowX = PIE_CX + ELBOW_X_OFFSET * (onRight ? 1 : -1);
    const labelX = PIE_CX + LABEL_X_OFFSET * (onRight ? 1 : -1);
    
    // Stack labels by vertical slice position on each side so leader lines don't cross.
    let labelY;
    if (onRight) {
      const rank = rightRankByIndex.get(i) ?? 0;
      const startY = PIE_CY - ((rightSideCount - 1) * LABEL_Y_STEP) / 2;
      labelY = startY + rank * LABEL_Y_STEP;
    } else {
      const rank = leftRankByIndex.get(i) ?? 0;
      const startY = PIE_CY - ((leftSideCount - 1) * LABEL_Y_STEP) / 2;
      labelY = startY + rank * LABEL_Y_STEP;
    }

    return {
      ...s,
      largeArc: s.pct > 0.5 ? 1 : 0,
      pctRounded: Math.round(s.pct * 100),
      edgeX,
      edgeY,
      elbowX,
      elbowY: labelY,
      labelX,
      labelY,
      color: PIE_COLORS[i % PIE_COLORS.length],
    };
  });

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-full h-full relative">
        <svg
          viewBox={`0 0 ${PIE_VIEWBOX_W} ${PIE_VIEWBOX_H}`}
          className="w-full h-full drop-shadow-sm"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Slices */}
          {sliceInfo.map((s) => {
            const x1_out = PIE_CX + PIE_OUTER_R * Math.cos(s.startAngle);
            const y1_out = PIE_CY + PIE_OUTER_R * Math.sin(s.startAngle);
            const x2_out = PIE_CX + PIE_OUTER_R * Math.cos(s.endAngle);
            const y2_out = PIE_CY + PIE_OUTER_R * Math.sin(s.endAngle);
            
            const x1_in = PIE_CX + PIE_INNER_R * Math.cos(s.startAngle);
            const y1_in = PIE_CY + PIE_INNER_R * Math.sin(s.startAngle);
            const x2_in = PIE_CX + PIE_INNER_R * Math.cos(s.endAngle);
            const y2_in = PIE_CY + PIE_INNER_R * Math.sin(s.endAngle);

            const d = data.length === 1 
              ? `M ${PIE_CX} ${PIE_CY - PIE_OUTER_R} A ${PIE_OUTER_R} ${PIE_OUTER_R} 0 1 1 ${PIE_CX - 0.01} ${PIE_CY - PIE_OUTER_R} L ${PIE_CX - 0.01} ${PIE_CY - PIE_INNER_R} A ${PIE_INNER_R} ${PIE_INNER_R} 0 1 0 ${PIE_CX} ${PIE_CY - PIE_INNER_R} Z`
              : `M ${x1_out} ${y1_out} A ${PIE_OUTER_R} ${PIE_OUTER_R} 0 ${s.largeArc} 1 ${x2_out} ${y2_out} L ${x2_in} ${y2_in} A ${PIE_INNER_R} ${PIE_INNER_R} 0 ${s.largeArc} 0 ${x1_in} ${y1_in} Z`;

            return (
              <motion.path
                key={s.i}
                d={d}
                fill={s.color}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: s.i * 0.1, duration: 0.5 }}
                className="hover:brightness-110 cursor-default transition-all"
              >
                <title>{s.category}: {s.count} ({s.pctRounded}%)</title>
              </motion.path>
            );
          })}

          {/* Center Hole Text */}
          <g>
            <text
              x={PIE_CX}
              y={PIE_CY - 5}
              textAnchor="middle"
              className="text-[10px] font-bold fill-slate-400 uppercase tracking-widest"
            >
              Total
            </text>
            <text
              x={PIE_CX}
              y={PIE_CY + 12}
              textAnchor="middle"
              className="text-xl font-bold fill-slate-900"
            >
              {total}
            </text>
          </g>

          {/* Labels & Connectors */}
          {sliceInfo.map((s) => (
            <g key={`label-${s.i}`}>
              <motion.path
                d={`M ${s.edgeX} ${s.edgeY} L ${s.elbowX} ${s.edgeY} L ${s.elbowX} ${s.labelY} H ${s.labelX}`}
                fill="none"
                stroke={s.color}
                strokeWidth="1"
                strokeOpacity="0.5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ delay: 0.5 + s.i * 0.1, duration: 0.5 }}
              />
              <motion.circle
                cx={s.edgeX}
                cy={s.edgeY}
                r="2"
                fill={s.color}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 + s.i * 0.1 }}
              />
              <motion.g
                initial={{ opacity: 0, x: s.onRight ? 10 : -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 + s.i * 0.1 }}
              >
                <text
                  x={s.labelX + (s.onRight ? 4 : -4)}
                  y={s.labelY - 4}
                  textAnchor={s.onRight ? "start" : "end"}
                  className="text-[9px] font-bold fill-slate-800"
                >
                  {s.category}
                </text>
                <text
                  x={s.labelX + (s.onRight ? 4 : -4)}
                  y={s.labelY + 7}
                  textAnchor={s.onRight ? "start" : "end"}
                  className="text-[8px] font-medium fill-slate-500"
                >
                  {s.pctRounded}%
                </text>
              </motion.g>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

export default function CapitalDashboardPage() {
  const { authFetch, user, role, groupName, loading: authLoading } = useAuth();
  const isCapitalClient =
    !authLoading && role === "client" && groupNameToId(groupName) === "capital";
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [manualCapitalTour, setManualCapitalTour] = useState(false);
  const [items, setItems] = useState<DashboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(20);
  const [visibleCount, setVisibleCount] = useState(20);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const [selectedItem, setSelectedItem] = useState<DashboardItem | null>(null);

  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const pendingScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingTourRef = useRef<HTMLDivElement | null>(null);
  const approvedTourRef = useRef<HTMLDivElement | null>(null);
  const readyTourRef = useRef<HTMLDivElement | null>(null);
  const [selectedPending, setSelectedPending] = useState<PendingItem | null>(null);
  const [actionLoading, setActionLoading] = useState<"approve" | "reject" | null>(null);
  const [commentsDraft, setCommentsDraft] = useState("");
  const [directionModalOpen, setDirectionModalOpen] = useState(false);
  const [directionDraft, setDirectionDraft] = useState("");
  const [directionSubmitting, setDirectionSubmitting] = useState(false);

  const [approvedItems, setApprovedItems] = useState<{ id: string; createDate: string; title: string }[]>([]);
  const [approvedLoading, setApprovedLoading] = useState(true);
  const approvedScrollRef = useRef<HTMLDivElement | null>(null);

  const [stats, setStats] = useState<{
    proposedCount: number;
    approvedCount: number;
    completedCount: number;
    categories: { category: string; count: number }[];
  } | null>(null);

  useEffect(() => {
    setCommentsDraft(selectedPending?.custom ?? "");
  }, [selectedPending?.id, selectedPending?.custom]);

  const refetchApproved = useCallback(async () => {
    try {
      const res = await authFetch("/api/capitalapproved", { forceRefresh: true });
      if (res.ok) {
        const data = await res.json();
        setApprovedItems(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error(err);
    }
  }, [authFetch]);

  const refetchStats = useCallback(async () => {
    try {
      const res = await authFetch("/api/capitalstats", { forceRefresh: true });
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (err) {
      console.error(err);
    }
  }, [authFetch]);

  const handleApprovePending = async (item: PendingItem) => {
    setActionLoading("approve");
    try {
      const patchRes = await authFetch(`/api/capitalkeywords/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom: commentsDraft }),
      });
      if (!patchRes.ok) throw new Error((await patchRes.json().catch(() => ({}))).error || "Failed to save comments");

      const res = await authFetch(`/api/capitalkeywords/${item.id}/n8n-approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: item.title, summary: item.summary ?? "" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          [err?.error, err?.hint, err?.detail].filter(Boolean).join(" — ") || "Approve failed"
        );
      }
      setPendingItems((prev) => prev.filter((i) => i.id !== item.id));
      setSelectedPending(null);
      refetchApproved();
      refetchStats();
    } catch (err) {
      console.error(err);
      alert((err as Error).message || "Failed to approve");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectPending = async (item: PendingItem) => {
    setActionLoading("reject");
    try {
      const patchRes = await authFetch(`/api/capitalkeywords/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ custom: commentsDraft }),
      });
      if (!patchRes.ok) throw new Error((await patchRes.json().catch(() => ({}))).error || "Failed to save comments");

      const res = await authFetch(`/api/capitalkeywords/${item.id}/status-reject`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: item.title, summary: item.summary ?? "" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error([err?.error, err?.hint, err?.detail].filter(Boolean).join(" — ") || "Reject failed");
      }

      setPendingItems((prev) => prev.filter((i) => i.id !== item.id));
      setSelectedPending(null);
      refetchApproved();
      refetchStats();
    } catch (err) {
      console.error(err);
      alert((err as Error).message || "Failed to reject");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSubmitDirection = async () => {
    const directionText = directionDraft.trim();
    if (!directionText) {
      alert("Please enter a direction before submitting.");
      return;
    }
    setDirectionSubmitting(true);
    try {
      const res = await authFetch("/api/capitalkeywords/topic-direction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directionText }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error([err?.error, err?.hint, err?.detail].filter(Boolean).join(" — ") || "Failed to submit");
      }
      setDirectionDraft("");
      setDirectionModalOpen(false);
      alert("Submitted. Our team will review your direction suggestion.");
    } catch (err) {
      console.error(err);
      alert((err as Error).message || "Failed to submit");
    } finally {
      setDirectionSubmitting(false);
    }
  };

  // Compute page size to fill the table container (runs when table is mounted and on resize)
  useEffect(() => {
    if (loading || items.length === 0) return;
    const el = tableScrollRef.current;
    if (!el) return;
    const updatePageSize = () => {
      const h = el.clientHeight;
      if (h <= 0) return;
      const size = Math.max(MIN_PAGE_SIZE, Math.floor(h / ESTIMATED_ROW_HEIGHT_PX));
      setPageSize(size);
      setVisibleCount((prev) => Math.max(prev, size));
    };
    updatePageSize();
    const ro = new ResizeObserver(updatePageSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, items.length]);

  useEffect(() => {
    const fetchItems = async () => {
      setFetchError(null);
      try {
        const res = await authFetch("/api/capitaldashboard", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setItems(Array.isArray(data) ? data : []);
          setVisibleCount((prev) => Math.max(prev, pageSize));
        } else {
          const err = await res.json().catch(() => ({}));
          setFetchError(err?.error || `Failed to load items (${res.status})`);
        }
      } catch (err) {
        console.error(err);
        setFetchError("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, [authFetch]);

  useEffect(() => {
    const fetchPending = async () => {
      setPendingError(null);
      try {
        // Initial mount uses the server cache (120s TTL); approve/reject update the list optimistically.
        const res = await authFetch("/api/capitalpending");
        if (res.ok) {
          const data = await res.json();
          setPendingItems(Array.isArray(data) ? data : []);
        } else {
          const err = await res.json().catch(() => ({}));
          setPendingError(err?.error || `Failed to load pending items (${res.status})`);
        }
      } catch (err) {
        console.error(err);
        setPendingError("Could not reach the server.");
      } finally {
        setPendingLoading(false);
      }
    };
    fetchPending();
  }, [authFetch]);

  useEffect(() => {
    const fetchApproved = async () => {
      try {
        // Initial mount uses the server cache (120s TTL); refetchApproved() forces fresh after mutations.
        const res = await authFetch("/api/capitalapproved");
        if (res.ok) {
          const data = await res.json();
          setApprovedItems(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setApprovedLoading(false);
      }
    };
    fetchApproved();
  }, [authFetch]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await authFetch("/api/capitalstats");
        if (res.ok) {
          setStats(await res.json());
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchStats();
  }, [authFetch]);

  const visibleItems = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  const openReadyPostItem = useCallback(
    (item: DashboardItem) => {
      setSelectedItem(item);
      if (item.isNew) {
        void authFetch("/api/capitaldashboard/ready-post-opened", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ articleId: item.id }),
        }).catch(() => {});
        setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, isNew: false } : i)));
      }
    },
    [authFetch]
  );

  const loadMore = useCallback(() => {
    setVisibleCount((c) => Math.min(c + pageSize, items.length));
  }, [items.length, pageSize]);

  useEffect(() => {
    if (!searchParams.has("capitaltour")) return;
    setManualCapitalTour(true);
    const next = new URLSearchParams(searchParams);
    next.delete("capitaltour");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!hasMore || !loadMoreRef.current || !tableScrollRef.current) return;
    const el = loadMoreRef.current;
    const root = tableScrollRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { root, rootMargin: "100px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8 h-[calc(100vh-4rem)] min-h-0 flex flex-col lg:block">
      <div className="flex flex-col lg:flex-row gap-8 flex-1 min-h-0 lg:h-full">
        <aside className="lg:sticky lg:top-24 lg:self-start order-2 lg:order-1 flex flex-col w-full lg:w-[40%] lg:min-w-0 shrink-0 lg:h-full">
          <div className="flex items-center justify-between gap-4 mb-6 shrink-0">
            <div className="flex items-center gap-3">
              <img
                src="/profile/capital.webp"
                alt="Capital"
                className="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-200 shadow-sm"
              />
              <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
            </div>
            <Link
              to="/settings/remarks"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 transition-colors"
            >
              <Settings className="w-4 h-4 shrink-0" />
              Strategy
            </Link>
          </div>

          <div className="flex-1 min-h-0 flex flex-col gap-6">
            {/* Top 2/3 — Dashboard stats */}
            <div className="flex-1 min-h-0 flex flex-col gap-4" style={{ flex: "2 1 0%" }}>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-2 shadow-sm items-center text-center">
                  <div className="flex items-center gap-2 justify-center">
                    <MessageSquareText className="w-5 h-5 shrink-0 text-[#ff7900]" />
                    <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Proposed Topics</span>
                  </div>
                  <span className="text-2xl font-bold text-slate-900">{stats?.proposedCount ?? "—"}</span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-2 shadow-sm items-center text-center">
                  <div className="flex items-center gap-2 justify-center">
                    <CheckCircle className="w-5 h-5 shrink-0 text-green-500" />
                    <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Approved Topics</span>
                  </div>
                  <span className="text-2xl font-bold text-slate-900">{stats?.approvedCount ?? "—"}</span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-2 shadow-sm items-center text-center">
                  <div className="flex items-center gap-2 justify-center">
                    <BarChart3 className="w-5 h-5 shrink-0 text-blue-500" />
                    <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Completed Articles</span>
                  </div>
                  <span className="text-2xl font-bold text-slate-900">{stats?.completedCount ?? "—"}</span>
                </div>
              </div>
              <div className="flex-1 min-h-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col overflow-hidden">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider text-center shrink-0">Content by Category</h3>
                {stats?.categories && stats.categories.length > 0 ? (
                  <div className="flex-1 min-h-0 relative mt-2">
                    <PieChart data={stats.categories} />
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 flex-1 flex items-center justify-center">No data available</p>
                )}
              </div>
            </div>

            {/* Bottom 1/3 — Approved topics */}
            <div ref={approvedTourRef} className="flex-1 min-h-0 flex flex-col" style={{ flex: "1 1 0%" }}>
              <section className="shrink-0 mb-2 flex items-center gap-4">
                <h2 className="text-lg font-semibold text-slate-800 mb-0 flex items-center gap-2 shrink-0">
                  <Check className="w-5 h-5" />
                  Approved Topics
                </h2>
                <p className="text-sm text-slate-500 mb-0 min-w-0">Our team is currently researching, crafting, and reviewing the topics.</p>
              </section>
              {approvedLoading ? (
                <ContentAreaLoader variant="card" size="sm" message="Loading..." />
              ) : (
                <div
                  ref={approvedScrollRef}
                  className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden w-full rounded-xl border border-slate-200 shadow-sm"
                  style={{
                    background: "linear-gradient(to bottom, #e2e8f0 3rem, #ffffff 3rem)",
                  }}
                >
                  <table className="w-full table-fixed border-collapse">
                    <thead className="sticky top-0 z-10 bg-transparent">
                      <tr className="bg-transparent">
                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-700 uppercase tracking-wider w-32">Date</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-700 uppercase tracking-wider">Topic</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 [&>tr:first-child]:border-t-0">
                      {approvedItems.length === 0 ? (
                        <tr>
                          <td colSpan={2} className="px-4 py-12 text-center align-middle">
                            <div className="flex flex-col items-center justify-center pt-5">
                              <p className="text-slate-600 font-medium">No topics are currently approved.</p>
                              <p className="text-slate-500 text-sm mt-1">Approved topics will appear here once they have been reviewed.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                      approvedItems.map((item, idx) => (
                        <tr
                          key={item.id}
                          className={`${idx % 2 === 0 ? "bg-white" : "bg-slate-50"} transition-colors`}
                        >
                          <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                            {formatDate(item.createDate)}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-slate-900 line-clamp-2">{item.title || "Untitled"}</p>
                          </td>
                        </tr>
                      ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="w-full lg:w-[60%] lg:min-w-0 order-1 lg:order-2 flex flex-col flex-1 min-h-0 lg:h-full">
          {loading ? (
            <ContentAreaLoader variant="main" message="Fetching latest updates..." />
          ) : fetchError ? (
            <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
              <p className="text-slate-600 font-medium mb-2">Couldn&apos;t load items</p>
              <p className="text-slate-500 text-sm mb-4">{fetchError}</p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col gap-6 overflow-hidden">
              {/* Pending approval – top 50% */}
              <div ref={pendingTourRef} className="flex-1 min-h-0 flex flex-col" style={{ flex: "1 1 50%" }}>
                <section className="shrink-0 mb-2 flex items-center gap-4">
                  <h2 className="text-lg font-semibold text-slate-800 mb-0 flex items-center gap-2 shrink-0">
                    <Clock className="w-5 h-5" />
                    Pending Approval Topics
                  </h2>
                  <p className="text-sm text-slate-500 mb-0 min-w-0">Review, comment, and approve/reject proposed topics to proceed.</p>
                </section>
                {pendingLoading ? (
                  <ContentAreaLoader variant="card" size="sm" message="Loading..." />
                ) : pendingError ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <p className="text-slate-600 font-medium mb-1">Couldn&apos;t load items</p>
                    <p className="text-slate-500 text-sm">{pendingError}</p>
                  </div>
                ) : (
                  <div
                    ref={pendingScrollRef}
                    className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden w-full rounded-xl border border-slate-200 shadow-sm"
                    style={{
                      background: "linear-gradient(to right, #fece24, #facc15) 0 0 / 100% 3rem no-repeat, #ffffff",
                    }}
                  >
                    <table className="w-full table-fixed border-collapse">
                      <thead className="sticky top-0 z-10 bg-transparent">
                        <tr className="bg-transparent">
                          <th className="text-left px-4 py-3 text-xs font-bold text-white uppercase tracking-wider w-32">Date</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-white uppercase tracking-wider w-40 min-w-[10rem]">Source</th>
                          <th className="text-left px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">
                            <span className="flex items-center justify-between gap-2">
                              <span>Topic</span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setDirectionModalOpen(true); }}
                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-slate-700 bg-white/90 rounded hover:bg-slate-100 hover:text-slate-900 transition-colors"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                New Topic
                              </button>
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 [&>tr:first-child]:border-t-0">
                        {pendingItems.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-4 py-12 text-center align-middle">
                              <div className="flex flex-col items-center justify-center pt-5">
                                <p className="text-slate-600 font-medium">No topics are currently pending approval.</p>
                                <p className="text-slate-500 text-sm mt-1">New topics will appear here once submitted for review.</p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                        pendingItems.map((item, idx) => (
                          <motion.tr
                            key={item.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: idx * 0.02 }}
                            onClick={() => setSelectedPending(item)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedPending(item); } }}
                            className={`${idx % 2 === 0 ? "bg-white hover:bg-slate-50" : "bg-slate-50 hover:bg-slate-100"} transition-colors cursor-pointer`}
                          >
                            <td className="px-4 py-4 text-sm text-slate-500 whitespace-nowrap">
                              {formatDate(item.createDate)}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-700 whitespace-nowrap">
                              {item.source || "—"}
                            </td>
                            <td className="px-4 py-4">
                              <p className="text-sm font-medium text-slate-900 line-clamp-2">{item.title || "Untitled"}</p>
                            </td>
                          </motion.tr>
                        ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Ready to post – bottom 50% */}
              <div ref={readyTourRef} className="flex-1 min-h-0 flex flex-col" style={{ flex: "1 1 50%" }}>
                <section className="shrink-0 mb-2">
                  <h2 className="text-lg font-semibold text-slate-800 mb-0 flex items-center gap-2">
                    <Send className="w-5 h-5" />
                    Ready to Post
                  </h2>
                </section>
                <div
                  ref={tableScrollRef}
                  className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden w-full rounded-xl border border-slate-200 shadow-sm"
                  style={{
                    background: "linear-gradient(to right, #ff7900, #facc15) 0 0 / 100% 3rem no-repeat, #ffffff",
                  }}
                >
                  <table className="w-full table-fixed border-collapse">
                    <thead className="sticky top-0 z-10 bg-transparent">
                      <tr className="bg-transparent">
                        <th
                          className="w-14 px-2 py-3 text-left text-xs font-bold text-white uppercase tracking-wider"
                          aria-label="Notify"
                        />
                        <th className="w-14 px-2 py-3 text-left text-xs font-bold text-white uppercase tracking-wider" aria-label="New" />
                        <th className="text-left px-4 py-3 text-xs font-bold text-white uppercase tracking-wider w-32">Date</th>
                        <th className="text-left px-4 py-3 text-xs font-bold text-white uppercase tracking-wider">Title</th>
                        <th className="w-14 px-2 py-3 text-right" aria-hidden />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 [&>tr:first-child]:border-t-0">
                      {items.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center align-middle">
                            <div className="flex flex-col items-center justify-center pt-5">
                              <p className="text-slate-600 font-medium">No articles ready yet</p>
                              <p className="text-slate-500 text-sm mt-1">Finished content will appear here for preview and download.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        visibleItems.map((item, idx) => (
                          <motion.tr
                            key={item.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: idx * 0.02 }}
                            onClick={() => openReadyPostItem(item)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openReadyPostItem(item);
                              }
                            }}
                            className={`${idx % 2 === 0 ? "bg-white hover:bg-slate-50" : "bg-slate-50 hover:bg-slate-100"} transition-colors cursor-pointer`}
                          >
                            <td className="pl-3 pr-1 py-4 align-middle w-14">
                              {isCapitalNotifyBadgeActive(item.notifySentAt) ? (
                                <span
                                  className="inline-flex items-center shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white border border-red-700"
                                  title="Notify email sent in the last 72 hours"
                                >
                                  New
                                </span>
                              ) : null}
                            </td>
                            <td className="pl-3 pr-1 py-4 align-middle w-14">
                              {item.isNew ? (
                                <span className="inline-flex items-center rounded-full bg-orange-50 text-[#c2410c] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border border-orange-200/80">
                                  New
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-500 whitespace-nowrap tabular-nums">
                              {formatDate(item.createDate)}
                            </td>
                            <td className="px-4 py-4 min-w-0">
                              <p className="text-sm font-medium text-slate-900 line-clamp-2">{item.title || "Untitled"}</p>
                            </td>
                            <td className="pl-2 pr-4 py-4 text-right align-middle">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate("/capital", { state: { openArticleId: item.id } });
                                }}
                                className="inline-flex items-center justify-center p-1.5 text-slate-600 hover:text-primary hover:bg-slate-100 rounded-lg transition-colors shrink-0"
                                title="Edit in Articles"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </motion.tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  {hasMore && items.length > 0 && (
                    <div ref={loadMoreRef} className="h-12 flex items-center justify-center py-4 border-t border-slate-100" aria-hidden />
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <AnimatePresence>
        {selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedItem(null)}
            role="dialog"
            aria-modal="true"
            aria-label="View full article"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-wrap items-center gap-2 shrink-0 px-4 py-3 border-b border-slate-300 bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-800 truncate min-w-0 flex-1 basis-[min(100%,12rem)]">
                  {selectedItem.title || "Article"}
                </h3>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const bodyHtml = getHtmlContent(selectedItem.calculation);
                      const titleEsc = escapeAttr(selectedItem.title || "Article");
                      const doc = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${titleEsc}</title>
</head>
<body>
${bodyHtml}
</body>
</html>`;
                      triggerTextDownload(doc, safeDownloadFilename(selectedItem.title || "article", "html"), "text/html;charset=utf-8");
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download HTML
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const bodyHtml = getHtmlContent(selectedItem.calculation);
                      const plain = htmlToPlainText(bodyHtml);
                      const title = (selectedItem.title || "Article").trim();
                      const out = `${title}\n\n${plain}\n`;
                      triggerTextDownload(out, safeDownloadFilename(selectedItem.title || "article", "txt"), "text/plain;charset=utf-8");
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download plain text
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="p-2 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors shrink-0 ml-auto"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div
                className="flex-1 overflow-y-auto p-6 prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-700 prose-a:text-primary prose-strong:text-slate-900 prose-strong:font-semibold [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h4]:text-base [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:border [&_table]:border-slate-200 [&_img]:max-w-full [&_img]:h-auto"
                dangerouslySetInnerHTML={{ __html: getHtmlContent(selectedItem.calculation) }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedPending && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedPending(null)}
            role="dialog"
            aria-modal="true"
            aria-label="Pending item details"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between shrink-0 px-6 py-4 border-b border-slate-200 bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-800 truncate max-w-[70%]">
                  {selectedPending.title || "Untitled"}
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedPending(null)}
                  className="p-2 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="flex flex-col md:flex-row items-start gap-4">
                  <div className="shrink-0 flex flex-col gap-1">
                    {selectedPending.source && (
                      <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold bg-[#ff7900] text-white uppercase tracking-wider">
                        {selectedPending.source}
                      </span>
                    )}
                    <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                      {selectedPending.createDate ? formatDate(selectedPending.createDate) : "—"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 space-y-3">
                    <h3 className="text-lg font-bold text-slate-900 leading-tight">
                      {selectedPending.title}
                    </h3>
                    {selectedPending.summary?.trim() ? (
                      <div className="space-y-2">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          Summary
                        </label>
                        <div
                          className="prose prose-sm prose-slate max-w-none text-sm prose-p:text-slate-700 prose-headings:text-slate-900 prose-a:text-primary prose-strong:text-slate-900 prose-strong:font-semibold [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:border [&_table]:border-slate-200 [&_code]:text-sm [&_pre]:text-xs"
                          dangerouslySetInnerHTML={{ __html: getMarkdownHtml(selectedPending.summary) }}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>

                {selectedPending.socialHook && (
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <Share2 className="w-3 h-3" /> Social Hook
                    </label>
                    <p className="text-sm text-slate-700 italic bg-slate-50 p-3 rounded-lg border border-slate-200">
                      &ldquo;{selectedPending.socialHook}&rdquo;
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      <Hash className="w-3 h-3" /> Keywords
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[selectedPending.keyword1, selectedPending.keyword2, selectedPending.keyword3].filter(Boolean).map((k, i) => (
                        <span key={i} className="px-2 py-1 rounded bg-secondary/50 text-slate-700 text-xs font-medium border border-slate-200">
                          {k}
                        </span>
                      ))}
                      {![selectedPending.keyword1, selectedPending.keyword2, selectedPending.keyword3].some(Boolean) && (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </div>
                  </div>

                  {selectedPending.keywordTag && (
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <Target className="w-3 h-3" /> Keyword Tag
                      </label>
                      <span className="inline-block px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs font-medium border border-slate-200">
                        {selectedPending.keywordTag}
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedPending.psyTrigger && (
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <Zap className="w-3 h-3" /> Psy Trigger
                      </label>
                      <p className="text-xs text-slate-600 bg-amber-50/50 p-2 rounded border border-amber-100">
                        {selectedPending.psyTrigger}
                      </p>
                    </div>
                  )}

                  {selectedPending.stockTag && (
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <TrendingUp className="w-3 h-3" /> Stock Tag
                      </label>
                      <span className="inline-block px-2 py-1 rounded bg-blue-50 text-blue-600 text-xs font-bold border border-blue-100">
                        {selectedPending.stockTag}
                      </span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Special instructions
                  </label>
                  <textarea
                    value={commentsDraft}
                    onChange={(e) => setCommentsDraft(e.target.value)}
                    placeholder="Add special instructions for this article"
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-y min-h-[5rem]"
                  />
                </div>
              </div>

              <div className="shrink-0 flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={() => handleRejectPending(selectedPending)}
                  disabled={!!actionLoading}
                  className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {actionLoading === "reject" ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => handleApprovePending(selectedPending)}
                  disabled={!!actionLoading}
                  className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  {actionLoading === "approve" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Approve
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {directionModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => !directionSubmitting && setDirectionModalOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Propose a new topic direction"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-200 bg-slate-50">
                <h3 className="text-sm font-semibold text-slate-800">Propose a new direction</h3>
                <button
                  type="button"
                  onClick={() => !directionSubmitting && setDirectionModalOpen(false)}
                  disabled={directionSubmitting}
                  className="p-2 rounded-lg hover:bg-slate-200 text-slate-600 transition-colors disabled:opacity-50"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-3">
                <p className="text-sm text-slate-600">
                  Tell us what kind of topics you’d like to see next. This will be shared with our content team.
                </p>
                <textarea
                  value={directionDraft}
                  onChange={(e) => setDirectionDraft(e.target.value)}
                  placeholder="e.g. Focus on the global outlook over the coming months, covering both medium- and long-term themes and scenarios."
                  rows={5}
                  disabled={directionSubmitting}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-y min-h-[8rem] disabled:opacity-50"
                />
                <p className="text-[11px] text-slate-400">
                  {Math.min(directionDraft.length, 2000)}/2000
                </p>
              </div>

              <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setDirectionModalOpen(false)}
                  disabled={directionSubmitting}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitDirection}
                  disabled={directionSubmitting}
                  className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary-dark rounded-lg transition-colors disabled:opacity-50"
                >
                  {directionSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {directionSubmitting ? "Submitting…" : "Submit"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <CapitalDashboardTour
        enabled={!loading && !fetchError}
        autoTourEligible={isCapitalClient}
        tourUserId={user?.uid ?? null}
        manualOpen={manualCapitalTour}
        refs={{ pendingRef: pendingTourRef, approvedRef: approvedTourRef, readyRef: readyTourRef }}
      />
    </div>
  );
}
