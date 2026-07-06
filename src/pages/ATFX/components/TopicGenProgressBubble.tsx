import React, { useMemo } from "react";
import { Loader2 } from "lucide-react";
import {
  friendlyTopicGenMessage,
  type TopicPanelProgressEntry,
} from "../researchReportUtils";

function TopicGenProgressBubbleInner({
  entries,
  loading,
  batchHint,
}: {
  entries: TopicPanelProgressEntry[];
  loading: boolean;
  batchHint?: string;
}) {
  const chronological = useMemo(() => {
    const rev = [...entries].reverse();
    return rev.filter((entry, i) => i === 0 || entry.message !== rev[i - 1].message);
  }, [entries]);

  return (
    <div className="flex justify-start w-full">
      <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-slate-100 px-4 py-2.5 text-sm text-slate-800">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#ff7900] mb-2">
          Fresh topics
        </p>
        {batchHint ? <p className="text-xs text-slate-500 mb-2">{batchHint}</p> : null}
        {loading && entries.length === 0 ? (
          <p className="text-xs text-slate-500 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            Preparing research pass…
          </p>
        ) : null}
        {chronological.length > 0 ? (
          <ul className="space-y-1.5">
            {chronological.map((entry, index) => {
              const isLatest = loading && index === chronological.length - 1;
              const label = friendlyTopicGenMessage(entry.message);
              return (
                <li
                  key={entry.id}
                  className={`text-xs leading-relaxed ${isLatest ? "text-slate-800" : "text-slate-600"}`}
                >
                  {isLatest ? (
                    <span className="inline-flex items-start gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin shrink-0 mt-0.5" />
                      {label}
                    </span>
                  ) : (
                    label
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export const TopicGenProgressBubble = React.memo(TopicGenProgressBubbleInner);
