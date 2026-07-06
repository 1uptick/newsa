import React from "react";
import { getCapitalTopicSummaryHtml } from "../lib/html";

const MD_SCOPE =
  "capital-topic-summary-md text-xs md:text-sm text-slate-600 leading-relaxed " +
  "[&_p]:mb-2 [&_p:last-child]:mb-0 [&_p]:break-words " +
  "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-4 " +
  "[&_li]:my-0.5 [&_strong]:font-semibold [&_b]:font-semibold [&_em]:italic [&_i]:italic " +
  "[&_a]:text-primary [&_a]:underline [&_a]:break-all " +
  "[&_code]:text-[11px] [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono " +
  "[&_pre]:my-2 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-slate-900 [&_pre]:p-2 [&_pre]:text-[11px] [&_pre]:text-slate-100 " +
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 " +
  "[&_h1]:text-sm [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mb-2 [&_h3]:text-xs [&_h3]:font-bold [&_h3]:mb-1 " +
  "[&_table]:my-2 [&_table]:w-full [&_table]:text-left [&_table]:text-xs [&_th]:border [&_th]:border-slate-200 [&_th]:p-1 [&_td]:border [&_td]:border-slate-200 [&_td]:p-1";

export function CapitalTopicCardSummary({
  markdown,
  cardExpanded,
}: {
  markdown: string | undefined;
  cardExpanded: boolean;
}) {
  const html = getCapitalTopicSummaryHtml(markdown ?? "");
  if (!html) {
    return <p className="text-xs text-slate-400 italic">No description</p>;
  }
  return (
    <div
      className={`${MD_SCOPE} ${
        cardExpanded ? "max-h-[min(70vh,28rem)]" : "max-h-28 md:max-h-32"
      } overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin]`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
