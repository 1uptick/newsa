import React, { useMemo } from "react";
import { BarChart3, ChevronDown, Loader2, Newspaper, Plus, Sparkles } from "lucide-react";
import {
  PipelineStageBubble,
  pipelineStageFromMessage,
  researchToolsFromMessage,
} from "../../../components/PipelineStageBubble";
import { ResearchReportSettingsPanel } from "../../../components/ResearchReportSettingsPanel";
import { ReportSectionPicker } from "../../../components/ReportSectionPicker";
import { ResearchReportChatInput } from "../../../components/ResearchReportChatInput";
import { AtfxQuickAnalysisPickerSheet } from "../../../components/AtfxQuickAnalysisPickerSheet";
import type { AtfxQuickAnalysisResult } from "../../../lib/atfxQuickAnalysisService";
import { FreshTopicsPickerSheet } from "./FreshTopicsPickerSheet";
import { FRESH_TOPICS_BATCH_EVENT, isFreshTopicsUserMessage } from "../../../lib/researchReportTopicSession";
import type { ReportOutputOptions } from "../../../lib/atfxResearchReportOptions";
import type { CapitalKeywordItem } from "../../Capital/types";
import type { LiveStageState } from "../hooks/useResearchReportLiveStages";
import { useChatPanelAutoScroll } from "../hooks/useChatPanelAutoScroll";
import type { ChatMessage, TopicPanelProgressEntry } from "../researchReportUtils";
import { ChatMessageBubble } from "./ChatMessageBubble";
import { TopicAccordionItem } from "./TopicAccordionItem";
import { TopicGenProgressBubble } from "./TopicGenProgressBubble";

type ResearchReportChatPanelProps = {
  settingsOpen: boolean;
  settingsLine: string;
  onToggleSettings: () => void;
  outputOptions: ReportOutputOptions;
  onOutputOptionsChange: (options: ReportOutputOptions) => void;
  sending: boolean;
  creatingNewReport?: boolean;
  onNewReport: () => void;
  topicGenUserRequest: string | null;
  topicsNotice: string | null;
  generatingFreshTopics: boolean;
  topicGenProgress: { active: boolean; entries: TopicPanelProgressEntry[] };
  topicGenBatchHint: string | null;
  generatedTopics: CapitalKeywordItem[];
  openTopicId: string | null;
  onToggleTopic: (id: string) => void;
  onStartArticleFromTopic: (item: CapitalKeywordItem) => void;
  onCustomizeTopic: (id: string) => void;
  onRegenerateTopic: (id: string) => void;
  regeneratingTopicId: string | null;
  activeTopicId: string | null;
  messages: ChatMessage[];
  liveStages: { planning: LiveStageState; research: LiveStageState };
  writingPhase: string | null;
  error: string | null;
  sectionTitles: string[];
  onApplySectionPrompt: (prompt: string) => void;
  input: string;
  inputHtmlPreview: string | null;
  onInputChange: (value: string) => void;
  onClearHtmlPreview: () => void;
  onSend: () => void;
  onKill: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  activeHtml: string;
  onOpenFreshTopicsModal: () => void;
  freshTopicsSheetOpen: boolean;
  onCloseFreshTopicsSheet: () => void;
  onRunFreshTopicsBatch: () => void;
  freshTopicsRunCount: 1 | 2 | 3;
  onFreshTopicsRunCountChange: (count: 1 | 2 | 3) => void;
  freshTopicsAudience: "institutional" | "retail";
  onFreshTopicsAudienceChange: (audience: "institutional" | "retail") => void;
  onOpenTrending: () => void;
  onOpenQuickAnalysis: () => void;
  newsDrawerOpen: boolean;
  quickAnalysisSheetOpen: boolean;
  onCloseQuickAnalysisSheet: () => void;
  onSelectQuickAnalysis: (item: AtfxQuickAnalysisResult) => void;
  pageEssentialsReady?: boolean;
};

