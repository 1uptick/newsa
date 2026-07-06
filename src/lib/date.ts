/**
 * Format a date string for display.
 * @param dateStr - ISO or parseable date string
 * @param locale - Optional locale (e.g. "en-GB"); default uses short format
 * @param emptyPlaceholder - String to return when dateStr is empty/falsy (default "—")
 */
export function formatDate(
  dateStr: string,
  locale: string | undefined = "en-GB",
  emptyPlaceholder = "—"
): string {
  if (!dateStr || typeof dateStr !== "string") return emptyPlaceholder;
  const trimmed = dateStr.trim();
  if (!trimmed) return emptyPlaceholder;
  try {
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) return trimmed;
    return locale
      ? d.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })
      : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return trimmed;
  }
}

/** Short date for lists (user locale). Same as formatCreateDate in Capital/types. */
export function formatCreateDate(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? trimmed : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return trimmed;
  }
}
