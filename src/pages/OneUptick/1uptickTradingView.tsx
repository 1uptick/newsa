import React, { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, FileText, ChevronLeft, Languages, Image as ImageIcon, Plus } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useSetNavbarSupplement } from "../../contexts/NavbarSupplementContext";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { getHtmlContent } from "../../lib/html";
import { Modal } from "../../components/Modal";
import type { CapitalItem } from "../Capital/capitalArticleTypes";
import { ContentAreaLoader } from "../../components/ContentAreaLoader";

const proseTc =
  "prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-700 prose-a:text-primary prose-strong:text-slate-900 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:border [&_table]:border-slate-200 [&_img]:max-w-full [&_img]:h-auto";

const proseCard =
  "prose prose-sm prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-700 prose-a:text-primary prose-strong:text-slate-900 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_img]:max-w-full [&_img]:h-auto";

type LangKey = "en" | "jp" | "vi" | "ms" | "th";

type DetailLanguages = Record<LangKey, { title: string; content: string }>;

const LANG_LABELS: Record<LangKey, string> = {
  en: "English",
  jp: "Japanese",
  vi: "Vietnamese",
  ms: "Malay",
  th: "Thai",
};

function emptyLanguages(): DetailLanguages {
  return {
    en: { title: "", content: "" },
    jp: { title: "", content: "" },
    vi: { title: "", content: "" },
    ms: { title: "", content: "" },
    th: { title: "", content: "" },
  };
}