function ResearchReportChatPanelInner(props: ResearchReportChatPanelProps) {
  const {
    settingsOpen,
    settingsLine,
    onToggleSettings,
    outputOptions,
    onOutputOptionsChange,
    sending,
    creatingNewReport = false,
    onNewReport,
    topicGenUserRequest,
    topicsNotice,
    generatingFreshTopics,
    topicGenProgress,
    topicGenBatchHint,
    generatedTopics,
    openTopicId,
    onToggleTopic,
    onStartArticleFromTopic,
    onCustomizeTopic,
    onRegenerateTopic,
    regeneratingTopicId,
    activeTopicId,
    messages,
    liveStages,
    writingPhase,
    error,
    sectionTitles,
    onApplySectionPrompt,
    input,
    inputHtmlPreview,
    onInputChange,
    onClearHtmlPreview,
    onSend,
    onKill,
    inputRef,
    activeHtml,
    onOpenFreshTopicsModal,
    freshTopicsSheetOpen,
    onCloseFreshTopicsSheet,
    onRunFreshTopicsBatch,
    freshTopicsRunCount,
    onFreshTopicsRunCountChange,
    freshTopicsAudience,
    onFreshTopicsAudienceChange,
    onOpenTrending,
    onOpenQuickAnalysis,
    newsDrawerOpen,
    quickAnalysisSheetOpen,
    onCloseQuickAnalysisSheet,
    onSelectQuickAnalysis,
    pageEssentialsReady = true,
  } = props;

  const showEmptyIntro =
    !generatingFreshTopics &&
    generatedTopics.length === 0 &&
    !topicGenUserRequest &&
    topicGenProgress.entries.length === 0;

  const lastMessage = messages[messages.length - 1];
  const topicProgressTail = topicGenProgress.entries[topicGenProgress.entries.length - 1]?.message ?? "";

  const visibleMessages = useMemo(
    () =>
      messages.filter((m) => {
        if (m.role !== "tool" || !Array.isArray(m.tool_events)) return true;
        return !m.tool_events.some(
          (event) =>
            event &&
            typeof event === "object" &&
            "name" in event &&
            (event as { name?: string }).name === FRESH_TOPICS_BATCH_EVENT
        );
      }),
    [messages]
  );

  const freshTopicsRequestMessages = useMemo(
    () =>
      visibleMessages.filter((m) => m.role === "user" && isFreshTopicsUserMessage(m.content)),
    [visibleMessages]
  );

  const chatMessages = useMemo(
    () =>
      visibleMessages.filter(
        (m) => !(m.role === "user" && isFreshTopicsUserMessage(m.content))
      ),
    [visibleMessages]
  );

  const showTopicGenRequestBubble =
    Boolean(topicGenUserRequest) &&
    !messages.some(
      (m) => m.role === "user" && m.content.trim() === topicGenUserRequest?.trim()
    );

  const scrollKey = useMemo(
    () =>
      [
        messages.length,
        lastMessage?.id,
        lastMessage?.content?.length,
        sending,
        writingPhase,
        liveStages.planning.text.length,
        liveStages.planning.loading,
        liveStages.planning.complete,
        liveStages.research.text.length,
        liveStages.research.loading,
        liveStages.research.tools.length,
        generatingFreshTopics,
        topicGenProgress.entries.length,
        topicProgressTail,
        topicGenUserRequest,
        generatedTopics.length,
        openTopicId,
        topicsNotice,
        error,
      ].join("|"),
    [
      messages.length,
      lastMessage?.id,
      lastMessage?.content,
      sending,
      writingPhase,
      liveStages.planning.text,
      liveStages.planning.loading,
      liveStages.planning.complete,
      liveStages.research.text,
      liveStages.research.loading,
      liveStages.research.tools.length,
      generatingFreshTopics,
      topicGenProgress.entries.length,
      topicProgressTail,
      topicGenUserRequest,
      generatedTopics.length,
      openTopicId,
      topicsNotice,
      error,
    ]
  );

  const { scrollRef: chatScrollRef, contentRef: chatContentRef } = useChatPanelAutoScroll(scrollKey);

  return (
    <aside className="relative flex flex-col min-h-0 lg:w-[40%] shrink-0 border-r border-slate-200 bg-white">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 shrink-0 z-30 bg-white">
        <Sparkles className="w-5 h-5 text-[#ff7900] shrink-0" />
        <h1 className="text-base font-bold text-slate-900 truncate flex-1">Research Article</h1>
        <button
          type="button"
          onClick={onNewReport}
          disabled={sending || creatingNewReport}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 min-w-[4.25rem] justify-center"
        >
          {creatingNewReport ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
          {creatingNewReport ? "Creating…" : "New"}
        </button>
      </header>

      <div className="shrink-0 border-b border-[#e66d00] bg-[#ff7900] z-40 relative">
        <button
          type="button"
          onClick={onToggleSettings}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-left bg-[#ff7900] hover:bg-[#e66d00] transition-colors group"
          aria-expanded={settingsOpen}
          aria-controls="report-settings-panel"
        >
          <span className="text-xs font-bold text-white shrink-0 transition-colors">
            Article Settings
          </span>
          <span className="text-[11px] text-white/90 truncate flex-1 min-w-0">{settingsLine}</span>
          <ChevronDown
            className={`w-4 h-4 text-white/80 shrink-0 transition-transform duration-300 ${
              settingsOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      <div className="relative flex flex-col flex-1 min-h-0 overflow-hidden">
        <div
          id="report-settings-panel"
          className={`absolute inset-0 z-20 flex flex-col bg-orange-100 shadow-[0_8px_30px_rgba(255,121,0,0.12)] transition-transform duration-300 ease-out ${
            settingsOpen
              ? "translate-y-0 pointer-events-auto"
              : "-translate-y-full pointer-events-none"
          }`}
          aria-hidden={!settingsOpen}
        >
          <div className="flex-1 min-h-0 overflow-y-auto">
            <ResearchReportSettingsPanel
              options={outputOptions}
              onChange={onOutputOptionsChange}
              disabled={sending}
            />
          </div>
        </div>

        <div ref={chatScrollRef} className="flex-1 min-h-0 overflow-y-auto">
          <div ref={chatContentRef} className="flex flex-col gap-4 px-4 py-4">
          {showTopicGenRequestBubble ? (
            <div className="flex justify-end w-full">
              <div className="max-w-[90%] rounded-2xl rounded-br-md bg-[#ff7900] text-white px-4 py-2.5 text-sm leading-relaxed">
                {topicGenUserRequest}
              </div>
            </div>
          ) : null}

          {freshTopicsRequestMessages.map((m) => (
            <ChatMessageBubble key={m.id} message={m} />
          ))}

          {topicsNotice ? (
            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 shrink-0">
              {topicsNotice}
            </p>
          ) : null}

          {generatingFreshTopics || topicGenProgress.entries.length > 0 ? (
            <TopicGenProgressBubble
              entries={topicGenProgress.entries}
              loading={generatingFreshTopics}
              batchHint={topicGenBatchHint ?? undefined}
            />
          ) : null}

          {generatedTopics.length > 0 ? (
            <div className="space-y-2 pt-1 shrink-0">
              {generatedTopics.map((item) => (
                <TopicAccordionItem
                  key={item.id}
                  item={item}
                  isOpen={openTopicId === item.id}
                  onToggle={() => onToggleTopic(item.id)}
                  onStartReport={() => onStartArticleFromTopic(item)}
                  onCustomize={() => onCustomizeTopic(item.id)}
                  onRegenerate={() => onRegenerateTopic(item.id)}
                  disabled={sending || generatingFreshTopics}
                  regenerating={regeneratingTopicId === item.id}
                  active={activeTopicId === item.id}
                />
              ))}
            </div>
          ) : null}

          {messages.length === 0 && !sending ? (
            <div className="flex flex-col w-full min-h-0">
              {showEmptyIntro ? (
                <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/80 to-orange-50/50 px-4 py-4 shadow-sm">
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Describe the article you need, or pick a quick start below. Every run follows Plan → Research → Write. Tap{" "}
                    <button
                      type="button"
                      onClick={onToggleSettings}
                      className="font-semibold text-[#ff7900] hover:underline"
                    >
                      Article Settings
                    </button>{" "}
                    to choose style, pace, outlook, and languages.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {chatMessages.map((m) => {
            const pipelineStage = pipelineStageFromMessage(m);
            if (pipelineStage) {
              return (
                <PipelineStageBubble
                  key={m.id}
                  stage={pipelineStage}
                  text={m.content}
                  tools={pipelineStage === "research" ? researchToolsFromMessage(m) : []}
                />
              );
            }
            return <ChatMessageBubble key={m.id} message={m} />;
          })}

          {sending ? (
            <>
              {(liveStages.planning.loading ||
                liveStages.planning.text ||
                liveStages.planning.complete) && (
                <PipelineStageBubble
                  stage="planning"
                  text={liveStages.planning.text}
                  loading={liveStages.planning.loading}
                  loadingLabel={liveStages.planning.loadingLabel}
                  animate
                />
              )}
              {(liveStages.research.loading ||
                liveStages.research.text ||
                liveStages.research.tools.length > 0 ||
                liveStages.research.complete) && (
                <PipelineStageBubble
                  stage="research"
                  text={liveStages.research.text}
                  tools={liveStages.research.tools}
                  loading={liveStages.research.loading}
                  loadingLabel={liveStages.research.loadingLabel}
                />
              )}
              {writingPhase ? (
                <div className="flex justify-start w-full">
                  <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-slate-100 px-4 py-2.5 text-sm text-slate-500 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    {writingPhase}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
          </div>
        </div>

        {error ? (
          <p className="px-4 py-2 text-sm text-red-600 border-t border-red-100 bg-red-50 shrink-0">
            {error}
          </p>
        ) : null}

        <div className="shrink-0 border-t border-slate-200 bg-gradient-to-b from-slate-50/40 to-white p-3">
          {showEmptyIntro && messages.length === 0 && !sending ? (
            <div className="mb-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Quick start
              </p>
              <div className="grid grid-cols-2 min-[520px]:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={onOpenFreshTopicsModal}
                  disabled={sending}
                  aria-expanded={freshTopicsSheetOpen}
                  aria-controls="fresh-topics-picker-sheet"
                  title="Runs fresh research and generates SEO topic ideas"
                  className={`group relative flex min-h-[4.25rem] items-center gap-2.5 overflow-hidden rounded-xl p-3 text-left shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-50 disabled:hover:translate-y-0 ${
                    freshTopicsSheetOpen
                      ? "bg-gradient-to-br from-[#e66d00] to-[#cc6200] text-white shadow-orange-300/50 ring-2 ring-white/30"
                      : "bg-gradient-to-br from-[#ff7900] to-[#e66d00] text-white shadow-orange-200/40 hover:shadow-orange-300/45"
                  }`}
                >
                  <span className="absolute -right-3 -top-3 h-16 w-16 rounded-full bg-white/10 blur-0 transition-transform group-hover:scale-110" aria-hidden />
                  <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/20 ring-1 ring-white/25">
                    <Sparkles className="h-4 w-4 shrink-0" />
                  </span>
                  <span className="relative min-w-0 flex-1">
                    <span className="block text-xs font-bold leading-tight">Fresh topics</span>
                    <span className="mt-0.5 block text-[10px] leading-snug text-white/85">
                      Auto plan + multi-run research
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onOpenTrending}
                  disabled={sending}
                  aria-expanded={newsDrawerOpen}
                  aria-controls="atfx-news-drawer"
                  className={`group flex min-h-[4.25rem] items-center gap-2.5 rounded-xl border bg-white p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0 ${
                    newsDrawerOpen
                      ? "border-[#ff7900] bg-orange-50/40 ring-2 ring-[#ff7900]/25"
                      : "border-slate-200 hover:border-[#ff7900]/35 hover:bg-orange-50/25"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      newsDrawerOpen ? "bg-[#ff7900] text-white" : "bg-orange-100 text-[#ff7900] group-hover:bg-orange-200/70"
                    }`}
                  >
                    <Newspaper className="h-4 w-4 shrink-0" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold leading-tight text-slate-900">Trending</span>
                    <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">
                      Headline → planned report flow
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={onOpenQuickAnalysis}
                  disabled={sending}
                  aria-expanded={quickAnalysisSheetOpen}
                  aria-controls="atfx-qa-picker-sheet"
                  className={`group col-span-2 min-[520px]:col-span-1 flex min-h-[4.25rem] items-center gap-2.5 rounded-xl border bg-white p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50 disabled:hover:translate-y-0 ${
                    quickAnalysisSheetOpen
                      ? "border-[#ff7900] bg-orange-50/40 ring-2 ring-[#ff7900]/25"
                      : "border-slate-200 hover:border-[#ff7900]/35 hover:bg-orange-50/25"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      quickAnalysisSheetOpen
                        ? "bg-[#ff7900] text-white"
                        : "bg-orange-100 text-[#ff7900] group-hover:bg-orange-200/70"
                    }`}
                  >
                    <BarChart3 className="h-4 w-4 shrink-0" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold leading-tight text-slate-900">Quick Analysis</span>
                    <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">
                      Snapshot → full Plan/Research/Write
                    </span>
                  </span>
                </button>
              </div>
            </div>
          ) : null}
          {sectionTitles.length > 0 ? (
            <ReportSectionPicker
              sections={sectionTitles}
              disabled={sending}
              onApplyPrompt={onApplySectionPrompt}
            />
          ) : null}
          <ResearchReportChatInput
            value={input}
            htmlPreview={inputHtmlPreview}
            onChange={onInputChange}
            onClearHtmlPreview={onClearHtmlPreview}
            onSend={onSend}
            onKill={onKill}
            busy={sending}
            disabled={sending}
            placeholder={
              activeHtml
                ? "Modify this article — describe your edits. For a new topic, open History and start a new report."
                : "Describe the report you need… (the agent will Plan → Research → Write)"
            }
            inputRef={inputRef}
          />
        </div>

        <FreshTopicsPickerSheet
          open={freshTopicsSheetOpen}
          onClose={onCloseFreshTopicsSheet}
          onGenerate={onRunFreshTopicsBatch}
          runCount={freshTopicsRunCount}
          onRunCountChange={onFreshTopicsRunCountChange}
          audience={freshTopicsAudience}
          onAudienceChange={onFreshTopicsAudienceChange}
          generating={generatingFreshTopics}
        />

        <AtfxQuickAnalysisPickerSheet
          open={quickAnalysisSheetOpen}
          onClose={onCloseQuickAnalysisSheet}
          onSelect={onSelectQuickAnalysis}
          selectDisabled={sending}
          pageEssentialsReady={pageEssentialsReady}
        />
      </div>
    </aside>
  );
}

export const ResearchReportChatPanel = React.memo(ResearchReportChatPanelInner);
