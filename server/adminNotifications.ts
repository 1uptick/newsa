import admin from "firebase-admin";
import * as db from "./db.js";

export async function getAdminEmailsForNotification(): Promise<string[]> {
  const emailOk = (e: string | null) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  try {
    const rows = await db.listUserRolesWithGroups();
    const adminRows = rows.filter((r) => r.role === "admin");
    const emails: string[] = [];
    for (const row of adminRows) {
      let email = row.email && emailOk(row.email) ? row.email : null;
      if (!email && row.firebase_uid && admin.apps?.length) {
        try {
          const userRecord = await admin.auth().getUser(row.firebase_uid);
          if (userRecord?.email && emailOk(userRecord.email)) {
            email = userRecord.email;
            await db.updateUserRoleEmail(row.firebase_uid, email);
          }
        } catch {
          // ignore per-user lookup failure
        }
      }
      if (email) emails.push(email);
    }
    return [...new Set(emails)];
  } catch (e) {
    console.error("getAdminEmailsForNotification:", e);
    return [];
  }
}
