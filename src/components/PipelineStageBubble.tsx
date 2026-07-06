import React, { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useTypingText } from "../hooks/useTypingText";
import type { PipelineStage } from "../lib/atfxResearchReportStream";
import { formatPipelineStageHtml, planningBubbleText, researchBubbleText } from "../lib/pipelineBubbleFormat";
import { PIPELINE_STAGE_MARKER } from "../lib/pipelineStageConstants";
import { researchToolEventLabel } from "../lib/atfxResearchToolLabels";

const STAGE_TITLES: Record<PipelineStage, string> = {
  planning: "Planning",
  research: "Research",
  writing: "Writing",
  translating: "Translating",
};

const BUBBLE_PROSE = [
  "pipeline-bubble prose prose-slate prose-sm max-w-none",
  "prose-headings:text-slate-800 prose-headings:font-semibold prose-headings:mb-1",
  "prose-p:text-slate-700 prose-p:my-1.5 prose-p:leading-relaxed",
  "prose-li:text-slate-700 prose-ul:my-1.5 prose-ul:list-disc prose-ul:pl-5 prose-ol:my-1.5 prose-ol:list-decimal prose-ol:pl-5",
  "prose-strong:text-slate-800",
  "prose-a:text-[#ff7900] prose-a:no-underline hover:prose-a:underline",
  "prose-pre:text-[11px] prose-pre:bg-white prose-pre:border prose-pre:border-slate-200 prose-pre:rounded-lg",
  "prose-code:text-[11px] prose-code:bg-white prose-code:px-1 prose-code:rounded",
  "[&_img]:block [&_img]:mx-auto [&_img]:max-w-full [&_img]:h-auto [&_img]:my-3 [&_img]:rounded-lg",
  "[&_figure]:mx-auto [&_figure]:text-center",
].join(" ");

type PipelineStageBubbleProps = {
  stage: PipelineStage;
  text: string;
  tools?: Array<{ name: string; summary: string; detail?: string }>;
  loading?: boolean;
  loadingLabel?: string;
  /** When true, reveal text with a typing animation (live pipeline output). */
  animate?: boolean;
};

function PipelineStageBubbleInner({
  stage,
  text,
  tools = [],
  loading = false,
  loadingLabel,
  animate = false,
}: PipelineStageBubbleProps) {
  const displayText =
    stage === "planning"
      ? planningBubbleText(text)
      : stage === "research"
        ? researchBubbleText(text)
        : text;
  const typedText = useTypingText(displayText, animate);
  const hasText = displayText.trim().length > 0;
  const hasTools = tools.length > 0;

  const renderedHtml = useMemo(() => {
    if (!typedText.trim()) return "";
    const structured = formatPipelineStageHtml(typedText, stage);
    if (structured) return structured;
    return "";
  }, [typedText, stage]);

  if (!hasText && !hasTools && !loading) return null;

  return (
    <div className="flex justify-start w-full">
      <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-slate-100 px-4 py-2.5 text-sm text-slate-800">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#ff7900] mb-2">
          {STAGE_TITLES[stage]}
        </p>
        {loading ? (
          <p className="text-xs text-slate-500 mb-2 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            {loadingLabel ?? `${STAGE_TITLES[stage]}…`}
          </p>
        ) : null}
        {hasTools ? (
          <div className="mb-2 flex flex-wrap gap-1">
            {tools.map((t, i) => (
              <span
                key={`${t.name}-${t.detail ?? ""}-${i}`}
                className="text-[10px] px-1.5 py-0.5 rounded bg-[#ff7900] text-white font-medium"
              >
                {researchToolEventLabel(t)}
                {t.summary !== "…" ? " ✓" : " …"}
              </span>
            ))}
          </div>
        ) : null}
        {hasText ? (
          renderedHtml ? (
            <div className={BUBBLE_PROSE} dangerouslySetInnerHTML={{ __html: renderedHtml }} />
          ) : (
            <pre className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700 font-sans">
              {typedText}
            </pre>
          )
        ) : null}
      </div>
    </div>
  );
}

export const PipelineStageBubble = React.memo(PipelineStageBubbleInner);

export function pipelineStageFromMessage(
  m: { role: string; tool_events?: Array<{ name: string; summary: string }> | null }
): PipelineStage | null {
  if (m.role !== "tool" || !m.tool_events?.length) return null;
  const marker = m.tool_events.find((t) => t.name === PIPELINE_STAGE_MARKER);
  if (!marker) return null;
  const stage = marker.summary as PipelineStage;
  if (stage === "planning" || stage === "research" || stage === "writing" || stage === "translating") {
    return stage;
  }
  return null;
}

export function researchToolsFromMessage(
  m: { tool_events?: Array<{ name: string; summary: string; detail?: string }> | null }
): Array<{ name: string; summary: string; detail?: string }> {
  return (m.tool_events ?? []).filter((t) => t.name !== PIPELINE_STAGE_MARKER);
}
