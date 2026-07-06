/**
 * Database layer using Supabase (replaces SQLite for user_roles, invitations, groups, password_reset_tokens).
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config.js";

const SUPABASE_FETCH_TIMEOUT_MS = 4_000;
const CIRCUIT_OPEN_MS = 60_000;

let circuitOpenUntil = 0;
let unreachableLogged = false;

function isNetworkFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  const cause = (err as Error & { cause?: Error }).cause;
  const causeMsg = cause instanceof Error ? cause.message.toLowerCase() : "";
  return (
    msg.includes("fetch failed") ||
    msg.includes("abort") ||
    msg.includes("timeout") ||
    msg.includes("network") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("supabase_unavailable") ||
    causeMsg.includes("connect") ||
    causeMsg.includes("timeout")
  );
}

function openSupabaseCircuit(err: unknown): void {
  circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
  if (!unreachableLogged) {
    unreachableLogged = true;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[db] Supabase unreachable (${msg}). DB calls will fail fast for ~${CIRCUIT_OPEN_MS / 1000}s. ` +
        "Check SUPABASE_URL, VPN/firewall, or whether the Supabase project is paused."
    );
  }
}

function supabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (Date.now() < circuitOpenUntil) {
    return Promise.reject(new Error("SUPABASE_UNAVAILABLE"));
  }
  const signal = AbortSignal.timeout(SUPABASE_FETCH_TIMEOUT_MS);
  return fetch(input, { ...init, signal }).catch((err) => {
    if (isNetworkFailure(err)) openSupabaseCircuit(err);
    throw err;
  });
}

const supabase: SupabaseClient | null =
  config.supabase.url && config.supabase.serviceRoleKey
    ? createClient(config.supabase.url, config.supabase.serviceRoleKey, {
        global: { fetch: supabaseFetch },
      })
    : null;

/** False while the circuit breaker is open after a network failure. */
export function isSupabaseQueryAvailable(): boolean {
  return Boolean(supabase) && Date.now() >= circuitOpenUntil;
}

