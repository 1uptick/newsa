import React from "react";
import { researchToolEventLabel } from "../../../lib/atfxResearchToolLabels";
import type { ChatMessage } from "../researchReportUtils";

function ChatMessageBubbleInner({ message }: { message: ChatMessage }) {
  return (
    <div className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          message.role === "user"
            ? "bg-[#ff7900] text-white rounded-br-md"
            : "bg-slate-100 text-slate-800 rounded-bl-md"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.role === "assistant" && message.tool_events && message.tool_events.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {message.tool_events.map((t, i) => (
              <span
                key={`${t.name}-${t.detail ?? ""}-${i}`}
                className="text-[10px] px-1.5 py-0.5 rounded bg-[#ff7900] text-white font-medium"
              >
                {researchToolEventLabel(t)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export const ChatMessageBubble = React.memo(ChatMessageBubbleInner);