export default function OneUptickTradingViewPage() {
  const { authFetch } = useAuth();
  const setCenterSupplement = useSetNavbarSupplement();
  const [items, setItems] = useState<CapitalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTitle, setDetailTitle] = useState<string>("");
  const [detailContent, setDetailContent] = useState<string>("");
  const [detailLanguages, setDetailLanguages] = useState<DetailLanguages>(emptyLanguages());
  const [detailHashtags, setDetailHashtags] = useState<{ en: string; jp: string }>({ en: "", jp: "" });
  const [detailLoading, setDetailLoading] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateStatus, setTranslateStatus] = useState<string | null>(null);
  const [uploadingChart, setUploadingChart] = useState(false);
  const [chartStatus, setChartStatus] = useState<string | null>(null);
  const chartFileInputRef = useRef<HTMLInputElement | null>(null);
  const [newRowOpen, setNewRowOpen] = useState(false);
  const [newRowTitle, setNewRowTitle] = useState("");
  const [newRowContent, setNewRowContent] = useState("");
  const [newRowSaving, setNewRowSaving] = useState(false);
  const [newRowError, setNewRowError] = useState<string | null>(null);

  useBodyScrollLock(mobileDetailOpen);

  useEffect(() => {
    return () => setCenterSupplement(null);
  }, [setCenterSupplement]);

  useEffect(() => {
    const load = async () => {
      setError(null);
      try {
        const res = await authFetch("/api/oneuptick/trading-view", { forceRefresh: true });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : [];
          setItems(list);
          if (list.length > 0) setSelectedId(list[0].id);
        } else {
          const err = await res.json().catch(() => ({}));
          const detail = [err?.error, err?.airtableError].filter(Boolean).join(" — ");
          setError(detail || `Failed to load (${res.status})`);
        }
      } catch (e) {
        console.error(e);
        setError("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [authFetch]);

  const fetchDetail = useCallback(
    async (id: string) => {
      setDetailLoading(true);
      try {
        const res = await authFetch(`/api/oneuptick/trading-view/${id}`, { forceRefresh: true });
        if (res.ok) {
          const data = await res.json();
          setDetailTitle(typeof data.title === "string" ? data.title : "");
          setDetailContent(typeof data.content === "string" ? data.content : "");
          const langs: DetailLanguages = emptyLanguages();
          const incoming = (data?.languages ?? {}) as Partial<Record<LangKey, { title?: unknown; content?: unknown }>>;
          (Object.keys(langs) as LangKey[]).forEach((k) => {
            const v = incoming[k];
            langs[k] = {
              title: typeof v?.title === "string" ? v.title : "",
              content: typeof v?.content === "string" ? v.content : "",
            };
          });
          setDetailLanguages(langs);
          setDetailHashtags({
            en: typeof data?.hashtags?.en === "string" ? data.hashtags.en : "",
            jp: typeof data?.hashtags?.jp === "string" ? data.hashtags.jp : "",
          });
        } else {
          setDetailTitle("");
          setDetailContent("");
          setDetailLanguages(emptyLanguages());
          setDetailHashtags({ en: "", jp: "" });
        }
      } catch {
        setDetailTitle("");
        setDetailContent("");
        setDetailLanguages(emptyLanguages());
        setDetailHashtags({ en: "", jp: "" });
      } finally {
        setDetailLoading(false);
      }
    },
    [authFetch]
  );

  useEffect(() => {
    if (selectedId) void fetchDetail(selectedId);
    else {
      setDetailTitle("");
      setDetailContent("");
      setDetailLanguages(emptyLanguages());
      setDetailHashtags({ en: "", jp: "" });
    }
  }, [selectedId, fetchDetail]);

  useEffect(() => {
    setTranslateStatus(null);
    setChartStatus(null);
  }, [selectedId]);

  const selectedItem = selectedId ? items.find((i) => i.id === selectedId) : null;

  useEffect(() => {
    if (loading) {
      setCenterSupplement("TradingView · Loading…");
      return;
    }
    if (error) {
      setCenterSupplement("TradingView · Could not load list");
      return;
    }
    if (!selectedItem) {
      setCenterSupplement("TradingView · Select a row");
      return;
    }
    if (translating) {
      setCenterSupplement("TradingView · Translating…");
      return;
    }
    if (uploadingChart) {
      setCenterSupplement("TradingView · Uploading chart…");
      return;
    }
    const latest = chartStatus?.trim() || translateStatus?.trim() || "";
    if (latest) {
      const short = latest.length > 140 ? `${latest.slice(0, 137)}…` : latest;
      setCenterSupplement(`TradingView · ${short}`);
      return;
    }
    setCenterSupplement("TradingView · Admin");
  }, [
    loading,
    error,
    selectedItem,
    translating,
    translateStatus,
    uploadingChart,
    chartStatus,
    setCenterSupplement,
  ]);

  const reloadList = useCallback(
    async (preferredId?: string) => {
      try {
        const res = await authFetch("/api/oneuptick/trading-view", { forceRefresh: true });
        if (!res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data) ? (data as CapitalItem[]) : [];
        setItems(list);
        if (preferredId && list.some((i) => i.id === preferredId)) {
          setSelectedId(preferredId);
        } else if (list.length > 0 && !list.some((i) => i.id === selectedId)) {
          setSelectedId(list[0].id);
        }
      } catch {
        /* ignore — keep existing list */
      }
    },
    [authFetch, selectedId]
  );

  const handleChartUpload = useCallback(
    async (file: File) => {
      if (!selectedItem || uploadingChart) return;
      const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!allowedTypes.includes(file.type)) {
        setChartStatus("Please choose a JPEG, PNG, GIF, or WebP image.");
        return;
      }
      const maxSizeBytes = 5 * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        setChartStatus("Image must be 5MB or smaller.");
        return;
      }
      setUploadingChart(true);
      setChartStatus(null);
      const recordId = selectedItem.id;
      try {
        const prep = await authFetch(
          `/api/oneuptick/trading-view/${selectedItem.id}/chart-upload/prepare`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mimeType: file.type || "image/jpeg",
              filename: file.name || "chart.jpg",
              fileSize: file.size,
            }),
          }
        );
        if (!prep.ok) {
          const err = await prep.json().catch(() => ({}));
          const detail = [err?.error, err?.airtableError].filter(Boolean).join(" — ");
          throw new Error(detail || `Upload failed (${prep.status})`);
        }
        const sign = (await prep.json().catch(() => ({}))) as {
          signedUrl?: string;
          path?: string;
          token?: string;
        };
        const { signedUrl, path, token } = sign;
        if (!signedUrl || !path) {
          throw new Error("Could not start upload (missing signed URL).");
        }

        const putHeaders: Record<string, string> = {
          "Content-Type": file.type || "application/octet-stream",
        };
        if (token) putHeaders.Authorization = `Bearer ${token}`;

        const putRes = await fetch(signedUrl, {
          method: "PUT",
          body: file,
          headers: putHeaders,
        });
        if (!putRes.ok) {
          const hint = await putRes.text().catch(() => "");
          throw new Error(
            hint?.trim() || `Storage upload failed (${putRes.status}). Check the file size (max 5MB).`
          );
        }

        const fin = await authFetch(
          `/api/oneuptick/trading-view/${selectedItem.id}/chart-upload/finalize`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path }),
          }
        );
        if (!fin.ok) {
          const err = await fin.json().catch(() => ({}));
          const detail = [err?.error, err?.airtableError].filter(Boolean).join(" — ");
          throw new Error(detail || `Upload failed (${fin.status})`);
        }
        const data = await fin.json().catch(() => ({}));
        const field = typeof data?.field === "string" ? data.field : "chart";
        setChartStatus(`Chart saved to Airtable column "${field}".`);
        await reloadList(recordId);
      } catch (e) {
        setChartStatus((e as Error).message || "Chart upload failed.");
      } finally {
        setUploadingChart(false);
      }
    },
    [authFetch, reloadList, selectedItem, uploadingChart]
  );

  const handleCreateRow = useCallback(async () => {
    if (newRowSaving) return;
    const title = newRowTitle.trim();
    const content = newRowContent;
    if (!title && !content.trim()) {
      setNewRowError("Enter a title or content first.");
      return;
    }
    setNewRowSaving(true);
    setNewRowError(null);
    try {
      const res = await authFetch("/api/oneuptick/trading-view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = [err?.error, err?.airtableError].filter(Boolean).join(" — ");
        throw new Error(detail || `Create failed (${res.status})`);
      }
      const data = await res.json().catch(() => ({}));
      const newId = typeof data?.id === "string" ? data.id : undefined;
      setNewRowOpen(false);
      setNewRowTitle("");
      setNewRowContent("");
      await reloadList(newId);
    } catch (e) {
      setNewRowError((e as Error).message || "Could not create row.");
    } finally {
      setNewRowSaving(false);
    }
  }, [authFetch, newRowContent, newRowSaving, newRowTitle, reloadList]);

  const handleTranslate = useCallback(async () => {
    if (!selectedItem || translating) return;
    setTranslating(true);
    setTranslateStatus(null);
    try {
      const res = await authFetch(`/api/oneuptick/trading-view/${selectedItem.id}/translate`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = [err?.error, err?.airtableError].filter(Boolean).join(" — ");
        throw new Error(detail || `Translate failed (${res.status})`);
      }
      const data = await res.json().catch(() => ({}));
      const fields: string[] = Array.isArray(data?.writtenFields) ? data.writtenFields : [];
      setTranslateStatus(
        fields.length > 0
          ? `Translation saved to Airtable: ${fields.join(", ")}`
          : "Translation saved to Airtable."
      );
    } catch (e) {
      setTranslateStatus((e as Error).message || "Translate failed.");
    } finally {
      setTranslating(false);
    }
  }, [authFetch, selectedItem, translating]);

  const langOrder: LangKey[] = ["en", "jp", "vi", "ms", "th"];

  const detailBody = (
    <>
      {detailLoading ? (
        <ContentAreaLoader variant="panel" size="sm" message="Loading…" pulseMessage={false} />
      ) : (
        <>
          <section className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-4">
              {detailTitle.trim() || "—"}
            </h1>
            {detailContent.trim() ? (
              <div className={proseTc} dangerouslySetInnerHTML={{ __html: getHtmlContent(detailContent) }} />
            ) : (
              <p className="text-sm text-slate-400">No content for this row.</p>
            )}
          </section>

          <section>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {langOrder.map((k) => {
                const { title, content } = detailLanguages[k];
                const has = Boolean(title.trim() || content.trim());
                const hashtag = k === "en" ? detailHashtags.en : k === "jp" ? detailHashtags.jp : "";
                return (
                  <article
                    key={k}
                    className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 flex flex-col min-h-[140px]"
                  >
                    <header className="flex items-center justify-between mb-2">
                      <span className="text-[11px] font-bold tracking-wider uppercase text-slate-500">
                        {LANG_LABELS[k]}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 uppercase">{k}</span>
                    </header>
                    {has ? (
                      <>
                        <h3 className="text-base font-semibold text-slate-900 leading-snug mb-2">
                          {title.trim() || "—"}
                        </h3>
                        {content.trim() ? (
                          <div
                            className={proseCard}
                            dangerouslySetInnerHTML={{ __html: getHtmlContent(content) }}
                          />
                        ) : null}
                      </>
                    ) : (
                      <p className="text-sm text-slate-400 italic">Not translated yet.</p>
                    )}
                    {hashtag ? (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        <p className="text-[10px] font-bold tracking-wider uppercase text-sky-600 mb-1">
                          Hashtags
                        </p>
                        <p className="text-sm text-slate-700 break-words leading-relaxed">
                          {hashtag}
                        </p>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </>
  );

  if (loading) {
    return <ContentAreaLoader variant="page" constrained message="Loading..." pulseMessage={false} />;
  }

  if (error) {
    return (
      <div className="w-full max-w-[1800px] mx-auto px-4 py-20 text-center">
        <p className="text-slate-600 font-medium mb-2">Couldn&apos;t load TradingView</p>
        <p className="text-slate-500 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex flex-col h-[calc(100vh-8rem)] min-h-[480px] rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        <header
          className="shrink-0 flex items-center justify-between gap-4 px-4 py-3 border-b border-primary-dark/30 z-[60]"
          style={{ background: "linear-gradient(to right, var(--color-primary), #facc15)" }}
        >
          <div className="flex flex-col min-w-0 gap-0.5">
            <h2 className="text-lg font-bold text-white drop-shadow-sm leading-tight">TradingView</h2>
            {(chartStatus || translateStatus) ? (
              <p
                className="text-[11px] sm:text-xs text-white font-semibold leading-snug truncate max-w-[min(100vw-8rem,32rem)]"
                title={chartStatus || translateStatus || ""}
              >
                {chartStatus || translateStatus}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end min-w-0">
            <button
              type="button"
              onClick={() => {
                setNewRowError(null);
                setNewRowOpen(true);
              }}
              title="Create a new TradingView row in Airtable"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium shadow-sm hover:bg-[#91e6f5] hover:border-[#91e6f5] transition-colors"
            >
              <Plus className="w-4 h-4 shrink-0" aria-hidden />
              New row
            </button>
            {selectedItem ? (
              <>
                <input
                  ref={chartFileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleChartUpload(file);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => chartFileInputRef.current?.click()}
                  disabled={uploadingChart}
                  title="Upload a chart image from your computer (stored in Supabase, URL saved to Airtable)"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium shadow-sm hover:bg-[#91e6f5] hover:border-[#91e6f5] transition-colors disabled:opacity-50"
                >
                  {uploadingChart ? (
                    <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden />
                  ) : (
                    <ImageIcon className="w-4 h-4 shrink-0" aria-hidden />
                  )}
                  {uploadingChart ? "Uploading…" : "Upload chart"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleTranslate()}
                  disabled={translating}
                  title="Translate title_tc and content_tc to EN / JP / VI / MS / TH and write back to Airtable"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium shadow-sm hover:bg-[#91e6f5] hover:border-[#91e6f5] transition-colors disabled:opacity-50"
                >
                  {translating ? (
                    <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden />
                  ) : (
                    <Languages className="w-4 h-4 shrink-0" aria-hidden />
                  )}
                  {translating ? "Translating…" : "Translate"}
                </button>
              </>
            ) : null}
          </div>
        </header>
        <div className="flex flex-col lg:flex-row flex-1 min-h-0 relative">
          <aside className="lg:w-[380px] shrink-0 flex flex-col border-r border-slate-200 bg-slate-50/50">
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-sm">No rows yet.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const isSelected = item.id === selectedId;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedId(item.id);
                            setMobileDetailOpen(true);
                          }}
                          className={`w-full text-left px-3 py-4 transition-colors ${
                            isSelected
                              ? "bg-secondary/75 hover:bg-secondary-dark/75 lg:bg-secondary/75"
                              : "bg-white hover:bg-slate-50"
                          }`}
                        >
                          {item.chartUrl ? (
                            <img
                              src={item.chartUrl}
                              alt=""
                              loading="lazy"
                              className="block w-full h-auto rounded-md border border-slate-200 bg-white mb-2"
                            />
                          ) : null}
                          <p className="font-semibold text-slate-900 mb-1">{item.title || "—"}</p>
                          {item.excerpt?.trim() ? (
                            <div
                              className="text-sm text-slate-600 line-clamp-3 prose prose-sm prose-slate max-w-none"
                              dangerouslySetInnerHTML={{ __html: getHtmlContent(item.excerpt) }}
                            />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>

          <main className="hidden lg:flex flex-1 min-w-0 flex-col overflow-hidden bg-white">
            {selectedItem ? (
              <div className="flex-1 overflow-y-auto py-6 px-10 border-l border-slate-200">{detailBody}</div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-20">
                <FileText className="w-14 h-14 mb-4 text-slate-200" />
                <p className="text-sm">Select a row from the list.</p>
              </div>
            )}
          </main>

          <AnimatePresence>
            {mobileDetailOpen && selectedItem && (
              <motion.main
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-white lg:hidden"
              >
                <header
                  className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-primary-dark/30"
                  style={{ background: "linear-gradient(to right, var(--color-primary), #facc15)" }}
                >
                  <button
                    type="button"
                    onClick={() => setMobileDetailOpen(false)}
                    className="p-1 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors shrink-0"
                    aria-label="Back to list"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <h2 className="text-lg font-bold text-white drop-shadow-sm truncate min-w-0 flex-1">
                    {selectedItem.title || "TradingView"}
                  </h2>
                </header>
                <div className="flex-1 overflow-y-auto py-6 px-4">{detailBody}</div>
              </motion.main>
            )}
          </AnimatePresence>
        </div>
      </div>

      <Modal
        open={newRowOpen}
        onClose={() => {
          if (newRowSaving) return;
          setNewRowOpen(false);
        }}
        title="New TradingView row"
        maxWidth="max-w-3xl"
        closeDisabled={newRowSaving}
        footer={
          <>
            <button
              type="button"
              onClick={() => setNewRowOpen(false)}
              disabled={newRowSaving}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleCreateRow()}
              disabled={newRowSaving || (!newRowTitle.trim() && !newRowContent.trim())}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              {newRowSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="w-4 h-4" aria-hidden />
              )}
              {newRowSaving ? "Saving…" : "Create row"}
            </button>
          </>
        }
      >
        <div className="p-5 space-y-4">
          <div>
            <label htmlFor="new-row-title" className="block text-xs font-semibold tracking-wide uppercase text-slate-500 mb-1">
              Title (title_tc)
            </label>
            <input
              id="new-row-title"
              type="text"
              value={newRowTitle}
              onChange={(e) => setNewRowTitle(e.target.value)}
              placeholder="e.g. 金價走勢 13/5 - 未來48小時區間操作 等待突破"
              disabled={newRowSaving}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-primary focus:border-primary outline-none disabled:opacity-50"
            />
          </div>
          <div>
            <label htmlFor="new-row-content" className="block text-xs font-semibold tracking-wide uppercase text-slate-500 mb-1">
              Content (content_tc)
            </label>
            <textarea
              id="new-row-content"
              value={newRowContent}
              onChange={(e) => setNewRowContent(e.target.value)}
              placeholder="Traditional Chinese analysis content. HTML allowed."
              disabled={newRowSaving}
              rows={12}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-primary focus:border-primary outline-none disabled:opacity-50 resize-y font-mono"
            />
          </div>
          {newRowError ? (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {newRowError}
            </p>
          ) : null}
          <p className="text-xs text-slate-500">
            The row will be inserted into the Airtable table behind this page. You can run Translate / Upload chart on it after it appears in the list.
          </p>
        </div>
      </Modal>
    </div>
  );
}
