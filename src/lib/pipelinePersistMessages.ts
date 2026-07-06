import { PIPELINE_STAGE_MARKER } from "./pipelineStageConstants";
import type { PipelineStage } from "./atfxResearchReportStream";

export type LiveStageSnapshot = {
  text: string;
  tools: Array<{ name: string; summary: string }>;
};

export type PipelinePersistMessage = {
  id: string;
  role: "tool";
  content: string;
  tool_events: Array<{ name: string; summary: string }>;
  created_at: string;
};

function stageMessage(
  stage: PipelineStage,
  content: string,
  tools: Array<{ name: string; summary: string }>,
  createdAt: string,
  idSuffix: string
): PipelinePersistMessage | null {
  const text = content.trim();
  if (!text && !tools.length) return null;
  return {
    id: `pipeline-${stage}-${idSuffix}`,
    role: "tool",
    content: text,
    tool_events: [{ name: PIPELINE_STAGE_MARKER, summary: stage }, ...tools],
    created_at: createdAt,
  };
}

/** Build pipeline tool messages from live stream state (fallback when server rows missing). */
export function pipelineMessagesFromLiveStages(
  planning: LiveStageSnapshot,
  research: LiveStageSnapshot,
  idSuffix = String(Date.now())
): PipelinePersistMessage[] {
  const createdAt = new Date().toISOString();
  const out: PipelinePersistMessage[] = [];
  const plan = stageMessage("planning", planning.text, [], createdAt, idSuffix);
  const researchMsg = stageMessage("research", research.text, research.tools, createdAt, idSuffix);
  if (plan) out.push(plan);
  if (researchMsg) out.push(researchMsg);
  return out;
}

/** Prefer server-persisted pipeline rows; fill any missing stage from live snapshot. */
export function mergePipelineMessages(
  fromServer: PipelinePersistMessage[],
  fromLive: PipelinePersistMessage[]
): PipelinePersistMessage[] {
  if (!fromServer.length) return fromLive;
  if (!fromLive.length) return fromServer;

  const have = new Set(
    fromServer
      .map((m) => m.tool_events?.find((t) => t.name === PIPELINE_STAGE_MARKER)?.summary)
      .filter(Boolean)
  );
  const merged = [...fromServer];
  for (const live of fromLive) {
    const stage = live.tool_events?.find((t) => t.name === PIPELINE_STAGE_MARKER)?.summary;
    if (stage && !have.has(stage)) merged.push(live);
  }
  return merged;
}
