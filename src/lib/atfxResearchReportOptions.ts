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

export type ReportLength = "800" | "1200" | "2000";
export type ReportLanguage = "en" | "tc" | "sc" | "th" | "vi";
export type ReportHorizon = "1m" | "3m" | "6m" | "12m";
/** Word count + research depth — independent from outlook horizon. */
export type ReportPace = "quick" | "standard" | "deep";
export type ReportAudience = "institutional" | "retail";

export type ReportLocaleBundle = {
  title: string;
  report_html: string;
  seo_excerpt?: string;
};

export type ReportI18nContent = Partial<Record<ReportLanguage, ReportLocaleBundle>>;

export type ReportOutputOptions = {
  style: ReportStyle;
  audience: ReportAudience;
  pace: ReportPace;
  length: ReportLength;
  languages: ReportLanguage[];
  horizon: ReportHorizon;
  /** User-defined writing instructions when style is "custom". */
  customStyleInstructions?: string;
  /** Display name when using a saved custom style preset. */
  customStyleName?: string;
  /** Client-side id linking to a saved custom style preset (persisted for report reload). */
  savedCustomStyleId?: string;
};

export const PACE_PRESETS: Record<
  ReportPace,
  { label: string; detail: string; length: ReportLength }
> = {
  quick: { label: "Quick", detail: "~800 words · ~3 min read", length: "800" },
  standard: { label: "Standard", detail: "~1200 words · ~5 min read", length: "1200" },
  deep: { label: "In-depth", detail: "~2000 words · ~8 min read", length: "2000" },
};

export const DEFAULT_REPORT_OUTPUT_OPTIONS: ReportOutputOptions = {
  style: "auto",
  audience: "institutional",
  pace: "standard",
  length: "1200",
  languages: ["en"],
  horizon: "3m",
};

export const REPORT_AUDIENCE_OPTIONS: Array<{ value: ReportAudience; label: string; hint: string }> = [
  {
    value: "institutional",
    label: "Institutional",
    hint: "PMs, desks, macro funds — dense, professional wire tone.",
  },
  {
    value: "retail",
    label: "Retail",
    hint: "Individual traders — clear language, practical context, lighter jargon.",
  },
];

export const REPORT_STYLE_OPTIONS: Array<{ value: ReportStyle; label: string; hint: string }> = [
  { value: "auto", label: "Auto", hint: "Picks the best format from your topic." },
  {
    value: "bloomberg",
    label: "Bloomberg report",
    hint: "Terminal wire — numbers-first, dense tables, neutral tone.",
  },
  { value: "qa", label: "Q & A", hint: "FAQ format — h4 questions with direct answers." },
  { value: "editorial", label: "Editorial", hint: "Opinion-led thesis, argument, and counterpoints." },
  { value: "casual", label: "Casual", hint: "Newsletter voice — plain English, friendly and short." },
  {
    value: "financial_education",
    label: "Financial education",
    hint: "Teach concepts — definitions, examples, glossary.",
  },
  {
    value: "instructional",
    label: "Instructional",
    hint: "How-to playbook — steps, checklist, common mistakes.",
  },
  {
    value: "scenario_chain",
    label: "Scenario chain",
    hint: "If-then logic — step-by-step causal paths (bull vs bear).",
  },
  {
    value: "technical_analysis",
    label: "Technical analysis",
    hint: "Chart-driven — trend, levels, indicators, and trade setup.",
  },
  {
    value: "custom",
    label: "Custom",
    hint: "Save named presets below, or use one-off instructions.",
  },
];

export const REPORT_PACE_OPTIONS: Array<{ value: ReportPace; label: string }> = (
  Object.entries(PACE_PRESETS) as Array<[ReportPace, (typeof PACE_PRESETS)[ReportPace]]>
).map(([value, preset]) => ({
  value,
  label: `${preset.label} (${preset.detail})`,
}));

export const REPORT_HORIZON_OPTIONS: Array<{ value: ReportHorizon; label: string }> = [
  { value: "1m", label: "1 month" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "12m", label: "12 months" },
];

export const REPORT_LANGUAGE_OPTIONS: Array<{ value: ReportLanguage; label: string; hint?: string }> = [
  { value: "en", label: "EN" },
  { value: "tc", label: "繁體 TC", hint: "繁體中文" },
  { value: "sc", label: "简体 SC", hint: "简体中文" },
  { value: "th", label: "TH", hint: "ไทย" },
  { value: "vi", label: "VI", hint: "Tiếng Việt" },
];

export const LANG_TAB_ORDER: ReportLanguage[] = ["en", "tc", "sc", "th", "vi"];

export function audienceDisplayLabel(audience: ReportAudience): string {
  return REPORT_AUDIENCE_OPTIONS.find((o) => o.value === audience)?.label ?? audience;
}

export function normalizeAudience(raw: unknown): ReportAudience {
  const a = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return a === "retail" ? "retail" : "institutional";
}

export function styleDisplayLabel(
  style: ReportStyle | ResolvedReportStyle,
  customStyleName?: string
): string {
  if (style === "custom" && customStyleName?.trim()) return customStyleName.trim();
  return REPORT_STYLE_OPTIONS.find((o) => o.value === style)?.label ?? style;
}

export function languageTabLabel(lang: ReportLanguage): string {
  return REPORT_LANGUAGE_OPTIONS.find((o) => o.value === lang)?.label ?? lang.toUpperCase();
}

