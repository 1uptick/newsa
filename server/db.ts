/**
 * Database layer using Supabase (replaces SQLite for user_roles, invitations, groups, password_reset_tokens).
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const supabase: SupabaseClient | null =
  config.supabase.url && config.supabase.serviceRoleKey
    ? createClient(config.supabase.url, config.supabase.serviceRoleKey)
    : null;

function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error("Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  return supabase;
}

export type GroupRow = { id: number; name: string; created_at: string };
export type UserRoleRow = { firebase_uid: string; role: string; group_id: number | null; email: string | null; created_at: string };
export type InvitationRow = { id: number; code: string; role: string; used: number; email: string | null; group_id: number | null; created_at: string };

/** Get role for a Firebase UID (auth middleware). */
export async function getUserRole(uid: string): Promise<{ role: string } | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("user_roles").select("role").eq("firebase_uid", uid).maybeSingle();
  if (error) throw error;
  return data ? { role: data.role } : null;
}

/** Upsert user role (on use-invitation or initial admin). */
export async function upsertUserRole(params: {
  firebase_uid: string;
  role: string;
  group_id?: number | null;
  email?: string | null;
}): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("user_roles").upsert(
    {
      firebase_uid: params.firebase_uid,
      role: params.role,
      group_id: params.group_id ?? null,
      email: params.email ?? null,
    },
    { onConflict: "firebase_uid" }
  );
  if (error) throw error;
}

/** Get invitation by code where used = 0. */
export async function getInvitationByCodeUnused(code: string): Promise<InvitationRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("invitations")
    .select("*")
    .eq("code", code)
    .eq("used", 0)
    .maybeSingle();
  if (error) throw error;
  return data as InvitationRow | null;
}

/** Mark invitation as used. */
export async function markInvitationUsed(id: number): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("invitations").update({ used: 1 }).eq("id", id);
  if (error) throw error;
}

/** Insert invitation and return the row with id. */
export async function insertInvitation(params: {
  code: string;
  role: string;
  email?: string | null;
  group_id?: number | null;
}): Promise<{ id: number; code: string; role: string; group_id: number | null }> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("invitations")
    .insert({
      code: params.code,
      role: params.role,
      email: params.email ?? null,
      group_id: params.group_id ?? null,
    })
    .select("id, code, role, group_id")
    .single();
  if (error) throw error;
  return { id: data.id, code: data.code, role: data.role, group_id: data.group_id };
}

/** Get invitation by code (any used state). */
export async function getInvitationByCode(code: string): Promise<InvitationRow | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("invitations").select("*").eq("code", code).maybeSingle();
  if (error) throw error;
  return data as InvitationRow | null;
}

/** Count invitations (for seed check). */
export async function countInvitations(): Promise<number> {
  const sb = requireSupabase();
  const { count, error } = await sb.from("invitations").select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

/** Seed one invitation if table is empty. Returns true if a row was inserted. */
export async function seedInvitation(code: string, role: string): Promise<boolean> {
  const sb = requireSupabase();
  const { data: existing } = await sb.from("invitations").select("id").limit(1);
  if (existing && existing.length > 0) return false;
  await sb.from("invitations").insert({ code, role });
  return true;
}

/** List invitations with group name. */
export async function listInvitations(): Promise<
  { id: number; code: string; role: string; used: number; email: string | null; created_at: string; group_id: number | null; group_name: string | null }[]
> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("invitations")
    .select("id, code, role, used, email, created_at, group_id, groups(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    code: r.code,
    role: r.role,
    used: r.used,
    email: r.email,
    created_at: r.created_at,
    group_id: r.group_id,
    group_name: r.groups?.name ?? null,
  }));
}

/** Delete invitation by id. Returns true if a row was deleted. */
export async function deleteInvitation(id: number): Promise<boolean> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("invitations").delete().eq("id", id).select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** List groups. */
export async function listGroups(): Promise<GroupRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("groups").select("id, name, created_at").order("name");
  if (error) throw error;
  return (data ?? []) as GroupRow[];
}

/** Insert group and return row. */
export async function insertGroup(name: string): Promise<GroupRow> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("groups").insert({ name }).select("id, name, created_at").single();
  if (error) {
    if (error.code === "23505") throw new Error("UNIQUE_GROUP_NAME"); // PostgreSQL unique violation
    throw error;
  }
  return data as GroupRow;
}

/** Get auth/me row (role, group_id, group_name) for uid. */
export async function getAuthMe(uid: string): Promise<{ role: string; group_id: number | null; group_name: string | null } | null> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("user_roles")
    .select("role, group_id, groups(name)")
    .eq("firebase_uid", uid)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    role: data.role,
    group_id: data.group_id,
    group_name: (data as any).groups?.name ?? null,
  };
}

/** List user_roles with group name. */
export async function listUserRolesWithGroups(): Promise<
  { firebase_uid: string; email: string | null; role: string; group_id: number | null; created_at: string; group_name: string | null }[]
> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("user_roles")
    .select("firebase_uid, email, role, group_id, created_at, groups(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    firebase_uid: r.firebase_uid,
    email: r.email,
    role: r.role,
    group_id: r.group_id,
    created_at: r.created_at,
    group_name: r.groups?.name ?? null,
  }));
}

/** Update user_roles.email for uid. */
export async function updateUserRoleEmail(uid: string, email: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("user_roles").update({ email }).eq("firebase_uid", uid);
  if (error) throw error;
}

/** Check if user exists by uid. */
export async function getUserRoleByUid(uid: string): Promise<{ firebase_uid: string } | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("user_roles").select("firebase_uid").eq("firebase_uid", uid).maybeSingle();
  if (error) throw error;
  return data ? { firebase_uid: data.firebase_uid } : null;
}

/** Delete user role by uid. */
export async function deleteUserRole(uid: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("user_roles").delete().eq("firebase_uid", uid);
  if (error) throw error;
}

/** Get password reset token row. */
export async function getPasswordResetToken(token: string): Promise<{ email: string; expires_at: string } | null> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("password_reset_tokens").select("email, expires_at").eq("token", token).maybeSingle();
  if (error) throw error;
  return data as { email: string; expires_at: string } | null;
}

/** Insert password reset token. */
export async function insertPasswordResetToken(params: { token: string; email: string; expires_at: string }): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("password_reset_tokens").insert(params);
  if (error) throw error;
}

/** Delete password reset token. */
export async function deletePasswordResetToken(token: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("password_reset_tokens").delete().eq("token", token);
  if (error) throw error;
}
