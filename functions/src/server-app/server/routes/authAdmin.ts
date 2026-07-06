import crypto from "node:crypto";
import express from "express";
import admin from "firebase-admin";
import nodemailer from "nodemailer";
import * as db from "../db.js";
import { authenticateToken, requireAdmin } from "../auth.js";
import { getBrokerageTokenBalance, groupNameToBrokerageId } from "../brokerageTokenBilling.js";

type SendResult = { sent: boolean; error?: string };
type TestResult = { ok: boolean; error?: string };

type RegisterAuthAdminRoutesDeps = {
  authLimiter: express.RequestHandler;
  forgotPasswordLimiter: express.RequestHandler;
  mailTransporter: nodemailer.Transporter | null;
  appBaseUrl: string;
  sendForgotPasswordEmail: (to: string, resetUrl: string) => Promise<SendResult>;
  sendInvitationEmail: (to: string, code: string, role: string) => Promise<SendResult>;
  sendTestEmail: (to: string) => Promise<TestResult>;
};

export function registerAuthAdminRoutes(apiRouter: express.Router, deps: RegisterAuthAdminRoutesDeps): void {
  const {
    authLimiter,
    forgotPasswordLimiter,
    mailTransporter,
    appBaseUrl,
    sendForgotPasswordEmail,
    sendInvitationEmail,
    sendTestEmail,
  } = deps;

  // SMTP status — admin only to avoid leaking config/connection details
  apiRouter.get("/smtp/status", authenticateToken, requireAdmin, async (_req, res) => {
    const configured = !!mailTransporter;
    if (!mailTransporter) {
      return res.json({
        configured: false,
        message: "SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env",
      });
    }
    try {
      await mailTransporter.verify();
      res.json({ configured: true, verified: true, message: "SMTP connection OK" });
    } catch (e: any) {
      res.status(500).json({
        configured: true,
        verified: false,
        message: "SMTP connection failed",
        error: e?.message || String(e),
      });
    }
  });

  // Auth status check (no token required) — use to verify Firebase is configured
  apiRouter.get("/auth/status", (_req, res) => {
    const firebaseAdminReady = Boolean(admin.apps?.length);
    res.json({
      firebaseAdmin: firebaseAdminReady,
      message: firebaseAdminReady ? "Firebase Admin ready" : "Firebase Admin not configured (check FIREBASE_SERVICE_ACCOUNT in .env)",
    });
  });

  apiRouter.post("/auth/verify-invitation", authLimiter, async (req, res) => {
    const { invitationCode } = req.body;
    const code = typeof invitationCode === "string" ? invitationCode.trim().toUpperCase() : "";
    const invitation = await db.getInvitationByCodeUnused(code);

    if (!invitation) {
      return res.status(400).json({ error: "Invalid or used invitation code" });
    }
    res.json({ success: true, role: invitation.role || "client" });
  });

  apiRouter.post("/auth/use-invitation", authLimiter, async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    let uid: string;
    let userEmail: string | null = null;
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      uid = decoded.uid;
      userEmail = decoded.email ?? null;
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }

    const { invitationCode } = req.body;
    const code = typeof invitationCode === "string" ? invitationCode.trim().toUpperCase() : "";
    const invitation = await db.getInvitationByCodeUnused(code);

    if (!invitation) {
      return res.status(400).json({ error: "Invalid or used invitation" });
    }
    const role = invitation.role || "client";
    const groupId = invitation.group_id ?? null;
    await db.markInvitationUsed(invitation.id);
    await db.upsertUserRole({ firebase_uid: uid, role, group_id: groupId, email: userEmail });
    res.json({ success: true, role, groupId });
  });

  // Forgot password: send branded email with reset link (no auth required)
  apiRouter.post("/auth/forgot-password", forgotPasswordLimiter, async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email address required" });
    }
    const message = "If an account exists with that email, we've sent you a link to reset your password.";
    if (!mailTransporter) {
      return res.status(503).json({ error: "Password reset email is not configured.", message });
    }
    if (!admin.apps?.length) {
      return res.status(503).json({ error: "Auth not configured.", message });
    }
    try {
      const user = await admin.auth().getUserByEmail(email).catch(() => null);
      if (!user) {
        console.log("Forgot-password: no Firebase user for this email (request still returns success for privacy).");
      } else {
        const token = crypto.randomBytes(32).toString("hex");
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
        await db.insertPasswordResetToken({ token, email, expires_at: expiresAt });
        const base = appBaseUrl.replace(/\/$/, "");
        const resetUrl = `${base}/reset-password?token=${encodeURIComponent(token)}`;
        const sendResult = await sendForgotPasswordEmail(email, resetUrl);
        if (!sendResult.sent) {
          console.error("Forgot-password email send failed:", sendResult.error);
          return res.status(503).json({
            error: "We couldn't send the password reset email. Please try again later or contact support.",
            message: message,
          });
        }
        console.log("Forgot-password: reset email sent successfully.");
      }
    } catch (e) {
      console.error("Forgot password error:", e);
      return res.status(500).json({
        error: "Something went wrong. Please try again later.",
        message: message,
      });
    }
    res.json({ success: true, message });
  });

  // Reset password with token from email link (no auth required)
  apiRouter.post("/auth/reset-password", authLimiter, async (req, res) => {
    const { token, newPassword } = req.body;
    const password = typeof newPassword === "string" ? newPassword.trim() : "";
    const tokenStr = typeof token === "string" ? token.trim() : "";
    if (!tokenStr || !password) {
      return res.status(400).json({ error: "Token and new password are required." });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters." });
    }
    if (!admin.apps?.length) {
      return res.status(503).json({ error: "Auth not configured." });
    }
    const row = await db.getPasswordResetToken(tokenStr);
    if (!row) {
      return res.status(400).json({ error: "Invalid or expired reset link. Please request a new one." });
    }
    if (new Date(row.expires_at) < new Date()) {
      await db.deletePasswordResetToken(tokenStr);
      return res.status(400).json({ error: "This reset link has expired. Please request a new one." });
    }
    try {
      const user = await admin.auth().getUserByEmail(row.email);
      await admin.auth().updateUser(user.uid, { password });
      await db.deletePasswordResetToken(tokenStr);
      res.json({ success: true, message: "Password updated. You can sign in with your new password." });
    } catch (e: any) {
      console.error("Reset password error:", e);
      res.status(500).json({ error: e?.message || "Failed to update password." });
    }
  });

  apiRouter.get("/auth/me", authenticateToken, async (req, res) => {
    const uid = (req as any).uid;
    const role = (req as any).role as string | null;
    const email = (req as any).userEmail as string | null;
    const row = await db.getAuthMe(uid);
    res.json({
      uid,
      email,
      role,
      groupId: row?.group_id ?? null,
      groupName: row?.group_name ?? null,
    });
  });

  apiRouter.get("/admin/groups", authenticateToken, requireAdmin, async (_req, res) => {
    const rows = await db.listGroups();
    res.json(rows);
  });

  apiRouter.post("/admin/groups", authenticateToken, requireAdmin, async (req, res) => {
    const { name } = req.body;
    const nameStr = typeof name === "string" ? name.trim() : "";
    if (!nameStr) {
      return res.status(400).json({ error: "Group name is required" });
    }
    try {
      const row = await db.insertGroup(nameStr);
      res.status(201).json(row);
    } catch (e: any) {
      if (e?.message === "UNIQUE_GROUP_NAME") {
        return res.status(400).json({ error: "A group with this name already exists" });
      }
      throw e;
    }
  });

  apiRouter.post("/admin/invite", authenticateToken, requireAdmin, async (req, res) => {
    const { role = "client", email, groupId } = req.body;
    const r = role === "admin" ? "admin" : "client";
    const gid = groupId != null && Number.isInteger(Number(groupId)) ? Number(groupId) : null;
    if (r !== "admin" && gid == null) {
      return res.status(400).json({ error: "User group is required for client invitations" });
    }
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    const emailStr = typeof email === "string" ? email.trim() : null;
    const row = await db.insertInvitation({ code, role: r, email: emailStr, group_id: gid });
    let emailSent = false;
    let emailError: string | undefined;
    if (emailStr && mailTransporter) {
      const sendResult = await sendInvitationEmail(emailStr, code, r);
      emailSent = sendResult.sent;
      if (!sendResult.sent) emailError = sendResult.error;
    }
    res.json({ code: row.code, role: r, email: emailStr, emailSent, emailError: emailError ?? null, groupId: row.group_id ?? null });
  });

  apiRouter.get("/admin/invitations", authenticateToken, requireAdmin, async (_req, res) => {
    const rows = await db.listInvitations();
    res.json(rows);
  });

  apiRouter.delete("/admin/invitations/:id", authenticateToken, requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: "Invalid invitation id" });
    }
    const deleted = await db.deleteInvitation(id);
    if (!deleted) {
      return res.status(404).json({ error: "Invitation not found" });
    }
    res.json({ ok: true, deleted: id });
  });

  apiRouter.get("/admin/users", authenticateToken, requireAdmin, async (_req, res) => {
    const rows = await db.listUserRolesWithGroups();
    const result = rows.map((r) => ({
      ...r,
      last_login: null as string | null,
      tokens_remaining: null as number | null,
      tokens_limit: null as number | null,
    }));

    const brokerageIds = new Set<string>();
    for (const row of result) {
      const brokerageId = groupNameToBrokerageId(row.group_name);
      if (brokerageId) brokerageIds.add(brokerageId);
    }

    const balances = new Map<string, { remaining: number; limit: number }>();
    await Promise.all(
      [...brokerageIds].map(async (brokerageId) => {
        try {
          const balance = await getBrokerageTokenBalance(brokerageId);
          balances.set(brokerageId, { remaining: balance.remaining, limit: balance.limit });
        } catch {
          // unknown or misconfigured brokerage
        }
      })
    );

    for (const row of result) {
      const brokerageId = groupNameToBrokerageId(row.group_name);
      if (!brokerageId) continue;
      const balance = balances.get(brokerageId);
      if (!balance) continue;
      row.tokens_remaining = balance.remaining;
      row.tokens_limit = balance.limit;
    }

    if (admin.apps?.length) {
      for (const row of result) {
        if (row.firebase_uid) {
          try {
            const userRecord = await admin.auth().getUser(row.firebase_uid);
            if (!row.email && userRecord?.email) {
              row.email = userRecord.email;
              await db.updateUserRoleEmail(row.firebase_uid, userRecord.email);
            }
            row.last_login = userRecord?.metadata?.lastSignInTime ?? null;
          } catch {
            row.last_login = null;
          }
        }
      }
    }
    res.json(result);
  });

  apiRouter.delete("/admin/users/:uid", authenticateToken, requireAdmin, async (req, res) => {
    const uid = typeof req.params.uid === "string" ? req.params.uid.trim() : "";
    if (!uid) {
      return res.status(400).json({ error: "Invalid user id" });
    }
    const currentUid = (req as any).uid;
    if (uid === currentUid) {
      return res.status(400).json({ error: "You cannot delete your own account" });
    }
    const row = await db.getUserRoleByUid(uid);
    if (!row) {
      return res.status(404).json({ error: "User not found" });
    }
    try {
      if (admin.apps?.length) {
        await admin.auth().deleteUser(uid);
      }
    } catch (e: any) {
      console.error("Firebase deleteUser error:", e);
      return res.status(500).json({
        error: e?.message?.includes("not found") ? "User not found in auth" : "Failed to delete user from authentication",
      });
    }
    await db.deleteUserRole(uid);
    res.json({ ok: true, deleted: uid });
  });

  apiRouter.post("/admin/send-test-email", authenticateToken, requireAdmin, async (req, res) => {
    const { to } = req.body;
    const email = typeof to === "string" ? to.trim() : null;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Valid email address required" });
    }
    const result = await sendTestEmail(email);
    if (result.ok) {
      res.json({ success: true, message: "Test email sent to " + email });
    } else {
      res.status(500).json({ error: result.error || "Failed to send" });
    }
  });
}
