/** Shared layout for the topic card "Source" pill (audience or category label). */
const TOPIC_SOURCE_PILL_BASE =
  "inline-flex items-center justify-center px-3 py-1 md:px-2.5 md:py-0.5 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-wider truncate max-w-[120px] md:max-w-full";

/** Same hues as sidebar Institutional / Retail toggles (use for SVG/charts). */
export const AUDIENCE_INSTITUTIONAL_HEX = "#64e3e6";
export const AUDIENCE_RETAIL_HEX = "#c2f1f1";

/** Background + label — topic pills and audience toggles (institutional / retail). */
const AUDIENCE_INSTITUTIONAL = "bg-[#64e3e6] text-slate-900";
const AUDIENCE_RETAIL = "bg-[#c2f1f1] text-slate-900";

/**
 * Background/text for the Source pill. ATFX proposed topics use "Institutional" / "Retail";
 * other flows keep the default brand orange for categories like "Macro Themes".
 */
export function topicSourcePillClass(source: string | undefined | null): string {
  const s = (source || "").trim().toLowerCase();
  if (s === "retail") return `${TOPIC_SOURCE_PILL_BASE} ${AUDIENCE_RETAIL}`;
  if (s === "institutional") return `${TOPIC_SOURCE_PILL_BASE} ${AUDIENCE_INSTITUTIONAL}`;
  return `${TOPIC_SOURCE_PILL_BASE} bg-[#ff7900] text-white`;
}

const AUDIENCE_SEGMENT_INACTIVE =
  "text-slate-600 hover:bg-slate-200/60";

/** Active state for sidebar/modal audience toggles — matches topic card Source pills. */
export function audienceSegmentButtonClass(
  segment: "institutional" | "retail",
  selected: "institutional" | "retail",
): string {
  if (selected !== segment) return AUDIENCE_SEGMENT_INACTIVE;
  return segment === "institutional"
    ? `${AUDIENCE_INSTITUTIONAL} shadow-sm`
    : `${AUDIENCE_RETAIL} shadow-sm`;
}

/** Donut / chart fill for a category label (matches topic Source pills). */
export function audienceCategoryChartColor(category: string | undefined | null): string | null {
  const s = (category || "").trim().toLowerCase();
  if (s === "retail") return AUDIENCE_RETAIL_HEX;
  if (s === "institutional") return AUDIENCE_INSTITUTIONAL_HEX;
  return null;
}
