import type { SupabaseClient } from "@supabase/supabase-js";
import { ATFX_GROUP_ID } from "./auth.js";

export type AtfxGroupMemberSnapshot = {
  uids: string[];
  emailByUid: Map<string, string | null>;
};

let memberCache: { snapshot: AtfxGroupMemberSnapshot; expires: number } | null = null;
const CACHE_TTL_MS = 60_000;

function emptySnapshot(): AtfxGroupMemberSnapshot {
  return { uids: [], emailByUid: new Map() };
}

/** All firebase_uids in the ATFX client group (cached ~60s). */
export async function getAtfxGroupMemberSnapshot(supabase: SupabaseClient): Promise<AtfxGroupMemberSnapshot> {
  const now = Date.now();
  if (memberCache && memberCache.expires > now) {
    return memberCache.snapshot;
  }

  const { data: groupRow, error: groupErr } = await supabase
    .from("groups")
    .select("id")
    .ilike("name", ATFX_GROUP_ID)
    .maybeSingle();
  if (groupErr) throw groupErr;
  if (!groupRow?.id) {
    const snapshot = emptySnapshot();
    memberCache = { snapshot, expires: now + CACHE_TTL_MS };
    return snapshot;
  }

  const { data, error } = await supabase
    .from("user_roles")
    .select("firebase_uid, email")
    .eq("group_id", groupRow.id);
  if (error) throw error;

  const uids = (data ?? []).map((r) => r.firebase_uid).filter((id): id is string => Boolean(id));
  const emailByUid = new Map<string, string | null>(
    (data ?? []).map((r) => [r.firebase_uid, r.email ?? null] as const)
  );
  const snapshot = { uids, emailByUid };
  memberCache = { snapshot, expires: now + CACHE_TTL_MS };
  return snapshot;
}

/** Uids to include in ATFX history lists (group members + always the current user). */
export async function resolveAtfxHistoryUids(
  supabase: SupabaseClient,
  currentUid: string
): Promise<AtfxGroupMemberSnapshot> {
  const snapshot = await getAtfxGroupMemberSnapshot(supabase);
  const uids = new Set(snapshot.uids);
  uids.add(currentUid);
  const emailByUid = new Map(snapshot.emailByUid);
  if (!emailByUid.has(currentUid)) {
    emailByUid.set(currentUid, null);
  }
  return { uids: [...uids], emailByUid };
}

export function isAtfxGroupMember(uid: string, snapshot: AtfxGroupMemberSnapshot): boolean {
  return snapshot.uids.includes(uid);
}
