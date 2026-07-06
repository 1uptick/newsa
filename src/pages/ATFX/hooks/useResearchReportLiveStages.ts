import { useCallback, useRef, useState } from "react";
import type { LiveStageSnapshot } from "../../../lib/pipelinePersistMessages";

export type LiveStageState = {
  text: string;
  complete: boolean;
  tools: Array<{ name: string; summary: string; detail?: string }>;
  loading: boolean;
  loadingLabel?: string;
};

export type LivePipelineStage = "planning" | "research";

function emptyLiveStage(): LiveStageState {
  return { text: "", complete: false, tools: [], loading: false };
}

export function useResearchReportLiveStages() {
  const [liveStages, setLiveStages] = useState<Record<LivePipelineStage, LiveStageState>>({
    planning: emptyLiveStage(),
    research: emptyLiveStage(),
  });
  const [writingPhase, setWritingPhase] = useState<string | null>(null);
  const liveStagesRef = useRef<{ planning: LiveStageSnapshot; research: LiveStageSnapshot }>({
    planning: { text: "", tools: [] },
    research: { text: "", tools: [] },
  });

  const patchLiveStage = useCallback(
    (
      stage: LivePipelineStage,
      patch: Partial<LiveStageState> | ((prev: LiveStageState) => Partial<LiveStageState>)
    ) => {
      setLiveStages((prev) => {
        const current = prev[stage];
        const nextPatch = typeof patch === "function" ? patch(current) : patch;
        const next = { ...current, ...nextPatch };
        liveStagesRef.current = {
          planning:
            stage === "planning"
              ? { text: next.text, tools: next.tools }
              : { text: prev.planning.text, tools: prev.planning.tools },
          research:
            stage === "research"
              ? { text: next.text, tools: next.tools }
              : { text: prev.research.text, tools: prev.research.tools },
        };
        return { ...prev, [stage]: next };
      });
    },
    []
  );

  const resetLiveStages = useCallback(() => {
    setLiveStages({ planning: emptyLiveStage(), research: emptyLiveStage() });
    liveStagesRef.current = {
      planning: { text: "", tools: [] },
      research: { text: "", tools: [] },
    };
    setWritingPhase(null);
  }, []);

  return {
    liveStages,
    writingPhase,
    setWritingPhase,
    liveStagesRef,
    patchLiveStage,
    resetLiveStages,
  };
}
