/**
 * Per-user "opened" state for Capital dashboard Ready to Post preview rows.
 * Table: public.capital_ready_post_opened (see supabase/capital_ready_post_opened.sql).
 */

/** Show "New" only for articles whose create date is on or after 1 Apr 2026 (UTC). */
const READY_POST_NEW_TAG_CUTOFF_UTC_MS = Date.UTC(2026, 3, 1);

export function capitalReadyPostCreateDateEligibleForNewTag(createDate: string): boolean {
  if (!createDate || typeof createDate !== "string") return false;
  const t = Date.parse(createDate.trim());
  if (Number.isNaN(t)) return false;
  return t >= READY_POST_NEW_TAG_CUTOFF_UTC_MS;
}

export type ReadyPostNewFlagRow = { id: string; createDate: string; isNew?: boolean };

export async function attachReadyPostNewFlagsForUser(
  supabase: { from: (t: string) => any },
  firebaseUid: string,
  items: ReadyPostNewFlagRow[]
): Promise<void> {
  if (items.length === 0) return;
  const ids = items.map((i) => i.id).filter(Boolean);
  const { data: openedRows, error } = await supabase
    .from("capital_ready_post_opened")
    .select("airtable_id")
    .eq("firebase_uid", firebaseUid)
    .in("airtable_id", ids);

  if (error) {
    console.error("capital_ready_post_opened select:", error);
    for (const item of items) item.isNew = false;
    return;
  }

  const opened = new Set((openedRows ?? []).map((r: { airtable_id: string }) => r.airtable_id));
  for (const item of items) {
    item.isNew = capitalReadyPostCreateDateEligibleForNewTag(item.createDate) && !opened.has(item.id);
  }
}
