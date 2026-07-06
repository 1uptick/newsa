export type QuickAnalysisTranslateLocale = "zh-TW" | "zh-CN" | "th" | "vi";

export type QuickAnalysisContentTab = "en" | QuickAnalysisTranslateLocale;

export type QuickAnalysisReportTranslations = {
  reportTc?: string;
  reportSc?: string;
  reportTh?: string;
  reportVi?: string;
};

export const QUICK_ANALYSIS_AUTO_TRANSLATE_STORAGE_KEY = "atfx.markets.qaAutoTranslate";

export const QUICK_ANALYSIS_TRANSLATE_LOCALE_VALUES: QuickAnalysisTranslateLocale[] = [
  "zh-TW",
  "zh-CN",
  "th",
  "vi",
];

export type QuickAnalysisAutoTranslateOption = {
  value: QuickAnalysisTranslateLocale;
  label: string;
  hint: string;
  tabLabel: string;
  reportField: keyof QuickAnalysisReportTranslations;
};

export const QUICK_ANALYSIS_AUTO_TRANSLATE_OPTIONS: QuickAnalysisAutoTranslateOption[] = [
  { value: "zh-TW", label: "Traditional Chinese", hint: "繁體中文", tabLabel: "繁", reportField: "reportTc" },
  { value: "zh-CN", label: "Simplified Chinese", hint: "简体中文", tabLabel: "简", reportField: "reportSc" },
  { value: "th", label: "Thai", hint: "ไทย", tabLabel: "TH", reportField: "reportTh" },
  { value: "vi", label: "Vietnamese", hint: "Tiếng Việt", tabLabel: "VI", reportField: "reportVi" },
];

export function isQuickAnalysisTranslateLocale(value: unknown): value is QuickAnalysisTranslateLocale {
  return typeof value === "string" && QUICK_ANALYSIS_TRANSLATE_LOCALE_VALUES.includes(value as QuickAnalysisTranslateLocale);
}

export function quickAnalysisReportFieldForLocale(
  locale: QuickAnalysisTranslateLocale
): keyof QuickAnalysisReportTranslations {
  return QUICK_ANALYSIS_AUTO_TRANSLATE_OPTIONS.find((o) => o.value === locale)?.reportField ?? "reportTc";
}

export function getQuickAnalysisTranslatedReport(
  session: QuickAnalysisReportTranslations,
  locale: QuickAnalysisTranslateLocale
): string | undefined {
  return session[quickAnalysisReportFieldForLocale(locale)];
}

export function hasQuickAnalysisTranslation(
  session: QuickAnalysisReportTranslations,
  locale: QuickAnalysisTranslateLocale
): boolean {
  return Boolean(getQuickAnalysisTranslatedReport(session, locale)?.trim());
}

export function quickAnalysisMissingTranslationLocales(
  session: QuickAnalysisReportTranslations
): QuickAnalysisTranslateLocale[] {
  return QUICK_ANALYSIS_AUTO_TRANSLATE_OPTIONS.filter((o) => !hasQuickAnalysisTranslation(session, o.value)).map(
    (o) => o.value
  );
}

export function readStoredQuickAnalysisAutoTranslate(): QuickAnalysisTranslateLocale[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUICK_ANALYSIS_AUTO_TRANSLATE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQuickAnalysisTranslateLocale);
  } catch {
    return [];
  }
}

export function writeStoredQuickAnalysisAutoTranslate(locales: QuickAnalysisTranslateLocale[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUICK_ANALYSIS_AUTO_TRANSLATE_STORAGE_KEY, JSON.stringify(locales));
  } catch {
    /* ignore */
  }
}

export function toggleQuickAnalysisAutoTranslate(
  current: QuickAnalysisTranslateLocale[],
  locale: QuickAnalysisTranslateLocale
): QuickAnalysisTranslateLocale[] {
  return current.includes(locale) ? current.filter((l) => l !== locale) : [...current, locale];
}

export function quickAnalysisTabLabel(tab: QuickAnalysisContentTab): string {
  if (tab === "en") return "EN";
  return QUICK_ANALYSIS_AUTO_TRANSLATE_OPTIONS.find((o) => o.value === tab)?.tabLabel ?? tab;
}

export type QuickAnalysisTranslationPayload = QuickAnalysisReportTranslations;

export function quickAnalysisTranslationPayloadForLocale(
  locale: QuickAnalysisTranslateLocale,
  report: string
): QuickAnalysisTranslationPayload {
  return { [quickAnalysisReportFieldForLocale(locale)]: report };
}

export type QuickAnalysisSendLocale = QuickAnalysisContentTab;

export type QuickAnalysisSendLanguageOption = {
  value: QuickAnalysisSendLocale;
  label: string;
  tabLabel: string;
};

export const QUICK_ANALYSIS_SEND_LANGUAGE_OPTIONS: QuickAnalysisSendLanguageOption[] = [
  { value: "en", label: "English", tabLabel: "EN" },
  ...QUICK_ANALYSIS_AUTO_TRANSLATE_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
    tabLabel: o.tabLabel,
  })),
];

export function quickAnalysisSendLanguageLabel(locale: QuickAnalysisSendLocale): string {
  return QUICK_ANALYSIS_SEND_LANGUAGE_OPTIONS.find((o) => o.value === locale)?.label ?? locale;
}

export function getQuickAnalysisReportForLocale(
  session: { report: string } & QuickAnalysisReportTranslations,
  locale: QuickAnalysisSendLocale
): string {
  if (locale === "en") return session.report;
  return getQuickAnalysisTranslatedReport(session, locale) ?? "";
}

export function hasQuickAnalysisReportForLocale(
  session: { report: string } & QuickAnalysisReportTranslations,
  locale: QuickAnalysisSendLocale
): boolean {
  return Boolean(getQuickAnalysisReportForLocale(session, locale).trim());
}
