import express from "express";
import admin from "firebase-admin";
import * as db from "./db.js";
import { config } from "./config.js";

/** Normalized brokerage group id for ATFX client routes (matches client `ATFX_GROUP_ID`). */
export const ATFX_GROUP_ID = "atfx";

/** Uids we already tried to persist as bootstrap admin (avoid upsert spam when DB is down). */
const bootstrapAdminPersistAttempted = new Set<string>();
let bootstrapUpsertFailedLogged = false;

/** True if this Firebase email is listed in INITIAL_ADMIN_EMAIL (comma-separated in env). */
function emailIsConfiguredInitialAdmin(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  const n = email.trim().toLowerCase();
  if (!n) return false;
  return config.initialAdminEmails.some((e) => e === n);
}

export async function authenticateToken(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!admin.apps?.length) {
    return res.status(503).json({ error: "Auth not configured", code: "NO_FIREBASE" });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized", code: "NO_TOKEN" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const uid = decoded.uid;
    const userEmail = decoded.email ?? null;

    let row: { role: string } | null = null;
    try {
      row = await db.getUserRole(uid);
    } catch (e) {
      console.error("[auth] getUserRole failed:", (e as Error)?.message ?? e);
    }
    let role = row?.role ?? null;

    // Bootstrap admins work offline when Supabase is unreachable (dev VPN/firewall/paused project).
    if (emailIsConfiguredInitialAdmin(userEmail) && role !== "admin") {
      role = "admin";
      if (db.isSupabaseQueryAvailable() && !bootstrapAdminPersistAttempted.has(uid)) {
        bootstrapAdminPersistAttempted.add(uid);
        try {
          await db.upsertUserRole({
            firebase_uid: uid,
            role: "admin",
            group_id: null,
            email: userEmail,
          });
        } catch (e) {
          if (!bootstrapUpsertFailedLogged) {
            bootstrapUpsertFailedLogged = true;
            console.error(
              "[auth] Could not persist bootstrap admin to Supabase — using admin for this session:",
              (e as Error)?.message ?? e
            );
          }
        }
      }
    }

    (req as any).uid = uid;
    (req as any).userEmail = userEmail;
    (req as any).role = role;
    next();
  } catch (_e) {
    return res.status(401).json({ error: "Invalid or expired token", code: "INVALID_TOKEN" });
  }
}

export function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if ((req as any).role !== "admin") {
    return res.status(403).json({ error: "Admin only", code: "FORBIDDEN" });
  }
  next();
}

function groupNameToId(groupName: string | null | undefined): string | null {
  if (!groupName || typeof groupName !== "string") return null;
  const id = groupName.toLowerCase().trim();
  return id || null;
}

/** ATFX portal routes: admin or client users in the ATFX group only. */
export async function requireAtfxAccess(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> {
  const role = (req as express.Request & { role?: string }).role;
  if (role === "admin") {
    next();
    return;
  }

  const uid = (req as express.Request & { uid?: string }).uid;
  if (!uid) {
    res.status(401).json({ error: "Unauthorized", code: "NO_UID" });
    return;
  }

  try {
    const row = await db.getAuthMe(uid);
    const groupId = groupNameToId(row?.group_name ?? null);
    if (role === "client" && groupId === ATFX_GROUP_ID) {
      next();
      return;
    }
  } catch (e) {
    console.error("[auth] requireAtfxAccess getAuthMe failed:", (e as Error)?.message ?? e);
  }

  res.status(403).json({ error: "ATFX access only", code: "FORBIDDEN_ATFX" });
}
