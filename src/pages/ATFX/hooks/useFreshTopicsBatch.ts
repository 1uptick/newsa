import { useCallback, useRef, useState } from "react";

import type { CapitalKeywordItem } from "../../Capital/types";

import { getRecentTitlesForExcludeBySource } from "../atfxApprovalUtils";

import { parseHttpErrorJsonDetail } from "../../../lib/parseHttpErrorJsonDetail";

import {

  mergeTopicPatch,

  parseFreshTopicsFromMessages,

} from "../../../lib/researchReportTopicSession";

import { topicAudienceFromItem } from "../../../lib/researchReportFromTopic";

import { topicProgressEntriesChanged, type ChatMessage, type TopicPanelProgressEntry } from "../researchReportUtils";



type AuthFetch = (

  input: RequestInfo | URL,

  init?: RequestInit & { forceRefresh?: boolean }

) => Promise<Response>;



export type FreshTopicsPersistence = {

  beginSession: () => Promise<string>;

  syncSession: (reportId: string, payload: { userRequest: string | null; topics: CapitalKeywordItem[] }) => Promise<{

    title: string;

    updated_at: string;

    messages: ChatMessage[];

  }>;

};



export function useFreshTopicsBatch(authFetch: AuthFetch, persistence?: FreshTopicsPersistence) {

  const topicGenRunRef = useRef(0);

  const sessionReportIdRef = useRef<string | null>(null);

  const [generatingFreshTopics, setGeneratingFreshTopics] = useState(false);

  const [freshTopicsModalOpen, setFreshTopicsModalOpen] = useState(false);

  const [freshTopicsRunCount, setFreshTopicsRunCount] = useState<1 | 2 | 3>(1);

  const [freshTopicsAudience, setFreshTopicsAudience] = useState<"institutional" | "retail">(

    "institutional"

  );

  const [generatedTopics, setGeneratedTopics] = useState<CapitalKeywordItem[]>([]);

  const [openTopicId, setOpenTopicId] = useState<string | null>(null);

  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);

  const [topicsNotice, setTopicsNotice] = useState<string | null>(null);

  const [topicGenProgress, setTopicGenProgress] = useState<{

    active: boolean;

    entries: TopicPanelProgressEntry[];

  }>({ active: false, entries: [] });

  const [topicGenBatchHint, setTopicGenBatchHint] = useState<string | null>(null);

  const [topicGenUserRequest, setTopicGenUserRequest] = useState<string | null>(null);

  const [customizeTopicId, setCustomizeTopicId] = useState<string | null>(null);

  const [regeneratingTopicId, setRegeneratingTopicId] = useState<string | null>(null);



  const showTopicsNotice = useCallback((message: string, ms = 6000) => {

    setTopicsNotice(message);

    window.setTimeout(() => setTopicsNotice(null), ms);

  }, []);



  const persistSession = useCallback(

    async (userRequest: string | null, topics: CapitalKeywordItem[]) => {

      if (!persistence) return;

      const reportId = sessionReportIdRef.current;

      if (!reportId) return;

      await persistence.syncSession(reportId, { userRequest, topics });

    },

    [persistence]

  );



  const resetFreshTopicsSession = useCallback(() => {

    topicGenRunRef.current += 1;

    sessionReportIdRef.current = null;

    setGeneratedTopics([]);

    setOpenTopicId(null);

    setActiveTopicId(null);

    setTopicsNotice(null);

    setTopicGenUserRequest(null);

    setTopicGenProgress({ active: false, entries: [] });

    setTopicGenBatchHint(null);

    setGeneratingFreshTopics(false);

    setFreshTopicsModalOpen(false);

    setCustomizeTopicId(null);

    setRegeneratingTopicId(null);

  }, []);



  const hydrateFromMessages = useCallback((messages: ChatMessage[]) => {

    const parsed = parseFreshTopicsFromMessages(messages);

    setGeneratedTopics(parsed.topics);

    setTopicGenUserRequest(parsed.userRequest);

    setOpenTopicId((prev) => {

      if (prev && parsed.topics.some((t) => t.id === prev)) return prev;

      return parsed.topics[0]?.id ?? null;

    });

    setTopicGenProgress({ active: false, entries: [] });

    setTopicGenBatchHint(null);

    setCustomizeTopicId(null);

    setRegeneratingTopicId(null);

  }, []);



  const updateTopic = useCallback(

    async (topicId: string, patch: Partial<CapitalKeywordItem>) => {

      let nextTopics: CapitalKeywordItem[] = [];

      setGeneratedTopics((prev) => {

        nextTopics = prev.map((item) =>

          item.id === topicId ? mergeTopicPatch(item, patch) : item

        );

        return nextTopics;

      });

      try {

        await persistSession(topicGenUserRequest, nextTopics);

      } catch (err) {

        console.error(err);

        showTopicsNotice((err as Error).message || "Failed to save topic changes", 6000);

      }

    },

    [persistSession, showTopicsNotice, topicGenUserRequest]

  );



  const pullTopicPanelProgress = useCallback(

    async (sessionId: string) => {

      const res = await authFetch(

        `/api/capitalkeywords/panel-progress/${encodeURIComponent(sessionId)}`,

        { cache: "no-store" }

      );

      if (!res.ok) return;

      const data = (await res.json()) as {

        active: boolean;

        entries: TopicPanelProgressEntry[];

      };

      if (Array.isArray(data.entries)) {

        setTopicGenProgress((prev) => {

          if (!topicProgressEntriesChanged(prev.entries, data.entries) && prev.active === data.active) {

            return prev;

          }

          return { active: data.active, entries: data.entries };

        });

      }

    },

    [authFetch]

  );



  const runFreshTopicsBatch = useCallback(

    async (count: 1 | 2 | 3, audience: "institutional" | "retail") => {

      const runId = topicGenRunRef.current;

      setFreshTopicsModalOpen(false);

      setGeneratingFreshTopics(true);

      setTopicsNotice(null);

      setTopicGenProgress({ active: true, entries: [] });

      const audienceLabel = audience === "institutional" ? "Institutional" : "Retail";

      setTopicGenBatchHint(

        count === 1

          ? `${audienceLabel} · 1 topic`

          : `${audienceLabel} · ${count} topics (sequential runs)`

      );

      const userRequest =

        count === 1

          ? `Generate fresh topics · ${audienceLabel} · 1 topic`

          : `Generate fresh topics · ${audienceLabel} · ${count} topics`;

      setTopicGenUserRequest(userRequest);



      if (persistence) {
        try {
          const reportId = await persistence.beginSession();
          if (runId !== topicGenRunRef.current) return;
          sessionReportIdRef.current = reportId;
          await persistence.syncSession(reportId, { userRequest, topics: [] });
        } catch (err) {
          if (runId !== topicGenRunRef.current) return;
          console.error(err);
          const message = (err as Error).message || "Failed to save topics to history";
          if (/api route not found/i.test(message)) {
            showTopicsNotice(
              "Topic generation will continue, but history save needs a Functions deploy.",
              10_000
            );
          } else {
            showTopicsNotice(message, 6000);
          }
        }
      }



      const sessionId = crypto.randomUUID();

      const pollTimer = window.setInterval(() => {

        void pullTopicPanelProgress(sessionId);

      }, 700);



      const batchTitles: string[] = [];

      let batchTopics: CapitalKeywordItem[] = [];

      try {

        const listRes = await authFetch("/api/capitalkeywords?company=atfx", { forceRefresh: true });

        const existingItems: CapitalKeywordItem[] = listRes.ok

          ? ((await listRes.json()) as CapitalKeywordItem[])

          : [];

        const recentBaseline = getRecentTitlesForExcludeBySource(

          existingItems,

          audience === "institutional" ? "institutional" : "retail"

        );



        for (let i = 0; i < count; i++) {

          if (runId !== topicGenRunRef.current) return;

          const excludeRecentTitles = [...new Set([...recentBaseline, ...batchTitles])];

          const requestyTopicModel =

            i === 1

              ? "google/gemini-2.5-flash"

              : i === 2

                ? "openai/gpt-4.1-mini"

                : undefined;

          const body =

            audience === "institutional"

              ? {

                  company: "atfx" as const,

                  audience: "institutional" as const,

                  autoInstitutionalTopic: true,

                  excludeRecentTitles,

                  batchIndex: i,

                  batchTotal: count,

                  panelProgressSessionId: sessionId,

                  ...(requestyTopicModel ? { requestyTopicModel } : {}),

                }

              : {

                  company: "atfx" as const,

                  audience: "retail" as const,

                  autoRetailTopic: true,

                  excludeRecentTitles,

                  batchIndex: i,

                  batchTotal: count,

                  panelProgressSessionId: sessionId,

                  ...(requestyTopicModel ? { requestyTopicModel } : {}),

                };

          const res = await authFetch("/api/capitalkeywords/generate", {

            method: "POST",

            headers: { "Content-Type": "application/json" },

            body: JSON.stringify(body),

          });

          const bodyText = await res.text();

          await pullTopicPanelProgress(sessionId);

          if (!res.ok) {

            const detail = parseHttpErrorJsonDetail(res.status, bodyText);

            const friendlyDetail = /direction|live market/i.test(detail)

              ? "Couldn't finalize this topic after several tries."

              : detail;

            const skipAndContinue = res.status === 409 || res.status === 422;

            const hint = skipAndContinue

              ? `${friendlyDetail} Topic ${i + 1} of ${count} skipped${i + 1 < count ? " — continuing batch." : "."}`

              : `${detail} (topic ${i + 1} of ${count})`;

            showTopicsNotice(hint, skipAndContinue ? 10_000 : 8000);

            continue;

          }

          const newItem = JSON.parse(bodyText) as CapitalKeywordItem;

          if (runId !== topicGenRunRef.current) return;

          const nt = (newItem.title ?? "").trim();

          if (nt) batchTitles.push(nt);

          batchTopics = [newItem, ...batchTopics];

          setGeneratedTopics(batchTopics);

          setOpenTopicId(newItem.id);

          try {

            await persistSession(userRequest, batchTopics);

          } catch (err) {

            console.error(err);

            showTopicsNotice((err as Error).message || "Failed to save topics to history", 6000);

          }

        }

      } catch (err) {

        if (runId !== topicGenRunRef.current) return;

        console.error(err);

        showTopicsNotice((err as Error).message || "Failed to generate topic(s)", 6000);

      } finally {

        window.clearInterval(pollTimer);

        if (runId === topicGenRunRef.current) {

          await pullTopicPanelProgress(sessionId);

          setGeneratingFreshTopics(false);

          setTopicGenProgress((prev) => ({ ...prev, active: false }));

        }

      }

    },

    [authFetch, persistence, persistSession, pullTopicPanelProgress, showTopicsNotice]

  );



  const regenerateTopic = useCallback(

    async (topicId: string) => {

      const replaceIndex = generatedTopics.findIndex((t) => t.id === topicId);

      if (replaceIndex < 0) return;



      const runId = topicGenRunRef.current;

      const audience = topicAudienceFromItem(generatedTopics[replaceIndex]) ?? freshTopicsAudience;

      const audienceLabel = audience === "institutional" ? "Institutional" : "Retail";



      setRegeneratingTopicId(topicId);

      setGeneratingFreshTopics(true);

      setTopicsNotice(null);

      setTopicGenProgress({ active: true, entries: [] });

      setTopicGenBatchHint(`${audienceLabel} · another topic`);

      setCustomizeTopicId(null);



      const sessionId = crypto.randomUUID();

      const pollTimer = window.setInterval(() => {

        void pullTopicPanelProgress(sessionId);

      }, 700);



      try {

        const listRes = await authFetch("/api/capitalkeywords?company=atfx", { forceRefresh: true });

        const existingItems: CapitalKeywordItem[] = listRes.ok

          ? ((await listRes.json()) as CapitalKeywordItem[])

          : [];

        const recentBaseline = getRecentTitlesForExcludeBySource(

          existingItems,

          audience === "institutional" ? "institutional" : "retail"

        );

        const excludeRecentTitles = [

          ...new Set([

            ...recentBaseline,

            ...generatedTopics.map((t) => (t.title ?? "").trim()).filter(Boolean),

          ]),

        ];



        const body =

          audience === "institutional"

            ? {

                company: "atfx" as const,

                audience: "institutional" as const,

                autoInstitutionalTopic: true,

                excludeRecentTitles,

                batchIndex: 0,

                batchTotal: 1,

                panelProgressSessionId: sessionId,

              }

            : {

                company: "atfx" as const,

                audience: "retail" as const,

                autoRetailTopic: true,

                excludeRecentTitles,

                batchIndex: 0,

                batchTotal: 1,

                panelProgressSessionId: sessionId,

              };



        const res = await authFetch("/api/capitalkeywords/generate", {

          method: "POST",

          headers: { "Content-Type": "application/json" },

          body: JSON.stringify(body),

        });

        const bodyText = await res.text();

        await pullTopicPanelProgress(sessionId);



        if (!res.ok) {

          if (runId !== topicGenRunRef.current) return;

          const detail = parseHttpErrorJsonDetail(res.status, bodyText);

          const friendlyDetail = /direction|live market/i.test(detail)

            ? "Couldn't finalize a replacement topic after several tries."

            : detail;

          showTopicsNotice(friendlyDetail, 8000);

          return;

        }



        const newItem = JSON.parse(bodyText) as CapitalKeywordItem;

        if (runId !== topicGenRunRef.current) return;



        let nextTopics: CapitalKeywordItem[] = [];

        setGeneratedTopics((prev) => {

          const idx = prev.findIndex((t) => t.id === topicId);

          if (idx < 0) {

            nextTopics = [newItem, ...prev];

            return nextTopics;

          }

          nextTopics = [...prev];

          nextTopics[idx] = newItem;

          return nextTopics;

        });



        setOpenTopicId(newItem.id);



        try {

          await persistSession(topicGenUserRequest, nextTopics);

        } catch (err) {

          console.error(err);

          showTopicsNotice((err as Error).message || "Failed to save topics to history", 6000);

        }

      } catch (err) {

        if (runId !== topicGenRunRef.current) return;

        console.error(err);

        showTopicsNotice((err as Error).message || "Failed to generate another topic", 6000);

      } finally {

        window.clearInterval(pollTimer);

        if (runId === topicGenRunRef.current) {

          await pullTopicPanelProgress(sessionId);

          setGeneratingFreshTopics(false);

          setRegeneratingTopicId(null);

          setTopicGenProgress((prev) => ({ ...prev, active: false }));

        }

      }

    },

    [

      authFetch,

      freshTopicsAudience,

      generatedTopics,

      persistSession,

      pullTopicPanelProgress,

      showTopicsNotice,

      topicGenUserRequest,

    ]

  );



  const customizeTopic =

    customizeTopicId != null

      ? generatedTopics.find((item) => item.id === customizeTopicId) ?? null

      : null;



  return {

    generatingFreshTopics,

    freshTopicsModalOpen,

    setFreshTopicsModalOpen,

    freshTopicsRunCount,

    setFreshTopicsRunCount,

    freshTopicsAudience,

    setFreshTopicsAudience,

    generatedTopics,

    openTopicId,

    setOpenTopicId,

    activeTopicId,

    setActiveTopicId,

    topicsNotice,

    topicGenProgress,

    topicGenBatchHint,

    topicGenUserRequest,

    customizeTopicId,

    setCustomizeTopicId,

    customizeTopic,

    updateTopic,

    resetFreshTopicsSession,

    hydrateFromMessages,

    runFreshTopicsBatch,

    regenerateTopic,

    regeneratingTopicId,

    sessionReportIdRef,

  };

}


