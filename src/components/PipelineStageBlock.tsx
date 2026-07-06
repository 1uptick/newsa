import React from "react";
import { useTypingText } from "../hooks/useTypingText";

type PipelineStageBlockProps = {
  text: string;
  /** When true, reveal text with a typing animation (typically the latest completed stage). */
  animate?: boolean;
};

export function PipelineStageBlock({ text, animate = false }: PipelineStageBlockProps) {
  const displayed = useTypingText(text, animate);
  if (!displayed.trim()) return null;
  return (
    <pre className="whitespace-pre-wrap text-xs leading-relaxed text-slate-600 font-sans mb-2 last:mb-0">
      {displayed}
    </pre>
  );
}