/** Full language name for status messages (e.g. while translating). */
export function languageTranslatingLabel(lang: ReportLanguage): string {
  switch (lang) {
    case "tc":
      return "Traditional Chinese (繁體中文)";
    case "sc":
      return "Simplified Chinese (简体中文)";
    case "th":
      return "Thai (ไทย)";
    case "vi":
      return "Vietnamese (Tiếng Việt)";
    default:
      return "English";
  }
}
/** Short labels for inline header pills (matches Markets quick analysis tabs). */
export function languagePillLabel(lang: ReportLanguage): string {
  if (lang === "tc") return "繁";
  if (lang === "sc") return "简";
  if (lang === "th") return "TH";
  if (lang === "vi") return "VI";
  return "EN";
}

export function paceFromLength(length: ReportLength): ReportPace {
  return length === "2000" ? "deep" : "standard";
}

export function applyPace(pace: ReportPace, options: ReportOutputOptions): ReportOutputOptions {
  return { ...options, pace, length: PACE_PRESETS[pace].length };
}

export function normalizeHorizon(raw: unknown): ReportHorizon {
  const h = typeof raw === "string" ? raw.trim().toLowerCase() : "3m";
  if (h === "6m" || h === "1m" || h === "12m") return h;
  return "3m";
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
  return LANG_TAB_ORDER.filter((l) => set.has(l));
}

export const CUSTOM_STYLE_NAME_MAX = 60;

export function normalizeCustomStyleName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\s+/g, " ").slice(0, CUSTOM_STYLE_NAME_MAX);
}

/** Preserve trailing spaces while the user is still typing. */
export function draftCustomStyleName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, " ").slice(0, CUSTOM_STYLE_NAME_MAX);
}

export function normalizeCustomStyleInstructions(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, CUSTOM_STYLE_INSTRUCTIONS_MAX);
}

/** Preserve trailing spaces/newlines while the user is still typing. */
export function draftCustomStyleInstructions(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.slice(0, CUSTOM_STYLE_INSTRUCTIONS_MAX);
}

export function parseReportOutputOptions(input: unknown): ReportOutputOptions {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const styleRaw = typeof o.style === "string" ? o.style.trim().toLowerCase() : "auto";
  const style = REPORT_STYLE_OPTIONS.some((opt) => opt.value === styleRaw)
    ? (styleRaw as ReportStyle)
    : "auto";
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

export function parseReportI18n(raw: unknown): ReportI18nContent {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: ReportI18nContent = {};
  for (const lang of LANG_TAB_ORDER) {
    const entry = o[lang];
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const report_html = typeof e.report_html === "string" ? e.report_html : "";
    const title = typeof e.title === "string" ? e.title : "";
    const seo_excerpt = typeof e.seo_excerpt === "string" ? e.seo_excerpt : undefined;
    if (report_html.trim()) {
      out[lang] = {
        title: title || "Untitled report",
        report_html,
        ...(seo_excerpt?.trim() ? { seo_excerpt: seo_excerpt.trim() } : {}),
      };
    }
  }
  return out;
}

export function reportI18nFromApi(data: {
  title?: string;
  report_html?: string;
  report_html_i18n?: unknown;
  report_i18n?: unknown;
  seo_excerpt?: string;
}): ReportI18nContent {
  const i18n = parseReportI18n(data.report_html_i18n ?? data.report_i18n);
  const englishExcerpt = typeof data.seo_excerpt === "string" ? data.seo_excerpt.trim() : "";
  if (data.report_html?.trim() && !i18n.en) {
    i18n.en = {
      title: data.title || "Untitled report",
      report_html: data.report_html,
      ...(englishExcerpt ? { seo_excerpt: englishExcerpt } : {}),
    };
  } else if (englishExcerpt && i18n.en && !i18n.en.seo_excerpt?.trim()) {
    i18n.en = { ...i18n.en, seo_excerpt: englishExcerpt };
  }
  return i18n;
}

export function i18nTabLanguages(i18n: ReportI18nContent): ReportLanguage[] {
  return LANG_TAB_ORDER.filter((l) => i18n[l]?.report_html?.trim());
}

export function toggleReportLanguage(
  languages: ReportLanguage[],
  lang: ReportLanguage
): ReportLanguage[] {
  if (lang === "en") return languages;
  const has = languages.includes(lang);
  const next = has ? languages.filter((l) => l !== lang) : [...languages, lang];
  return normalizeLanguages(next);
}

export type ReportTranslateLocale = Exclude<ReportLanguage, "en">;

export const REPORT_TRANSLATE_LOCALES: ReportTranslateLocale[] = ["tc", "sc", "th", "vi"];

export function parseReportTranslateLocale(raw: string): ReportTranslateLocale | null {
  const locale = raw.trim().toLowerCase();
  return REPORT_TRANSLATE_LOCALES.includes(locale as ReportTranslateLocale)
    ? (locale as ReportTranslateLocale)
    : null;
}

export function hasReportTranslation(
  i18n: ReportI18nContent,
  lang: ReportTranslateLocale
): boolean {
  return Boolean(i18n[lang]?.report_html?.trim());
}

export function missingReportTranslationLocales(i18n: ReportI18nContent): ReportTranslateLocale[] {
  if (!i18n.en?.report_html?.trim()) return [];
  return REPORT_TRANSLATE_LOCALES.filter((l) => !hasReportTranslation(i18n, l));
}

/** SEO excerpt for the active language tab (falls back to English column for EN). */
export function resolveReportSeoExcerpt(
  i18n: ReportI18nContent,
  activeLang: ReportLanguage,
  englishExcerpt = ""
): string {
  const fromBundle = i18n[activeLang]?.seo_excerpt?.trim();
  if (fromBundle) return fromBundle;
  if (activeLang === "en") return englishExcerpt.trim();
  return "";
}
