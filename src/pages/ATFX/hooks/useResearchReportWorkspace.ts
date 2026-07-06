import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../contexts/AuthContext";
import { streamResearchReportChat } from "../../../lib/atfxResearchReportStream";
import {
  mergePipelineMessages,
  pipelineMessagesFromLiveStages,
} from "../../../lib/pipelinePersistMessages";
import {
  DEFAULT_REPORT_OUTPUT_OPTIONS,
  i18nTabLanguages,
  languageTabLabel,
  languageTranslatingLabel,
  parseReportOutputOptions,
  reportI18nFromApi,
  type ReportI18nContent,
  type ReportLanguage,
  type ReportOutputOptions,
  type ReportTranslateLocale,
} from "../../../lib/atfxResearchReportOptions";
import { streamResearchReportTranslate } from "../../../lib/atfxResearchReportTranslateService";
import {
  DEFAULT_REPORT_TITLE,
  type ChatMessage,
  type ReportListItem,
} from "../researchReportUtils";
import { useResearchReportLiveStages } from "./useResearchReportLiveStages";
import type { BrokerageTokenBalance } from "../../../lib/brokerageTokens";
import type { CapitalKeywordItem } from "../../Capital/types";
import {
  readResearchReportListCache,
  writeResearchReportListCache,
} from "../../../lib/researchReportListCache";

const REPORT_PREVIEW_THROTTLE_MS = 200;
const REPORT_LIST_STALE_MS = 30_000;

type CachedReportSnapshot = {
  id: string;
  title: string;
  reportI18n: ReportI18nContent;
  activeLangTab: ReportLanguage;
  messages: ChatMessage[];
  outputOptions: ReportOutputOptions;
  seoExcerpt: string;
  thumbnailUrl: string;
};

type LoadReportOptions = {
  refresh?: boolean;
  useCache?: boolean;
  lite?: boolean;
};

