import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, FileText, X, Pencil, BookOpen, Download, MoreVertical, ChevronLeft, Image, Eraser, Rocket } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useSetNavbarSupplement } from "../../contexts/NavbarSupplementContext";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import {
  getHtmlContent,
  escapeAttr,
  articleDownloadLeadHtml,
  articleDownloadPlainText,
  cleanWordPressBodyMarkdownArtifacts,
} from "../../lib/html";
import { Modal } from "../../components/Modal";
import { ContentAreaLoader } from "../../components/ContentAreaLoader";

import {
  CapitalArticleDetailView,
  type ArticleDetailEditModalPayload,
  type ArticleDetailUploadModalPayload,
} from "../Capital/CapitalArticleDetailView";
import type { CapitalItem } from "../Capital/capitalArticleTypes";
import {
  OneuptickArticleUploadModal,
  OneuptickArticleBlockEditModal,
} from "./oneuptickArticleEditorModals";

const proseOneuptickEnglish =
  "prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-600 prose-a:text-primary prose-strong:text-slate-800 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:border [&_table]:border-slate-200 [&_img]:max-w-full [&_img]:h-auto";

/** Cap on the per-session article-body cache (bodies can be large; evict oldest beyond this). */
const CONTENT_CACHE_MAX = 30;

type SeoContentCacheEntry = {
  content: string;
  tcTitle: string;
  tcExcerpt: string;
  englishDetail: { title: string; excerpt: string; article: string };
};

/** SEO list: filter `{site}` to main / ai / kong / both (main|ai union) / all. */
type SeoSiteFilter = "all" | "main" | "ai" | "kong" | "main_ai";

function normalizeSeoSiteToken(raw: string | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

function seoSiteMatchesFilter(siteRaw: string | undefined, filter: SeoSiteFilter): boolean {
  const s = normalizeSeoSiteToken(siteRaw);
  switch (filter) {
    case "all":
      return true;
    case "main":
      return s === "main";
    case "ai":
      return s === "ai";
    case "kong":
      return s === "kong";
    case "main_ai":
      return s === "main" || s === "ai";
    default:
      return true;
  }
}

function SeoTcExcerptEditor({
  articleId,
  excerptHtml,
  authFetch,
  onSaved,
}: {
  articleId: string;
  excerptHtml: string;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onSaved: (html: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (draft !== null) {
    return (
      <div className="mb-6 pb-6 border-b border-slate-200">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">摘要（繁體中文）</label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full min-h-[120px] p-3 rounded-lg border border-slate-200 text-slate-800 font-mono text-sm resize-y"
          placeholder="HTML（例如 <p>…</p>）"
          spellCheck={false}
        />
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                const res = await authFetch(`/api/oneuptick/seo/articles/${articleId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ excerptTc: draft }),
                });
                if (res.ok) {
                  onSaved(draft);
                  setDraft(null);
                }
              } finally {
                setSaving(false);
              }
            }}
            className="px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setDraft(null)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/excerpt mb-6 pb-6 border-b border-slate-200">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">摘要（繁體中文）</span>
        <button
          type="button"
          onClick={() => setDraft(excerptHtml)}
          className="shrink-0 inline-flex items-center gap-1 text-slate-500 text-xs font-medium opacity-90 group-hover/excerpt:opacity-100 hover:text-primary transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" /> Edit
        </button>
      </div>
      {excerptHtml.trim() ? (
        <div
          className={`${proseOneuptickEnglish} prose-p:text-slate-600`}
          dangerouslySetInnerHTML={{ __html: getHtmlContent(excerptHtml) }}
        />
      ) : (
        <p className="text-sm text-slate-400">No excerpt — click Edit to add.</p>
      )}
    </div>
  );
}

function SeoEnglishExcerptEditor({
  articleId,
  excerptHtml,
  authFetch,
  onSaved,
}: {
  articleId: string;
  excerptHtml: string;
  authFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onSaved: (html: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (draft !== null) {
    return (
      <div className="mb-6 pb-6 border-b border-slate-200">
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Excerpt (English)</label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full min-h-[120px] p-3 rounded-lg border border-slate-200 text-slate-800 font-mono text-sm resize-y"
          placeholder="HTML (e.g. <p>...</p>)"
          spellCheck={false}
        />
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                const res = await authFetch(`/api/oneuptick/seo/articles/${articleId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ excerptEn: draft }),
                });
                if (res.ok) {
                  onSaved(draft);
                  setDraft(null);
                }
              } finally {
                setSaving(false);
              }
            }}
            className="px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => setDraft(null)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/excerpt mb-6 pb-6 border-b border-slate-200">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Excerpt (English)</span>
        <button
          type="button"
          onClick={() => setDraft(excerptHtml)}
          className="shrink-0 inline-flex items-center gap-1 text-slate-500 text-xs font-medium opacity-90 group-hover/excerpt:opacity-100 hover:text-primary transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" /> Edit
        </button>
      </div>
      {excerptHtml.trim() ? (
        <div
          className={`${proseOneuptickEnglish} prose-p:text-slate-600`}
          dangerouslySetInnerHTML={{ __html: getHtmlContent(excerptHtml) }}
        />
      ) : (
        <p className="text-sm text-slate-400">No excerpt — click Edit to add.</p>
      )}
    </div>
  );
}

