export type ReportStyle =
  | "auto"
  | "bloomberg"
  | "qa"
  | "editorial"
  | "casual"
  | "financial_education"
  | "instructional"
  | "scenario_chain"
  | "technical_analysis"
  | "custom";

export type ResolvedReportStyle = Exclude<ReportStyle, "auto">;

export const CUSTOM_STYLE_INSTRUCTIONS_MAX = 2000;
export const CUSTOM_STYLE_NAME_MAX = 60;

export type ReportLength = "800" | "1200" | "2000";
export type ReportLanguage = "en" | "tc" | "sc" | "th" | "vi";
export type ReportHorizon = "1m" | "3m" | "6m" | "12m";
export type ReportPace = "quick" | "standard" | "deep";
export type ReportAudience = "institutional" | "retail";

export type ReportOutputOptions = {
  style: ReportStyle;
  audience: ReportAudience;
  pace: ReportPace;
  length: ReportLength;
  /** English is always generated first; additional langs are translated after writing. */
  languages: ReportLanguage[];
  horizon: ReportHorizon;
  /** User-defined writing instructions when style is "custom". */
  customStyleInstructions?: string;
  /** Display name when using a saved custom style preset. */
  customStyleName?: string;
  /** Client-side id linking to a saved custom style preset. */
  savedCustomStyleId?: string;
};

export const PACE_PRESETS: Record<ReportPace, { label: string; length: ReportLength }> = {
  quick: { label: "Quick", length: "800" },
  standard: { label: "Standard", length: "1200" },
  deep: { label: "In-depth", length: "2000" },
};

export const DEFAULT_REPORT_OUTPUT_OPTIONS: ReportOutputOptions = {
  style: "auto",
  audience: "institutional",
  pace: "standard",
  length: "1200",
  languages: ["en"],
  horizon: "3m",
};

const STYLES = new Set<ReportStyle>([
  "auto",
  "bloomberg",
  "qa",
  "editorial",
  "casual",
  "financial_education",
  "instructional",
  "scenario_chain",
  "technical_analysis",
  "custom",
]);

const RESOLVED_STYLES = new Set<ResolvedReportStyle>([
  "bloomberg",
  "qa",
  "editorial",
  "casual",
  "financial_education",
  "instructional",
  "scenario_chain",
  "technical_analysis",
  "custom",
]);

const LANG_ORDER: ReportLanguage[] = ["en", "tc", "sc", "th", "vi"];

export function paceFromLength(length: ReportLength): ReportPace {
  return length === "2000" ? "deep" : "standard";
}

export function normalizeHorizon(raw: unknown): ReportHorizon {
  const h = typeof raw === "string" ? raw.trim().toLowerCase() : "3m";
  if (h === "6m" || h === "1m" || h === "12m") return h;
  return "3m";
}

export function normalizeAudience(raw: unknown): ReportAudience {
  const a = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return a === "retail" ? "retail" : "institutional";
}

export function audienceLabel(audience: ReportAudience): string {
  return audience === "retail" ? "Retail" : "Institutional";
}

export function normalizeLanguages(input: unknown): ReportLanguage[] {
  let raw: string[] = [];
  if (Array.isArray(input)) {
    raw = input.map((x) => String(x).trim().toLowerCase());
  } else if (typeof input === "string" && input.trim()) {
    raw = [input.trim().toLowerCase()];
  }
  const set = new Set<ReportLanguage>();
  for (const l of raw) {
    if (l === "tc" || l === "sc" || l === "th" || l === "vi" || l === "en") set.add(l);
  }
  set.add("en");
  return LANG_ORDER.filter((l) => set.has(l));
}

export function normalizeCustomStyleName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ").slice(0, CUSTOM_STYLE_NAME_MAX);
}

export function normalizeCustomStyleInstructions(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, CUSTOM_STYLE_INSTRUCTIONS_MAX);
}