export function useResearchReportWorkspace(hookOptions?: {
  onTokenUsageChanged?: (balance?: BrokerageTokenBalance) => void | Promise<void>;
}) {
  const { authFetch, getIdToken, user } = useAuth();
  const {
    liveStages,
    writingPhase,
    setWritingPhase,
    liveStagesRef,
    patchLiveStage,
    resetLiveStages,
  } = useResearchReportLiveStages();

  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState(DEFAULT_REPORT_TITLE);
  const [reportI18n, setReportI18n] = useState<ReportI18nContent>({});
  const [activeLangTab, setActiveLangTab] = useState<ReportLanguage>("en");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [inputHtmlPreview, setInputHtmlPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [creatingNewReport, setCreatingNewReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputOptions, setOutputOptions] = useState<ReportOutputOptions>(DEFAULT_REPORT_OUTPUT_OPTIONS);
  const [seoExcerpt, setSeoExcerpt] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [metaLoading, setMetaLoading] = useState(false);
  const [translatingLocales, setTranslatingLocales] = useState<ReportTranslateLocale[]>([]);
  const [translateProgress, setTranslateProgress] = useState<string | null>(null);
  const [translateToast, setTranslateToast] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const lastSendFingerprintRef = useRef<{ key: string; at: number } | null>(null);
  const titleRef = useRef(title);
  titleRef.current = title;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const reportI18nRef = useRef(reportI18n);
  reportI18nRef.current = reportI18n;
  const previewPendingRef = useRef<{ html: string; language: ReportLanguage } | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const previewLastFlushRef = useRef(0);
  const reportCacheRef = useRef<Map<string, CachedReportSnapshot>>(new Map());
  const reportsFetchedAtRef = useRef(0);
  const historyRefreshRef = useRef<Promise<void> | null>(null);

  const clearPreviewThrottle = useCallback(() => {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    previewPendingRef.current = null;
  }, []);

  const applyReportPreview = useCallback((html: string, language: ReportLanguage) => {
    setReportI18n((prev) => {
      const bundle = prev[language];
      return {
        ...prev,
        [language]: {
          title:
            bundle?.title ||
            (language === "en" ? titleRef.current : languageTabLabel(language)),
          report_html: html,
        },
      };
    });
    setActiveLangTab(language);
    setMetaLoading(true);
  }, []);

  const flushReportPreview = useCallback(() => {
    const pending = previewPendingRef.current;
    if (!pending) return;
    previewPendingRef.current = null;
    previewLastFlushRef.current = Date.now();
    applyReportPreview(pending.html, pending.language);
  }, [applyReportPreview]);

  const scheduleReportPreview = useCallback(
    (html: string, language: ReportLanguage = "en") => {
      previewPendingRef.current = { html, language };
      const elapsed = Date.now() - previewLastFlushRef.current;
      if (elapsed >= REPORT_PREVIEW_THROTTLE_MS) {
        if (previewTimerRef.current !== null) {
          window.clearTimeout(previewTimerRef.current);
          previewTimerRef.current = null;
        }
        flushReportPreview();
        return;
      }
      if (previewTimerRef.current !== null) return;
      previewTimerRef.current = window.setTimeout(() => {
        previewTimerRef.current = null;
        flushReportPreview();
      }, REPORT_PREVIEW_THROTTLE_MS - elapsed);
    },
    [flushReportPreview]
  );

  const loadReportList = useCallback(async () => {
    const res = await authFetch("/api/atfx/research-report");
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || "Failed to load reports");
    }
    const data = await res.json();
    const list = Array.isArray(data) ? (data as ReportListItem[]) : [];
    writeResearchReportListCache(user?.uid, list);
    return list;
  }, [authFetch, user?.uid]);

  const applyReportSnapshot = useCallback((snapshot: CachedReportSnapshot) => {
    setActiveId(snapshot.id);
    setTitle(snapshot.title);
    setReportI18n(snapshot.reportI18n);
    setActiveLangTab(snapshot.activeLangTab);
    setMessages(snapshot.messages);
    setOutputOptions(snapshot.outputOptions);
    setSeoExcerpt(snapshot.seoExcerpt);
    setThumbnailUrl(snapshot.thumbnailUrl);
    setMetaLoading(false);
  }, []);

  const snapshotFromApi = useCallback((data: Record<string, unknown>): CachedReportSnapshot => {
    const i18n = reportI18nFromApi(data);
    const langTab = i18nTabLanguages(i18n)[0] ?? "en";
    return {
      id: String(data.id),
      title: i18n.en?.title || String(data.title ?? DEFAULT_REPORT_TITLE),
      reportI18n: i18n,
      activeLangTab: langTab,
      messages: Array.isArray(data.messages) ? (data.messages as ChatMessage[]) : [],
      outputOptions: parseReportOutputOptions(data.output_options),
      seoExcerpt: typeof data.seo_excerpt === "string" ? data.seo_excerpt : "",
      thumbnailUrl: typeof data.thumbnail_url === "string" ? data.thumbnail_url : "",
    };
  }, []);

  const loadReport = useCallback(
    async (id: string, opts?: LoadReportOptions) => {
      if (opts?.useCache !== false) {
        const cached = reportCacheRef.current.get(id);
        if (cached) {
          applyReportSnapshot(cached);
          return cached;
        }
      }

      setReportLoading(true);
      try {
        const refresh = opts?.refresh === true;
        const params = new URLSearchParams();
        if (refresh) params.set("refresh", "1");
        if (opts?.lite === true) params.set("lite", "1");
        const qs = params.toString();
        const res = await authFetch(
          `/api/atfx/research-report/${id}${qs ? `?${qs}` : ""}`
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || "Failed to load report");
        }
        const data = (await res.json()) as Record<string, unknown>;
        const snapshot = snapshotFromApi(data);
        reportCacheRef.current.set(id, snapshot);
        applyReportSnapshot(snapshot);
        return snapshot;
      } finally {
        setReportLoading(false);
      }
    },
    [applyReportSnapshot, authFetch, snapshotFromApi]
  );

  const refreshHistoryList = useCallback(
    async (opts?: { force?: boolean }) => {
      if (historyRefreshRef.current) return historyRefreshRef.current;

      const stale =
        opts?.force ||
        reportsFetchedAtRef.current === 0 ||
        Date.now() - reportsFetchedAtRef.current > REPORT_LIST_STALE_MS;
      if (!stale) return;

      const task = (async () => {
        setHistoryLoading(true);
        try {
          const list = await loadReportList();
          setReports(list);
          reportsFetchedAtRef.current = Date.now();
        } finally {
          setHistoryLoading(false);
          historyRefreshRef.current = null;
        }
      })();
      historyRefreshRef.current = task;
      return task;
    },
    [loadReportList]
  );

  const invalidateReportCache = useCallback((id?: string | null) => {
    if (id) reportCacheRef.current.delete(id);
    else reportCacheRef.current.clear();
  }, []);

  const clearWorkspace = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    clearPreviewThrottle();
    sendingRef.current = false;
    setSending(false);
    setWritingPhase(null);
    setActiveId(null);
    setTitle(DEFAULT_REPORT_TITLE);
    setReportI18n({});
    setActiveLangTab("en");
    setMessages([]);
    setInput("");
    setInputHtmlPreview(null);
    setError(null);
    setSeoExcerpt("");
    setThumbnailUrl("");
    setMetaLoading(false);
    setTranslatingLocales([]);
    setTranslateProgress(null);
    setOutputOptions(DEFAULT_REPORT_OUTPUT_OPTIONS);
    resetLiveStages();
  }, [clearPreviewThrottle, resetLiveStages, setWritingPhase]);

  const resetToFreshCanvas = useCallback(() => {
    clearWorkspace();
  }, [clearWorkspace]);

  const upsertReportListItem = useCallback((item: ReportListItem) => {
    setReports((prev) => {
      const idx = prev.findIndex((r) => r.id === item.id);
      if (idx === -1) return [item, ...prev];
      const next = [...prev];
      next[idx] = item;
      if (idx === 0) return next;
      next.splice(idx, 1);
      return [item, ...next];
    });
    reportsFetchedAtRef.current = Date.now();
  }, []);

  const createReport = useCallback(
    async (opts?: { forceNew?: boolean }) => {
      const res = await authFetch("/api/atfx/research-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: DEFAULT_REPORT_TITLE,
          reuseEmpty: opts?.forceNew !== true,
          forceNew: opts?.forceNew === true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Failed to create report");
      }
      const data = await res.json();
      const now = new Date().toISOString();
      invalidateReportCache(data.id);
      setActiveId(data.id);
      setTitle(data.title || DEFAULT_REPORT_TITLE);
      setReportI18n({});
      setActiveLangTab("en");
      setMessages([]);
      setInput("");
      setInputHtmlPreview(null);
      setError(null);
      setSeoExcerpt("");
      setThumbnailUrl("");
      setMetaLoading(false);
      setTranslatingLocales([]);
      setOutputOptions(DEFAULT_REPORT_OUTPUT_OPTIONS);
      return data.id as string;
    },
    [authFetch, invalidateReportCache]
  );

  const beginFreshTopicsSession = useCallback(async () => {
    return createReport({ forceNew: true });
  }, [createReport]);

  const syncFreshTopicsSession = useCallback(
    async (
      reportId: string,
      payload: { userRequest: string | null; topics: CapitalKeywordItem[] }
    ) => {
      const body = JSON.stringify({
        action: "sync_fresh_topics",
        report_id: reportId,
        user_request: payload.userRequest,
        topics: payload.topics,
      });

      let res = await authFetch("/api/atfx/research-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (res.status === 404) {
        const fallbackId = activeIdRef.current;
        if (fallbackId && fallbackId !== reportId) {
          res = await authFetch("/api/atfx/research-report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "sync_fresh_topics",
              report_id: fallbackId,
              user_request: payload.userRequest,
              topics: payload.topics,
            }),
          });
        }
      }

      if (res.status === 404) {
        res = await authFetch(`/api/atfx/research-report/${reportId}/fresh-topics/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_request: payload.userRequest,
            topics: payload.topics,
          }),
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Failed to save fresh topics");
      }
      const data = (await res.json()) as {
        title: string;
        updated_at: string;
        messages: ChatMessage[];
      };
      if (!Array.isArray(data.messages)) {
        throw new Error("Failed to save fresh topics");
      }
      setActiveId(reportId);
      setTitle(data.title);
      setMessages(data.messages);
      upsertReportListItem({
        id: reportId,
        title: data.title,
        updated_at: data.updated_at,
        created_at: reports.find((r) => r.id === reportId)?.created_at ?? data.updated_at,
      });
      const cached = reportCacheRef.current.get(reportId);
      reportCacheRef.current.set(reportId, {
        id: reportId,
        title: data.title,
        reportI18n: cached?.reportI18n ?? {},
        activeLangTab: cached?.activeLangTab ?? "en",
        messages: data.messages,
        outputOptions: cached?.outputOptions ?? outputOptions,
        seoExcerpt: cached?.seoExcerpt ?? "",
        thumbnailUrl: cached?.thumbnailUrl ?? "",
      });
      reportsFetchedAtRef.current = Date.now();
      return data;
    },
    [authFetch, outputOptions, reports, upsertReportListItem]
  );

  useEffect(() => {
    let cancelled = false;
    const uid = user?.uid;

    (async () => {
      const cachedList = readResearchReportListCache(uid);
      if (cachedList?.length) {
        setReports(cachedList);
        reportsFetchedAtRef.current = Date.now();
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const list = await loadReportList();
        if (cancelled) return;
        setReports(list);
        reportsFetchedAtRef.current = Date.now();
        setLoading(false);
        clearWorkspace();
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadReportList, loadReport, clearWorkspace, user?.uid]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      clearPreviewThrottle();
    };
  }, [clearPreviewThrottle]);

  const handleKill = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    clearPreviewThrottle();
    sendingRef.current = false;
    setSending(false);
    setWritingPhase(null);
    setMetaLoading(false);
    resetLiveStages();
  }, [clearPreviewThrottle, resetLiveStages, setWritingPhase]);

  const handleSend = useCallback(
    async (text?: string, sendOptions?: { displayMessage?: string }) => {
      const msg = (text ?? input).trim();
      if (!msg || sendingRef.current) return;

      const fingerprint = `${activeId ?? "new"}:${msg}:${sendOptions?.displayMessage?.trim() ?? ""}`;
      const now = Date.now();
      const last = lastSendFingerprintRef.current;
      if (last && last.key === fingerprint && now - last.at < 3000) return;
      lastSendFingerprintRef.current = { key: fingerprint, at: now };

      sendingRef.current = true;
      setSending(true);

      let optimisticUser: ChatMessage | null = null;

      try {
        let reportId = activeId;
        if (!reportId) {
          reportId = await createReport();
        }

        const displayText = sendOptions?.displayMessage?.trim() || msg;

        setInput("");
        setInputHtmlPreview(null);
        setError(null);
        resetLiveStages();
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        optimisticUser = {
          id: `tmp-user-${Date.now()}`,
          role: "user",
          content: displayText,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, optimisticUser]);
        const token = await getIdToken();
        if (!token) throw new Error("Not authenticated");

        const streamHandlers = {
          signal: ac.signal,
          onStageStart: (stage: "planning" | "research" | "writing" | "translating", message: string) => {
            if (stage === "planning" || stage === "research") {
              patchLiveStage(stage, { loading: true, loadingLabel: message });
            } else if (stage === "writing" || stage === "translating") {
              setWritingPhase(message);
            }
          },
          onStageComplete: (stage: "planning" | "research" | "writing" | "translating", stageDisplayText: string) => {
            if (stage === "planning") {
              patchLiveStage(stage, {
                text: stageDisplayText,
                complete: true,
                loading: false,
              });
            } else if (stage === "research") {
              patchLiveStage(stage, (prev) => ({
                text: prev.text.trim() ? `${prev.text}\n\n${stageDisplayText}` : stageDisplayText,
                complete: true,
                loading: false,
              }));
            } else if (stage === "writing" || stage === "translating") {
              setWritingPhase(null);
            }
          },
          onStageDelta: (stage: "planning" | "research" | "writing" | "translating", delta: string) => {
            if (stage === "research") {
              patchLiveStage(stage, (prev) => ({ text: prev.text + delta }));
            }
          },
          onToolStart: (name: string, detail?: string) => {
            patchLiveStage("research", (prev) => ({
              tools: [...prev.tools, { name, summary: "…", ...(detail ? { detail } : {}) }],
            }));
          },
          onToolResult: (name: string, summary: string, detail?: string) => {
            patchLiveStage("research", (prev) => {
              const idx = prev.tools.findIndex(
                (t) =>
                  t.name === name &&
                  t.summary === "…" &&
                  (detail ? t.detail === detail : !t.detail)
              );
              if (idx === -1) {
                return { tools: [...prev.tools, { name, summary, ...(detail ? { detail } : {}) }] };
              }
              const next = [...prev.tools];
              next[idx] = { name, summary, ...(detail ? { detail } : {}) };
              return { tools: next };
            });
          },
          onDelta: () => undefined,
          onReportPreview: scheduleReportPreview,
        };

        const runChat = (rid: string) =>
          streamResearchReportChat(token, rid, msg, outputOptions, streamHandlers, sendOptions?.displayMessage);

        let data;
        try {
          data = await runChat(reportId);
        } catch (chatErr) {
          if ((chatErr as Error).message !== "Report not found") throw chatErr;
          invalidateReportCache(reportId);
          reportId = await createReport({ forceNew: true });
          data = await runChat(reportId);
        }

        flushReportPreview();

        const doneI18n = data.report_i18n
          ? data.report_i18n
          : data.report_html
            ? { en: { title: data.title || titleRef.current, report_html: data.report_html } }
            : reportI18nRef.current;
        if (Object.keys(doneI18n).length > 0) {
          setReportI18n(doneI18n);
          setActiveLangTab(i18nTabLanguages(doneI18n)[0] ?? "en");
        }
        if (doneI18n.en?.title) setTitle(doneI18n.en.title);
        else if (data.title) setTitle(data.title);
        if (data.seo_excerpt) setSeoExcerpt(data.seo_excerpt);
        if (data.thumbnail_url) setThumbnailUrl(data.thumbnail_url);
        setMetaLoading(false);

        const pipelineFromServer: ChatMessage[] = (data.pipeline_messages ?? []).map((m) => ({
          id: m.id,
          role: m.role as ChatMessage["role"],
          content: m.content,
          tool_events: m.tool_events ?? null,
          created_at: m.created_at,
        }));

        const pipelineFromLive = pipelineMessagesFromLiveStages(
          liveStagesRef.current.planning,
          liveStagesRef.current.research,
          String(Date.now())
        );

        const pipelineMsgs: ChatMessage[] = mergePipelineMessages(
          pipelineFromServer.map((m) => ({
            id: m.id,
            role: "tool" as const,
            content: m.content,
            tool_events: m.tool_events,
            created_at: m.created_at,
          })),
          pipelineFromLive
        ).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          tool_events: m.tool_events,
          created_at: m.created_at,
        }));

        const assistantMsg: ChatMessage = {
          id: data.message?.id ?? `tmp-asst-${Date.now()}`,
          role: "assistant",
          content: data.message?.content ?? data.reply ?? "",
          tool_events: data.message?.tool_events ?? data.tool_events,
          created_at: data.message?.created_at ?? new Date().toISOString(),
        };
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimisticUser.id),
          optimisticUser,
          ...pipelineMsgs,
          assistantMsg,
        ]);
        resetLiveStages();

        const listTitle =
          doneI18n.en?.title || data.title || titleRef.current || DEFAULT_REPORT_TITLE;
        const finalMessages = [
          optimisticUser,
          ...pipelineMsgs,
          assistantMsg,
        ];
        upsertReportListItem({
          id: reportId,
          title: listTitle,
          updated_at: new Date().toISOString(),
          created_at:
            reports.find((r) => r.id === reportId)?.created_at ?? new Date().toISOString(),
        });
        reportCacheRef.current.set(reportId, {
          id: reportId,
          title: listTitle,
          reportI18n: doneI18n,
          activeLangTab: i18nTabLanguages(doneI18n)[0] ?? "en",
          messages: finalMessages,
          outputOptions,
          seoExcerpt: typeof data.seo_excerpt === "string" ? data.seo_excerpt : seoExcerpt,
          thumbnailUrl: typeof data.thumbnail_url === "string" ? data.thumbnail_url : thumbnailUrl,
        });
        hookOptions?.onTokenUsageChanged?.();
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message);
        if (optimisticUser) {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticUser!.id));
        }
      } finally {
        clearPreviewThrottle();
        sendingRef.current = false;
        setSending(false);
        abortRef.current = null;
      }
    },
    [
      activeId,
      clearPreviewThrottle,
      createReport,
      flushReportPreview,
      getIdToken,
      input,
      liveStagesRef,
      outputOptions,
      patchLiveStage,
      reports,
      resetLiveStages,
      scheduleReportPreview,
      seoExcerpt,
      setWritingPhase,
      thumbnailUrl,
      upsertReportListItem,
      hookOptions?.onTokenUsageChanged,
    ]
  );

  const handleNewReport = useCallback(
    (resetTopics: () => void) => {
      resetTopics();
      resetToFreshCanvas();
    },
    [resetToFreshCanvas]
  );

  const handleSelectReport = useCallback(
    async (id: string) => {
      if (id === activeId) return;
      try {
        abortRef.current?.abort();
        abortRef.current = null;
        sendingRef.current = false;
        setSending(false);
        resetLiveStages();
        setWritingPhase(null);
        const snapshot = await loadReport(id, { lite: true });
        const hasHtml = Boolean(snapshot?.reportI18n.en?.report_html?.trim());
        const needsMeta =
          hasHtml && (!snapshot?.seoExcerpt.trim() || !snapshot?.thumbnailUrl.trim());
        if (needsMeta) {
          void loadReport(id, { lite: false, useCache: false });
        }
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [activeId, loadReport, resetLiveStages, setWritingPhase]
  );

  const handleDeleteReport = useCallback(
    async (id: string) => {
      if (!window.confirm("Delete this research report and all chat history?")) return;
      try {
        const res = await authFetch(`/api/atfx/research-report/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || "Delete failed");
        }
        invalidateReportCache(id);
        setReports((prev) => prev.filter((r) => r.id !== id));
        reportsFetchedAtRef.current = Date.now();
        if (activeId === id) {
          clearWorkspace();
        }
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [activeId, authFetch, clearWorkspace, invalidateReportCache, reports]
  );

  const translateReportLocale = useCallback(
    async (locale: ReportTranslateLocale, options?: { force?: boolean }) => {
      const reportId = activeId;
      const englishHtml = reportI18nRef.current.en?.report_html?.trim();
      if (!reportId || !englishHtml) return;

      setTranslatingLocales((prev) => (prev.includes(locale) ? prev : [...prev, locale]));
      setTranslateProgress(`Translating to ${languageTranslatingLabel(locale)}`);

      try {
        const token = await getIdToken();
        if (!token) throw new Error("Not authenticated");

        const data = await streamResearchReportTranslate(token, reportId, locale, {
          onProgress: setTranslateProgress,
          onPartial: (html, partialLocale) => {
            if (partialLocale !== locale) return;
            setReportI18n((prev) => ({
              ...prev,
              [locale]: {
                title: prev[locale]?.title || prev.en?.title || languageTabLabel(locale),
                report_html: html,
              },
            }));
          },
        }, { force: options?.force });
        setReportI18n(data.report_i18n);
        setTranslateToast({
          message: `${languageTranslatingLabel(locale)} translation is ready.`,
          variant: "success",
        });
        if (!data.cached) {
          await hookOptions?.onTokenUsageChanged?.(data.tokenBalance);
          if (!data.tokenBalance) {
            await hookOptions?.onTokenUsageChanged?.();
          }
        }

        const cached = reportCacheRef.current.get(reportId);
        if (cached) {
          reportCacheRef.current.set(reportId, {
            ...cached,
            reportI18n: data.report_i18n,
          });
        }
      } catch (e) {
        const message = (e as Error).message || "Translation failed";
        setTranslateToast({
          message: `${languageTranslatingLabel(locale)} translation failed: ${message}`,
          variant: "error",
        });
      } finally {
        setTranslatingLocales((prev) => prev.filter((l) => l !== locale));
        setTranslateProgress(null);
      }
    },
    [activeId, getIdToken, hookOptions?.onTokenUsageChanged]
  );

  return {
    reports,
    activeId,
    title,
    reportI18n,
    activeLangTab,
    setActiveLangTab,
    messages,
    input,
    setInput,
    inputHtmlPreview,
    setInputHtmlPreview,
    sending,
    loading,
    historyLoading,
    reportLoading,
    creatingNewReport,
    error,
    outputOptions,
    setOutputOptions,
    seoExcerpt,
    thumbnailUrl,
    metaLoading,
    liveStages,
    writingPhase,
    refreshHistoryList,
    resetToFreshCanvas,
    beginFreshTopicsSession,
    syncFreshTopicsSession,
    handleSend,
    handleKill,
    handleNewReport,
    handleSelectReport,
    handleDeleteReport,
    translateReportLocale,
    translatingLocales,
    translateProgress,
    translateToast,
    dismissTranslateToast: () => setTranslateToast(null),
  };
}