export default function OneUptickSeoPage() {
  const { authFetch } = useAuth();
  const setCenterSupplement = useSetNavbarSupplement();
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState<CapitalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [siteFilter, setSiteFilter] = useState<SeoSiteFilter>("all");
  const [rightContent, setRightContent] = useState<string | null>(null);
  const [rightContentLoading, setRightContentLoading] = useState(false);
  const [englishDetail, setEnglishDetail] = useState<{
    title: string;
    excerpt: string;
    article: string;
  } | null>(null);
  /** TC title from content API (list column uses English). */
  const [tcTitleDetail, setTcTitleDetail] = useState<string | null>(null);
  /** TC excerpt from content API. */
  const [tcExcerptDetail, setTcExcerptDetail] = useState<string | null>(null);
  /** Per-session cache of fetched article bodies keyed by id, so re-selecting a row is instant. */
  const contentCacheRef = useRef(new Map<string, SeoContentCacheEntry>());
  /** The article id that the detail state currently belongs to (guards cache writes during transitions). */
  const loadedContentIdRef = useRef<string | null>(null);
  /** Tab 1 = English (default); tab 2 = 繁體中文. */
  const [detailLocaleTab, setDetailLocaleTab] = useState<"tc" | "en">("en");
  const [uploadModal, setUploadModal] = useState<ArticleDetailUploadModalPayload | null>(null);
  const [editModal, setEditModal] = useState<ArticleDetailEditModalPayload | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [readModalOpen, setReadModalOpen] = useState(false);
  const [titleEditDraft, setTitleEditDraft] = useState<string | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [thumbnailModalOpen, setThumbnailModalOpen] = useState(false);
  const [thumbnailDraft, setThumbnailDraft] = useState("");
  const [savingThumbnail, setSavingThumbnail] = useState(false);
  const [thumbnailUploadError, setThumbnailUploadError] = useState<string | null>(null);
  const [thumbnailUploadSuccess, setThumbnailUploadSuccess] = useState<string | null>(null);
  const thumbnailFileInputRef = useRef<HTMLInputElement>(null);
  const [thumbnailPickedFile, setThumbnailPickedFile] = useState<File | null>(null);
  /** Thumbnail URLs confirmed this session (list refresh must not wipe these). */
  const [thumbnailUrlByArticleId, setThumbnailUrlByArticleId] = useState<Record<string, string>>({});
  const [cleaningContentArtifacts, setCleaningContentArtifacts] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    setMobileActionsOpen(false);
  }, [selectedId, mobileDetailOpen]);

  useEffect(() => {
    setThumbnailModalOpen(false);
    setThumbnailUploadError(null);
  }, [selectedId]);

  useBodyScrollLock(mobileDetailOpen);

  const refreshSeoArticleList = useCallback(async (): Promise<CapitalItem[] | null> => {
    try {
      const res = await authFetch("/api/oneuptick/seo/articles", { forceRefresh: true });
      if (!res.ok) return null;
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setItems(list);
      return list;
    } catch {
      return null;
    }
  }, [authFetch]);

  const applySeoContentEntry = useCallback((entry: SeoContentCacheEntry) => {
    setRightContent(entry.content);
    setTcTitleDetail(entry.tcTitle);
    setTcExcerptDetail(entry.tcExcerpt);
    setEnglishDetail(entry.englishDetail);
  }, []);

  const fetchContent = useCallback(
    async (articleId: string) => {
      const cached = contentCacheRef.current.get(articleId);
      if (cached) {
        applySeoContentEntry(cached);
        setRightContentLoading(false);
        loadedContentIdRef.current = articleId;
        return;
      }
      setTcTitleDetail(null);
      setTcExcerptDetail(null);
      setEnglishDetail(null);
      setRightContentLoading(true);
      try {
        const res = await authFetch(`/api/oneuptick/seo/articles/${articleId}/content`);
        if (res.ok) {
          const data = await res.json();
          const entry: SeoContentCacheEntry = {
            content: data.content ?? "",
            tcTitle: typeof data.titleTc === "string" ? data.titleTc : "",
            tcExcerpt: typeof data.excerptTc === "string" ? data.excerptTc : "",
            englishDetail: {
              title: typeof data.titleEn === "string" ? data.titleEn : "",
              excerpt: typeof data.excerptEn === "string" ? data.excerptEn : "",
              article: typeof data.contentEn === "string" ? data.contentEn : "",
            },
          };
          applySeoContentEntry(entry);
          loadedContentIdRef.current = articleId;
          const cache = contentCacheRef.current;
          cache.set(articleId, entry);
          if (cache.size > CONTENT_CACHE_MAX) {
            const oldest = cache.keys().next().value;
            if (oldest !== undefined) cache.delete(oldest);
          }
        } else {
          setRightContent("");
          setTcTitleDetail("");
          setTcExcerptDetail("");
          setEnglishDetail({ title: "", excerpt: "", article: "" });
        }
      } catch {
        setRightContent("");
        setTcTitleDetail("");
        setTcExcerptDetail("");
        setEnglishDetail({ title: "", excerpt: "", article: "" });
      } finally {
        setRightContentLoading(false);
      }
    },
    [authFetch, applySeoContentEntry]
  );

  // Mirror in-place edits of the selected article into its cache entry (guarded to the loaded id so a
  // transition or failed fetch never writes stale/empty content). See 1uptickarticles for the rationale.
  useEffect(() => {
    if (!selectedId || rightContentLoading) return;
    if (rightContent === null || englishDetail === null || tcTitleDetail === null || tcExcerptDetail === null) return;
    if (loadedContentIdRef.current !== selectedId) return;
    contentCacheRef.current.set(selectedId, {
      content: rightContent,
      tcTitle: tcTitleDetail,
      tcExcerpt: tcExcerptDetail,
      englishDetail,
    });
  }, [selectedId, rightContent, englishDetail, tcTitleDetail, tcExcerptDetail, rightContentLoading]);

  useEffect(() => {
    const fetchItems = async () => {
      setError(null);
      try {
        const res = await authFetch("/api/oneuptick/seo/articles", { forceRefresh: true });
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : [];
          setItems(list);
          const openId = (location.state as { openArticleId?: string } | null)?.openArticleId;
          if (openId && list.some((i: CapitalItem) => i.id === openId)) {
            setSelectedId(openId);
            navigate("/1uptick/seo", { replace: true, state: {} });
          } else if (list.length > 0) {
            setSelectedId(list[0].id);
          }
        } else {
          const err = await res.json().catch(() => ({}));
          const detail = [err?.error, err?.airtableError].filter(Boolean).join(" — ");
          setError(detail || "Failed to load data");
        }
      } catch (err) {
        console.error(err);
        setError("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    };
    fetchItems();
  }, [authFetch]);

  useEffect(() => {
    setDetailLocaleTab("en");
    if (selectedId) {
      // fetchContent resets/loads the detail state itself (instant on a cache hit, null-then-fetch on a miss).
      fetchContent(selectedId);
    } else {
      setRightContent(null);
      setTcTitleDetail(null);
      setTcExcerptDetail(null);
      setEnglishDetail(null);
    }
  }, [selectedId, fetchContent]);

  useEffect(() => {
    const fromList: Record<string, string> = {};
    for (const i of items) {
      const u = i.image_url?.trim();
      if (u) fromList[i.id] = u;
    }
    if (Object.keys(fromList).length > 0) {
      setThumbnailUrlByArticleId((prev) => ({ ...fromList, ...prev }));
    }
  }, [items]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await authFetch(`/api/oneuptick/seo/articles/${selectedId}/meta`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { image_url?: string };
        const url = typeof data.image_url === "string" ? data.image_url.trim() : "";
        if (!url || cancelled) return;
        setThumbnailUrlByArticleId((prev) => ({ ...prev, [selectedId]: url }));
        setItems((prev) => prev.map((i) => (i.id === selectedId ? { ...i, image_url: url } : i)));
      } catch {
        /* ignore — list row may still have image_url */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch, selectedId]);


  useEffect(() => {
    return () => setCenterSupplement(null);
  }, [setCenterSupplement]);

  useEffect(() => {
    setTitleEditDraft(null);
  }, [selectedId]);

  useEffect(() => {
    setTitleEditDraft(null);
  }, [detailLocaleTab]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (!seoSiteMatchesFilter(item.site, siteFilter)) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        (item.title && item.title.toLowerCase().includes(q)) ||
        (item.excerpt && item.excerpt.toLowerCase().includes(q)) ||
        (item.site && item.site.toLowerCase().includes(q))
      );
    });
  }, [items, siteFilter, searchQuery]);

  const selectedItem = selectedId ? items.find((i) => i.id === selectedId) : null;
  const tcExcerptForPanel = tcExcerptDetail ?? "";
  const tcTitleForPanel = tcTitleDetail ?? "";

  const saveSeoThumbnailUrl = useCallback(
    async (url: string) => {
      if (!selectedId) throw new Error("No article selected.");
      const trimmed = url.trim();
      if (!trimmed) throw new Error("Thumbnail URL is empty.");
      const res = await authFetch(`/api/oneuptick/seo/articles/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: trimmed }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string })?.error || "Failed to save thumbnail to Airtable");
      }
      const data = (await res.json().catch(() => ({}))) as { image_url?: string };
      const saved =
        typeof data.image_url === "string" && data.image_url.trim() ? data.image_url.trim() : trimmed;
      setItems((prev) => prev.map((i) => (i.id === selectedId ? { ...i, image_url: saved } : i)));
      setThumbnailDraft(saved);
      setThumbnailUrlByArticleId((prev) => ({ ...prev, [selectedId]: saved }));
    },
    [authFetch, selectedId]
  );

  const uploadSeoThumbnailFile = useCallback(
    async (file: File) => {
      if (!selectedId) throw new Error("No article selected.");
      const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
      if (!allowedTypes.includes(file.type)) {
        throw new Error("Please choose a JPEG, PNG, GIF, or WebP image.");
      }
      const maxSizeBytes = 5 * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        throw new Error("Image must be 5MB or smaller.");
      }
      const fd = new FormData();
      fd.append("file", file);
      const upRes = await authFetch(`/api/oneuptick/seo/articles/${selectedId}/upload-image`, {
        method: "POST",
        body: fd,
      });
      if (!upRes.ok) {
        const err = await upRes.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string })?.error ??
            (upRes.status === 413 ? "Image must be 5MB or smaller." : "Upload failed")
        );
      }
      const data = (await upRes.json()) as { url?: string; image_url?: string; airtableField?: string };
      const saved = (typeof data.image_url === "string" ? data.image_url : data.url ?? "").trim();
      if (!saved) throw new Error("Upload succeeded but no image URL was returned.");
      setItems((prev) => prev.map((i) => (i.id === selectedId ? { ...i, image_url: saved } : i)));
      setThumbnailDraft(saved);
      setThumbnailUrlByArticleId((prev) => ({ ...prev, [selectedId]: saved }));
      setThumbnailPickedFile(null);
      if (thumbnailFileInputRef.current) thumbnailFileInputRef.current.value = "";
      const field =
        typeof data.airtableField === "string" && data.airtableField.trim()
          ? data.airtableField.trim()
          : "image_url";
      return { saved, airtableField: field };
    },
    [authFetch, selectedId]
  );

  const handleCleanMarkdownArtifacts = useCallback(async () => {
    if (!selectedItem || englishDetail === null || rightContentLoading) return;
    const tc = rightContent ?? "";
    const en = englishDetail.article ?? "";
    const newTc = cleanWordPressBodyMarkdownArtifacts(tc);
    const newEn = cleanWordPressBodyMarkdownArtifacts(en);
    if (newTc === tc && newEn === en) {
      window.alert("No markdown-style artifacts detected in the TC or EN article body.");
      return;
    }
    setCleaningContentArtifacts(true);
    try {
      if (newTc !== tc) {
        const res = await authFetch(`/api/oneuptick/seo/articles/${selectedItem.id}/content`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: newTc }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || `Saving TC body failed (${res.status})`);
        }
        setRightContent(newTc);
      }
      if (newEn !== en) {
        const res = await authFetch(`/api/oneuptick/seo/articles/${selectedItem.id}/content`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: newEn, locale: "en" }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || `Saving EN body failed (${res.status})`);
        }
        setEnglishDetail((d) => (d ? { ...d, article: newEn } : d));
      }
    } catch (e) {
      window.alert((e as Error).message || "Could not save cleaned content.");
    } finally {
      setCleaningContentArtifacts(false);
      setMobileActionsOpen(false);
    }
  }, [authFetch, selectedItem, englishDetail, rightContent, rightContentLoading]);

  const seoThumbReady = useMemo(() => {
    if (!selectedId) return false;
    const confirmed = thumbnailUrlByArticleId[selectedId]?.trim();
    if (confirmed) return true;
    const row = items.find((i) => i.id === selectedId);
    return Boolean(row?.image_url?.trim());
  }, [items, selectedId, thumbnailUrlByArticleId]);

  const handlePublish = useCallback(async () => {
    if (!selectedItem) return;
    setPublishing(true);
    try {
      const res = await authFetch(`/api/oneuptick/seo/articles/${selectedItem.id}/publish`, { method: "POST" });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
          detail?: string;
          hint?: string;
        };
        const parts = [err?.error, err?.detail, err?.hint].filter(Boolean);
        throw new Error(parts.join("\n\n") || `Publish failed (${res.status})`);
      }
      const list = await refreshSeoArticleList();
      const publishedId = selectedItem.id;
      if (list && !list.some((i) => i.id === publishedId)) {
        setSelectedId(list[0]?.id ?? null);
      }
    } catch (e) {
      window.alert((e as Error).message || "Publish failed");
    } finally {
      setPublishing(false);
      setMobileActionsOpen(false);
    }
  }, [authFetch, selectedItem, refreshSeoArticleList]);

  useEffect(() => {
    if (loading) {
      setCenterSupplement("SEO Article · Loading…");
      return;
    }
    if (error) {
      setCenterSupplement("SEO Article · Could not load list");
      return;
    }
    if (!selectedItem) {
      setCenterSupplement("SEO Article · Select an article");
      return;
    }
    const postLabel = selectedItem.status?.trim() || "Ready";
    const siteLabel = selectedItem.site?.trim();
    setCenterSupplement(
      siteLabel
        ? `SEO Article · Publish status: ${postLabel} · site: ${siteLabel}`
        : `SEO Article · Publish status: ${postLabel} · site: (empty)`
    );
  }, [loading, error, selectedItem, setCenterSupplement]);

  const englishPanelLoading = rightContentLoading || englishDetail === null;

  const localeTabs = (
    <div className="flex gap-0 mb-6 border-b border-slate-200" role="tablist" aria-label="Article language">
      <button
        type="button"
        role="tab"
        aria-selected={detailLocaleTab === "en"}
        onClick={() => setDetailLocaleTab("en")}
        className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
          detailLocaleTab === "en"
            ? "border-primary text-primary"
            : "border-transparent text-slate-500 hover:text-slate-700"
        }`}
      >
        English
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={detailLocaleTab === "tc"}
        onClick={() => setDetailLocaleTab("tc")}
        className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
          detailLocaleTab === "tc"
            ? "border-primary text-primary"
            : "border-transparent text-slate-500 hover:text-slate-700"
        }`}
      >
        繁體中文
      </button>
    </div>
  );

  const readModalTitle =
    detailLocaleTab === "en" && englishDetail
      ? englishDetail.title
      : tcTitleForPanel.trim() || "—";
  const readModalExcerpt =
    detailLocaleTab === "en" && englishDetail ? englishDetail.excerpt : tcExcerptForPanel;
  const readModalBody =
    detailLocaleTab === "en" && englishDetail ? englishDetail.article : rightContent ?? "";

  const seoActionsBundleReady =
    Boolean(selectedItem) && englishDetail !== null && !rightContentLoading;

  const mobileActionsDropdown = selectedItem && (
    <div
      className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-white shadow-2xl border border-slate-200 py-1.5 z-[100] ring-1 ring-black ring-opacity-5 animate-in fade-in slide-in-from-top-2 duration-150"
      onMouseLeave={() => setMobileActionsOpen(false)}
    >
      {readModalBody.trim() ? (
        <button
          type="button"
          onClick={() => {
            setReadModalOpen(true);
            setMobileActionsOpen(false);
          }}
          className="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors flex items-center gap-3"
        >
          <BookOpen className="w-4 h-4 text-slate-400" />
          View full article
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => void handleCleanMarkdownArtifacts()}
        disabled={cleaningContentArtifacts}
        className="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors flex items-center gap-3 disabled:opacity-50"
      >
        {cleaningContentArtifacts ? (
          <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
        ) : (
          <Eraser className="w-4 h-4 text-slate-400" />
        )}
        Clean markdown (TC + EN)
      </button>
      {readModalBody.trim() ? (
        <button
          type="button"
          onClick={() => {
            const body = getHtmlContent(readModalBody || "");
            const title = readModalTitle || "article";
            const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeAttr(title)}</title></head><body>${articleDownloadLeadHtml(title, readModalExcerpt)}${body}</body></html>`;
            const blob = new Blob([fullHtml], { type: "text/html;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const baseName = title.slice(0, 50).replace(/[<>:"/\\|?*]/g, "") || "article";
            a.download = `${baseName}.html`;
            a.click();
            URL.revokeObjectURL(url);
            setMobileActionsOpen(false);
          }}
          className="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors flex items-center gap-3"
        >
          <Download className="w-4 h-4 text-slate-400" />
          Download as HTML
        </button>
      ) : null}
      {readModalBody.trim() ? (
        <button
          type="button"
          onClick={() => {
            const body = getHtmlContent(readModalBody || "");
            const title = readModalTitle || "article";
            const text = articleDownloadPlainText(title, readModalExcerpt, body);
            const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${title.slice(0, 50).replace(/[<>:"/\\|?*]/g, "") || "article"}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            setMobileActionsOpen(false);
          }}
          className="w-full text-left px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-primary transition-colors flex items-center gap-3"
        >
          <FileText className="w-4 h-4 text-slate-400" />
          Download as plain text
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => void handlePublish()}
        disabled={publishing}
        title={seoThumbReady ? "Publish to n8n" : "Publish (upload thumbnail first if this fails)"}
        className="w-full text-left px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors flex items-center gap-3 disabled:opacity-50"
      >
        {publishing ? <Loader2 className="w-4 h-4 text-red-600 animate-spin" /> : <Rocket className="w-4 h-4 text-red-600" />}
        Publish
      </button>
    </div>
  );

  useEffect(() => {
    if (filteredItems.length === 0) {
      if (selectedId != null) setSelectedId(null);
      return;
    }
    const stillVisible = selectedId && filteredItems.some((i) => i.id === selectedId);
    if (!stillVisible) setSelectedId(filteredItems[0].id);
  }, [filteredItems, selectedId]);

  if (loading) {
    return <ContentAreaLoader variant="page" constrained message="Loading..." pulseMessage={false} />;
  }

  if (error) {
    return (
      <div className="w-full max-w-[1800px] mx-auto px-4 py-20 text-center">
        <p className="text-slate-600 font-medium mb-2">Couldn&apos;t load SEO Article list</p>
        <p className="text-slate-500 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex flex-col h-[calc(100vh-8rem)] min-h-[480px] rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
        <header
          className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-primary-dark/30 z-[60]"
          style={{ background: "linear-gradient(to right, var(--color-primary), #facc15)" }}
        >
          <div className="flex flex-col min-w-0 gap-0.5">
            <h2 className="text-lg font-bold text-white drop-shadow-sm leading-tight">SEO Article</h2>
            <p className="text-[11px] sm:text-xs text-white/90 font-medium leading-snug">
              List: <span className="text-white font-semibold">Post = Ready</span>
              {" · "}
              <span className="text-white font-semibold">site</span> not empty
            </p>
            {selectedItem ? (
              <p
                className="text-[11px] sm:text-xs text-white font-semibold leading-snug truncate max-w-[min(100vw-8rem,32rem)]"
                title={selectedItem.site ? `site: ${selectedItem.site}` : undefined}
              >
                Selected: Post = {selectedItem.status?.trim() || "Ready"}
                {" · "}
                site = {selectedItem.site?.trim() ? selectedItem.site.trim() : "—"}
                {" · "}
                thumbnail = {seoThumbReady ? "set" : "missing"}
              </p>
            ) : null}
          </div>
          <div
            className="flex items-center gap-0.5 rounded-lg border border-slate-200/90 bg-white/95 p-0.5 shadow-sm shrink-0"
            role="group"
            aria-label="Filter list by site"
          >
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide px-1.5 hidden sm:inline">
              site
            </span>
            {(
              [
                { v: "all" as const, label: "All" },
                { v: "main" as const, label: "main" },
                { v: "ai" as const, label: "ai" },
                { v: "kong" as const, label: "kong" },
                { v: "main_ai" as const, label: "both" },
              ] as const
            ).map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => setSiteFilter(v)}
                title={
                  v === "main_ai"
                    ? 'Show only rows where site is "main" or "ai"'
                    : v === "all"
                      ? "Show all sites"
                      : `Show only site = ${label}`
                }
                className={`px-2 sm:px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  siteFilter === v
                    ? "bg-primary text-white shadow-sm"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end min-w-0">
            {selectedItem && (
              <button
                type="button"
                onClick={() => {
                  setThumbnailDraft(selectedItem.image_url?.trim() ?? "");
                  setThumbnailModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium shadow-sm hover:bg-[#91e6f5] hover:border-[#91e6f5] transition-colors"
              >
                <Image className="w-4 h-4 shrink-0" aria-hidden />
                Thumbnail{seoThumbReady ? "" : " (required)"}
              </button>
            )}
            {selectedItem && (
              <button
                type="button"
                onClick={() => void handlePublish()}
                disabled={publishing}
                title={
                  seoThumbReady
                    ? "Publish to n8n"
                    : "Publish (upload a thumbnail first if this fails)"
                }
                className="hidden lg:inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-600 bg-red-600 text-white text-sm font-medium hover:bg-red-700 hover:border-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {publishing ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Rocket className="w-4 h-4 text-white" />}
                Publish
              </button>
            )}
            {selectedItem && seoActionsBundleReady && (
              <button
                type="button"
                onClick={() => void handleCleanMarkdownArtifacts()}
                disabled={cleaningContentArtifacts}
                title="Remove leaked \\n, /n, //n and light **markdown** from TC and EN article HTML, then save"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium shadow-sm hover:bg-[#91e6f5] hover:border-[#91e6f5] transition-colors disabled:opacity-50"
              >
                {cleaningContentArtifacts ? (
                  <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden />
                ) : (
                  <Eraser className="w-4 h-4 shrink-0" aria-hidden />
                )}
                Clean markdown
              </button>
            )}
            {selectedItem && seoActionsBundleReady && (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <div className="hidden lg:flex items-center gap-2">
                  {readModalBody.trim() ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setReadModalOpen(true)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-[#91e6f5] hover:border-[#91e6f5] transition-colors"
                      >
                        <BookOpen className="w-4 h-4" />
                        View full article
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const body = getHtmlContent(readModalBody);
                          const title = readModalTitle || "article";
                          const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeAttr(title)}</title></head><body>${articleDownloadLeadHtml(title, readModalExcerpt)}${body}</body></html>`;
                          const blob = new Blob([fullHtml], { type: "text/html;charset=utf-8" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          const baseName = title.slice(0, 50).replace(/[<>:"/\\|?*]/g, "") || "article";
                          a.download = `${baseName}.html`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-[#91e6f5] hover:border-[#91e6f5] transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        Download as HTML
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const body = getHtmlContent(readModalBody || "");
                          const title = readModalTitle || "article";
                          const text = articleDownloadPlainText(title, readModalExcerpt, body);
                          const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `${title.slice(0, 50).replace(/[<>:"/\\|?*]/g, "") || "article"}.txt`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-medium hover:bg-[#91e6f5] hover:border-[#91e6f5] transition-colors"
                      >
                        <FileText className="w-4 h-4" />
                        Download as plain text
                      </button>
                    </>
                  ) : null}
                </div>

                <div className="lg:hidden relative">
                  <button
                    type="button"
                    onClick={() => setMobileActionsOpen(!mobileActionsOpen)}
                    className="p-2 rounded-lg bg-white/20 text-white hover:bg-white/30 transition-colors"
                    aria-expanded={mobileActionsOpen}
                    aria-haspopup="true"
                    aria-label="Article actions"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                  {mobileActionsOpen && mobileActionsDropdown}
                </div>
              </div>
            )}
          </div>
        </header>
        <div className="flex flex-col lg:flex-row flex-1 min-h-0 relative">
          <aside className="lg:w-[380px] shrink-0 flex flex-col border-r border-slate-200 bg-slate-50/50">
            <div className="flex-1 overflow-y-auto">
              {filteredItems.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-sm">
                  {items.length === 0 ? (
                    "No records match Post = Ready with site set."
                  ) : items.some((i) => seoSiteMatchesFilter(i.site, siteFilter)) ? (
                    "No items match your search."
                  ) : (
                    "No items match this site filter."
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filteredItems.map((item) => {
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
                          <p className="font-semibold text-slate-900 mb-1">{item.title || "—"}</p>
                          <div
                            className="text-sm text-slate-600 prose prose-sm prose-slate max-w-none"
                            dangerouslySetInnerHTML={{ __html: getHtmlContent(item.excerpt || "") }}
                          />
                          {item.site?.trim() ? (
                            <p className="mt-2 text-xs text-slate-500 truncate" title={item.site}>
                              <span className="font-semibold text-slate-600">site:</span> {item.site.trim()}
                            </p>
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
              <div className="flex-1 overflow-y-auto py-6 px-10 border-l border-slate-200">
                {localeTabs}
                {detailLocaleTab === "en" ? (
                  englishPanelLoading ? (
                    <ContentAreaLoader variant="panel" size="sm" message="Loading content..." pulseMessage={false} />
                  ) : englishDetail != null ? (
                    <CapitalArticleDetailView
                      articleId={selectedItem.id}
                      displayTitle={englishDetail.title}
                      oneuptickLocale="en"
                      middleSlot={
                        <SeoEnglishExcerptEditor
                          articleId={selectedItem.id}
                          excerptHtml={englishDetail.excerpt}
                          authFetch={authFetch}
                          onSaved={(html) => {
                            setEnglishDetail((d) => (d ? { ...d, excerpt: html } : d));
                            setItems((prev) => prev.map((i) => (i.id === selectedItem.id ? { ...i, excerpt: html } : i)));
                          }}
                        />
                      }
                      titleEditDraft={titleEditDraft}
                      setTitleEditDraft={setTitleEditDraft}
                      savingTitle={savingTitle}
                      setSavingTitle={setSavingTitle}
                      patchTitle={(id, title) =>
                        authFetch(`/api/oneuptick/seo/articles/${id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ titleEn: title }),
                        })
                      }
                      patchContent={(id, content) =>
                        authFetch(`/api/oneuptick/seo/articles/${id}/content`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ content, locale: "en" }),
                        })
                      }
                      onTitleSaved={(newTitle) => {
                        setEnglishDetail((d) => (d ? { ...d, title: newTitle } : d));
                        setItems((prev) => prev.map((i) => (i.id === selectedItem.id ? { ...i, title: newTitle } : i)));
                      }}
                      rightContentLoading={false}
                      rightContent={englishDetail.article.trim() ? englishDetail.article : null}
                      setEditModal={setEditModal}
                      setEditDraft={setEditDraft}
                      setUploadModal={setUploadModal}
                      setRightContent={(c) => setEnglishDetail((d) => (d ? { ...d, article: c ?? "" } : d))}
                    />
                  ) : null
                ) : rightContentLoading ? (
                  <ContentAreaLoader variant="panel" size="sm" message="Loading content..." pulseMessage={false} />
                ) : (
                  <CapitalArticleDetailView
                    articleId={selectedItem.id}
                    displayTitle={tcTitleForPanel}
                    oneuptickLocale="tc"
                    middleSlot={
                      <SeoTcExcerptEditor
                        articleId={selectedItem.id}
                        excerptHtml={tcExcerptForPanel}
                        authFetch={authFetch}
                        onSaved={(html) => setTcExcerptDetail(html)}
                      />
                    }
                    titleEditDraft={titleEditDraft}
                    setTitleEditDraft={setTitleEditDraft}
                    savingTitle={savingTitle}
                    setSavingTitle={setSavingTitle}
                    patchTitle={(id, title) =>
                      authFetch(`/api/oneuptick/seo/articles/${id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ title }),
                      })
                    }
                    patchContent={(id, content) =>
                      authFetch(`/api/oneuptick/seo/articles/${id}/content`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ content }),
                      })
                    }
                    onTitleSaved={(newTitle) => setTcTitleDetail(newTitle)}
                    rightContentLoading={false}
                    rightContent={rightContent}
                    setEditModal={setEditModal}
                    setEditDraft={setEditDraft}
                    setUploadModal={setUploadModal}
                    setRightContent={setRightContent}
                  />
                )}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-20">
                <FileText className="w-14 h-14 mb-4 text-slate-200" />
                <p className="text-sm">Select an item from the list.</p>
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
                  className="shrink-0 flex items-center justify-between gap-4 px-4 py-3 border-b border-primary-dark/30"
                  style={{ background: "linear-gradient(to right, var(--color-primary), #facc15)" }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => setMobileDetailOpen(false)}
                      className="p-1 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors shrink-0"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div className="flex flex-col min-w-0">
                      <h2 className="text-lg font-bold text-white drop-shadow-sm truncate max-w-[140px] sm:max-w-[200px]">
                        {selectedItem.title}
                      </h2>
                      {selectedItem.site?.trim() ? (
                        <span
                          className="text-[10px] sm:text-[11px] text-white/90 font-medium truncate max-w-[140px] sm:max-w-[200px]"
                          title={selectedItem.site}
                        >
                          site: {selectedItem.site.trim()}
                        </span>
                      ) : (
                        <span className="text-[10px] text-white/80">Post = Ready · site required</span>
                      )}
                    </div>
                  </div>
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setMobileActionsOpen(!mobileActionsOpen)}
                      className="p-2 rounded-lg bg-white/20 text-white hover:bg-white/30 transition-colors"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                    {mobileActionsOpen && mobileActionsDropdown}
                  </div>
                </header>

                <div className="flex-1 overflow-y-auto py-6 px-4 border-slate-200">
                  {localeTabs}
                  {detailLocaleTab === "en" ? (
                    englishPanelLoading ? (
                      <ContentAreaLoader variant="panel" size="sm" message="Loading content..." pulseMessage={false} />
                    ) : englishDetail != null ? (
                      <CapitalArticleDetailView
                        articleId={selectedItem.id}
                        displayTitle={englishDetail.title}
                        oneuptickLocale="en"
                        middleSlot={
                          <SeoEnglishExcerptEditor
                            articleId={selectedItem.id}
                            excerptHtml={englishDetail.excerpt}
                            authFetch={authFetch}
                            onSaved={(html) => {
                              setEnglishDetail((d) => (d ? { ...d, excerpt: html } : d));
                              setItems((prev) => prev.map((i) => (i.id === selectedItem.id ? { ...i, excerpt: html } : i)));
                            }}
                          />
                        }
                        titleEditDraft={titleEditDraft}
                        setTitleEditDraft={setTitleEditDraft}
                        savingTitle={savingTitle}
                        setSavingTitle={setSavingTitle}
                        patchTitle={(id, title) =>
                          authFetch(`/api/oneuptick/seo/articles/${id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ titleEn: title }),
                          })
                        }
                        patchContent={(id, content) =>
                          authFetch(`/api/oneuptick/seo/articles/${id}/content`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ content, locale: "en" }),
                          })
                        }
                        onTitleSaved={(newTitle) => {
                          setEnglishDetail((d) => (d ? { ...d, title: newTitle } : d));
                          setItems((prev) => prev.map((i) => (i.id === selectedItem.id ? { ...i, title: newTitle } : i)));
                        }}
                        rightContentLoading={false}
                        rightContent={englishDetail.article.trim() ? englishDetail.article : null}
                        setEditModal={setEditModal}
                        setEditDraft={setEditDraft}
                        setUploadModal={setUploadModal}
                        setRightContent={(c) => setEnglishDetail((d) => (d ? { ...d, article: c ?? "" } : d))}
                      />
                    ) : null
                  ) : rightContentLoading ? (
                    <ContentAreaLoader variant="panel" size="sm" message="Loading content..." pulseMessage={false} />
                  ) : (
                    <CapitalArticleDetailView
                      articleId={selectedItem.id}
                      displayTitle={tcTitleForPanel}
                      oneuptickLocale="tc"
                      middleSlot={
                        <SeoTcExcerptEditor
                          articleId={selectedItem.id}
                          excerptHtml={tcExcerptForPanel}
                          authFetch={authFetch}
                          onSaved={(html) => setTcExcerptDetail(html)}
                        />
                      }
                      titleEditDraft={titleEditDraft}
                      setTitleEditDraft={setTitleEditDraft}
                      savingTitle={savingTitle}
                      setSavingTitle={setSavingTitle}
                      patchTitle={(id, title) =>
                        authFetch(`/api/oneuptick/seo/articles/${id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ title }),
                        })
                      }
                      patchContent={(id, content) =>
                        authFetch(`/api/oneuptick/seo/articles/${id}/content`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ content }),
                        })
                      }
                      onTitleSaved={(newTitle) => setTcTitleDetail(newTitle)}
                      rightContentLoading={false}
                      rightContent={rightContent}
                      setEditModal={setEditModal}
                      setEditDraft={setEditDraft}
                      setUploadModal={setUploadModal}
                      setRightContent={setRightContent}
                    />
                  )}
                </div>
              </motion.main>
            )}
          </AnimatePresence>
        </div>
      </div>

      {readModalOpen && selectedItem && (
        <Modal
          open
          onClose={() => setReadModalOpen(false)}
          title={readModalTitle || "SEO Article"}
          maxWidth="max-w-6xl"
          panelClassName="h-[85vh]"
          ariaLabel="View full article"
        >
          <div className="p-6">
            <header className="mb-8 pb-6 border-b border-slate-200">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-4">{readModalTitle?.trim() || "—"}</h1>
              {readModalExcerpt?.trim() ? (
                <div
                  className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-600 prose-a:text-primary prose-strong:text-slate-800 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:border [&_table]:border-slate-200 [&_img]:max-w-full [&_img]:h-auto"
                  dangerouslySetInnerHTML={{ __html: getHtmlContent(readModalExcerpt) }}
                />
              ) : null}
            </header>
            <div
              className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-700 prose-a:text-primary prose-strong:text-slate-900 prose-strong:font-semibold [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h4]:text-base [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:border [&_table]:border-slate-200 [&_img]:max-w-full [&_img]:h-auto"
              dangerouslySetInnerHTML={{ __html: getHtmlContent(readModalBody) }}
            />
          </div>
        </Modal>
      )}

      {thumbnailModalOpen && selectedItem && (
        <Modal
          open
          onClose={() => {
            if (!savingThumbnail) {
              setThumbnailModalOpen(false);
              setThumbnailUploadError(null);
              setThumbnailUploadSuccess(null);
              setThumbnailPickedFile(null);
            }
          }}
          title="Thumbnail"
          maxWidth="max-w-lg"
          closeOnBackdrop={!savingThumbnail}
          closeDisabled={savingThumbnail}
          ariaLabel="Edit image_url"
          footer={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (!savingThumbnail) {
                    setThumbnailModalOpen(false);
                    setThumbnailUploadError(null);
                    setThumbnailUploadSuccess(null);
                    setThumbnailPickedFile(null);
                  }
                }}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-100 transition-colors disabled:opacity-50"
                disabled={savingThumbnail}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!selectedItem || savingThumbnail) return;
                  setSavingThumbnail(true);
                  setThumbnailUploadError(null);
                  try {
                    await saveSeoThumbnailUrl(thumbnailDraft);
                    setThumbnailUploadSuccess("Saved URL to Airtable.");
                    setThumbnailModalOpen(false);
                  } catch (e) {
                    setThumbnailUploadError((e as Error).message || "Failed to save");
                  } finally {
                    setSavingThumbnail(false);
                  }
                }}
                disabled={savingThumbnail || !thumbnailDraft.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {savingThumbnail ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save URL to Airtable
              </button>
            </div>
          }
        >
          <div className="p-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-700">Upload from your computer</span>
              <p className="text-xs text-slate-500">
                Image is uploaded to storage, then the public URL is written to your Airtable thumbnail
                field (usually <span className="font-mono">image_url</span>).
              </p>
              <input
                ref={thumbnailFileInputRef}
                id="oneuptick-seo-thumbnail-file"
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                disabled={savingThumbnail}
                className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-slate-200 file:text-slate-800 file:font-medium file:cursor-pointer cursor-pointer disabled:opacity-50"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setThumbnailPickedFile(file);
                  setThumbnailUploadError(null);
                  setThumbnailUploadSuccess(null);
                }}
              />
              <motion.div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={savingThumbnail || !thumbnailPickedFile}
                  onClick={async () => {
                    if (!thumbnailPickedFile || savingThumbnail) return;
                    setSavingThumbnail(true);
                    setThumbnailUploadError(null);
                    setThumbnailUploadSuccess(null);
                    try {
                      const { saved, airtableField } = await uploadSeoThumbnailFile(thumbnailPickedFile);
                      setThumbnailUploadSuccess(
                        `Uploaded and saved to Airtable field “${airtableField}”.`
                      );
                      setThumbnailDraft(saved);
                    } catch (err) {
                      setThumbnailUploadError((err as Error).message || "Upload failed");
                    } finally {
                      setSavingThumbnail(false);
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {savingThumbnail ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
                  Upload &amp; save to Airtable
                </button>
                {thumbnailPickedFile ? (
                  <span className="text-xs text-slate-500 truncate max-w-[14rem]" title={thumbnailPickedFile.name}>
                    {thumbnailPickedFile.name}
                  </span>
                ) : null}
              </motion.div>
              <p className="text-xs text-slate-500">JPEG, PNG, GIF, or WebP · max 5MB</p>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center" aria-hidden>
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-slate-400">or paste URL</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="oneuptick-seo-image-url" className="text-sm font-medium text-slate-700">
                image_url
              </label>
              <input
                id="oneuptick-seo-image-url"
                type="url"
                value={thumbnailDraft}
                onChange={(e) => {
                  setThumbnailDraft(e.target.value);
                  setThumbnailUploadError(null);
                }}
                placeholder="https://…"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 text-slate-900 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                disabled={savingThumbnail}
                autoComplete="off"
              />
            </div>

            {thumbnailDraft.trim() ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="text-xs font-medium text-slate-500 mb-2">Preview</p>
                <img
                  src={thumbnailDraft.trim()}
                  alt=""
                  className="max-h-40 w-full object-contain rounded"
                  onError={(ev) => {
                    (ev.target as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            ) : null}

            {thumbnailUploadError ? <p className="text-sm text-red-600">{thumbnailUploadError}</p> : null}
            {thumbnailUploadSuccess ? (
              <p className="text-sm text-emerald-700">{thumbnailUploadSuccess}</p>
            ) : null}
            {savingThumbnail ? (
              <p className="text-sm text-slate-500 inline-flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-primary" aria-hidden />
                Uploading and saving to Airtable…
              </p>
            ) : null}
          </div>
        </Modal>
      )}

      <OneuptickArticleUploadModal
        payload={uploadModal}
        onClose={() => setUploadModal(null)}
        apiBase="/api/oneuptick/seo/articles"
        authFetch={authFetch}
        getRawArticle={(isEn) => (isEn ? englishDetail?.article ?? "" : rightContent || "")}
        applyContent={(isEn, newContent) =>
          isEn
            ? setEnglishDetail((d) => (d ? { ...d, article: newContent } : d))
            : setRightContent(newContent)
        }
      />

      <OneuptickArticleBlockEditModal
        payload={editModal}
        draft={editDraft}
        setDraft={setEditDraft}
        onClose={() => { setEditModal(null); setEditDraft(""); }}
        apiBase="/api/oneuptick/seo/articles"
        authFetch={authFetch}
        getRawArticle={(isEn) => (isEn ? englishDetail?.article ?? "" : rightContent || "")}
        applyContent={(isEn, newContent) =>
          isEn
            ? setEnglishDetail((d) => (d ? { ...d, article: newContent } : d))
            : setRightContent(newContent)
        }
      />
    </div>
  );
}