export function normalizeReportOutputOptions(input: unknown): ReportOutputOptions {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const styleRaw = typeof o.style === "string" ? o.style.trim().toLowerCase() : "auto";
  const style = STYLES.has(styleRaw as ReportStyle) ? (styleRaw as ReportStyle) : "auto";
  const languages = normalizeLanguages(o.languages ?? o.language);
  const horizon = normalizeHorizon(o.horizon);

  const paceRaw = typeof o.pace === "string" ? o.pace.trim().toLowerCase() : "";
  const length: ReportLength =
    o.length === "2000" ? "2000" : o.length === "1200" ? "1200" : "800";
  const pace: ReportPace =
    paceRaw === "quick" || paceRaw === "deep" || paceRaw === "standard"
      ? paceRaw
      : paceFromLength(length);

  return {
    style,
    audience: normalizeAudience(o.audience),
    pace,
    length: PACE_PRESETS[pace].length,
    languages,
    horizon,
    customStyleInstructions: normalizeCustomStyleInstructions(o.customStyleInstructions),
    customStyleName: normalizeCustomStyleName(o.customStyleName) || undefined,
    savedCustomStyleId:
      typeof o.savedCustomStyleId === "string" && o.savedCustomStyleId.trim()
        ? o.savedCustomStyleId.trim()
        : undefined,
  };
}

export function parseResolvedStyle(raw: unknown): ResolvedReportStyle {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (RESOLVED_STYLES.has(s as ResolvedReportStyle)) return s as ResolvedReportStyle;
  return "bloomberg";
}

export function effectiveStyle(
  options: ReportOutputOptions,
  resolvedFromPlan?: ResolvedReportStyle
): ResolvedReportStyle {
  if (options.style !== "auto") return options.style;
  return resolvedFromPlan ?? "bloomberg";
}

export function horizonDays(horizon: ReportHorizon): number {
  if (horizon === "12m") return 365;
  if (horizon === "6m") return 180;
  if (horizon === "1m") return 30;
  return 90;
}

export function horizonLabel(horizon: ReportHorizon): string {
  if (horizon === "12m") return "12-month";
  if (horizon === "6m") return "6-month";
  if (horizon === "1m") return "1-month";
  return "3-month";
}

export function isoDateOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function languagesSummaryLine(languages: ReportLanguage[]): string {
  const labels = languages.map((l) => {
    if (l === "tc") return "繁體";
    if (l === "sc") return "简体";
    if (l === "th") return "TH";
    if (l === "vi") return "VI";
    return "EN";
  });
  return labels.join(" + ");
}

export type ReportTranslateLocale = Exclude<ReportLanguage, "en">;

export const REPORT_TRANSLATE_LOCALES: ReportTranslateLocale[] = ["tc", "sc", "th", "vi"];

export function parseReportTranslateLocale(raw: string): ReportTranslateLocale | null {
  const locale = raw.trim().toLowerCase();
  return REPORT_TRANSLATE_LOCALES.includes(locale as ReportTranslateLocale)
    ? (locale as ReportTranslateLocale)
    : null;
}

export function parseReportLanguage(raw: string): ReportLanguage | null {
  const locale = raw.trim().toLowerCase();
  return LANG_ORDER.includes(locale as ReportLanguage) ? (locale as ReportLanguage) : null;
}

export function optionsSummaryLine(options: ReportOutputOptions, resolvedStyle?: ResolvedReportStyle): string {
  const STYLE_LABELS: Partial<Record<ReportStyle | ResolvedReportStyle, string>> = {
    bloomberg: "Bloomberg report",
    qa: "Q & A",
    editorial: "Editorial",
    casual: "Casual",
    financial_education: "Financial education",
    instructional: "Instructional",
    scenario_chain: "Scenario chain",
    technical_analysis: "Technical analysis",
    custom: "Custom",
  };
  const stylePart =
    options.style === "auto"
      ? `Auto${resolvedStyle ? ` → ${STYLE_LABELS[resolvedStyle] ?? resolvedStyle}` : ""}`
      : options.style === "custom"
        ? options.customStyleName?.trim()
          ? `Custom: ${options.customStyleName.trim()}`
          : "Custom"
        : (STYLE_LABELS[options.style] ?? options.style);
  const paceLabel = PACE_PRESETS[options.pace]?.label ?? options.pace;
  return `Style: ${stylePart} | ${audienceLabel(options.audience)} | ${paceLabel} (~${options.length} words) | ${languagesSummaryLine(options.languages)} | ${horizonLabel(options.horizon)} outlook`;
}

export function translationTargets(languages: ReportLanguage[]): Array<Exclude<ReportLanguage, "en">> {
  return languages.filter((l): l is Exclude<ReportLanguage, "en"> => l !== "en");
}