/** One-shot connectivity check at dev server startup. */
export async function probeSupabaseHealth(): Promise<boolean> {
  if (!supabase) {
    console.warn("[db] Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
    return false;
  }
  const previousCircuit = circuitOpenUntil;
  circuitOpenUntil = 0;
  try {
    const { error } = await supabase.from("user_roles").select("firebase_uid").limit(1);
    if (error) throw error;
    unreachableLogged = false;
    circuitOpenUntil = 0;
    console.log("[db] Supabase connected.");
    return true;
  } catch (e) {
    circuitOpenUntil = Math.max(previousCircuit, Date.now() + CIRCUIT_OPEN_MS);
    if (!unreachableLogged) openSupabaseCircuit(e);
    return false;
  }
}

function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error("Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  if (Date.now() < circuitOpenUntil) throw new Error("SUPABASE_UNAVAILABLE");
  return supabase;
}

/**
 * PostgREST may return int8/bigserial as number, string, or bigint. `res.json` throws on bigint — normalize for API payloads.
 */
function normalizeOptionalInt(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeRequiredInt(value: unknown, label: string): number {
  const n = normalizeOptionalInt(value);
  if (n == null) throw new Error(`Expected integer for ${label}`);
  return n;
}

export type GroupRow = { id: number; name: string; created_at: string };
export type UserRoleRow = { firebase_uid: string; role: string; group_id: number | null; email: string | null; created_at: string };
export type InvitationRow = { id: number; code: string; role: string; used: number; email: string | null; group_id: number | null; created_at: string };

/**
 * Per-uid auth caches. The auth middleware runs `getUserRole` on every `/api/*` request and ATFX
 * routes additionally call `getAuthMe`, so without caching each page load (which fans out into many
 * parallel requests) triggers one Supabase round-trip per request just to resolve the role. We cache
 * only *successful* lookups (including a legitimate "no row" null) for a short TTL; failures/outages
 * are never cached so recovery is immediate. Mutations call {@link invalidateUserAuthCache}.
 */
const AUTH_CACHE_TTL_MS = 60_000;
type RoleResult = { role: string } | null;
type AuthMeResult = { role: string; group_id: number | null; group_name: string | null } | null;
const roleCache = new Map<string, { value: RoleResult; expiresAt: number }>();
const authMeCache = new Map<string, { value: AuthMeResult; expiresAt: number }>();

/** Drop cached role/authMe for a uid after a role/group/email change. */
export function invalidateUserAuthCache(uid: string): void {
  roleCache.delete(uid);
  authMeCache.delete(uid);
}

/** Get role for a Firebase UID (auth middleware). Cached per-uid for a short TTL. */
export async function getUserRole(uid: string): Promise<RoleResult> {
  const cached = roleCache.get(uid);
  if (cached && Date.now() < cached.expiresAt) return cached.value;
  if (!isSupabaseQueryAvailable()) return null;
  try {
    const { data, error } = await supabase!.from("user_roles").select("role").eq("firebase_uid", uid).maybeSingle();
    if (error) throw error;
    const value: RoleResult = data ? { role: data.role } : null;
    roleCache.set(uid, { value, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
    return value;
  } catch (e) {
    if (isNetworkFailure(e) || (e instanceof Error && e.message === "SUPABASE_UNAVAILABLE")) {
      openSupabaseCircuit(e);
      return null;
    }
    throw e;
  }
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
  invalidateUserAuthCache(params.firebase_uid);
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
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: normalizeRequiredInt(row.id, "invitation.id"),
    code: String(row.code ?? ""),
    role: String(row.role ?? ""),
    used: typeof row.used === "number" ? row.used : normalizeOptionalInt(row.used) ?? 0,
    email: row.email != null ? String(row.email) : null,
    group_id: normalizeOptionalInt(row.group_id),
    created_at: String(row.created_at ?? ""),
  };
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
  return {
    id: normalizeRequiredInt(data.id, "invitation.id"),
    code: data.code,
    role: data.role,
    group_id: normalizeOptionalInt(data.group_id),
  };
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
    id: normalizeRequiredInt(r.id, "invitations.id"),
    code: r.code,
    role: r.role,
    used: typeof r.used === "number" ? r.used : normalizeOptionalInt(r.used) ?? 0,
    email: r.email,
    created_at: r.created_at,
    group_id: normalizeOptionalInt(r.group_id),
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
  return (data ?? []).map((r: any) => ({
    id: normalizeRequiredInt(r.id, "groups.id"),
    name: r.name,
    created_at: r.created_at,
  }));
}

/** Insert group and return row. */
export async function insertGroup(name: string): Promise<GroupRow> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("groups").insert({ name }).select("id, name, created_at").single();
  if (error) {
    if (error.code === "23505") throw new Error("UNIQUE_GROUP_NAME");
    throw error;
  }
  return {
    id: normalizeRequiredInt(data.id, "groups.id"),
    name: data.name,
    created_at: data.created_at,
  };
}

/** Get auth/me row (role, group_id, group_name) for uid. Cached per-uid for a short TTL. */
export async function getAuthMe(uid: string): Promise<AuthMeResult> {
  const cached = authMeCache.get(uid);
  if (cached && Date.now() < cached.expiresAt) return cached.value;
  if (!isSupabaseQueryAvailable()) return null;
  try {
    const { data, error } = await supabase!
      .from("user_roles")
      .select("role, group_id, groups(name)")
      .eq("firebase_uid", uid)
      .maybeSingle();
    if (error) throw error;
    const value: AuthMeResult = data
      ? {
          role: data.role,
          group_id: normalizeOptionalInt(data.group_id),
          group_name: (data as any).groups?.name ?? null,
        }
      : null;
    authMeCache.set(uid, { value, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
    return value;
  } catch (e) {
    if (isNetworkFailure(e) || (e instanceof Error && e.message === "SUPABASE_UNAVAILABLE")) {
      openSupabaseCircuit(e);
      return null;
    }
    throw e;
  }
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
    group_id: normalizeOptionalInt(r.group_id),
    created_at: r.created_at,
    group_name: r.groups?.name ?? null,
  }));
}

/** Update user_roles.email for uid. */
export async function updateUserRoleEmail(uid: string, email: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("user_roles").update({ email }).eq("firebase_uid", uid);
  if (error) throw error;
  invalidateUserAuthCache(uid);
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
  invalidateUserAuthCache(uid);
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
