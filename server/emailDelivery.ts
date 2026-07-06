import type { Transporter } from "nodemailer";
import {
  buildAdminTopicApprovedEmailHtml,
  buildAdminTopicDirectionEmailHtml,
  buildAdminTopicRejectedEmailHtml,
  buildArticlesNotificationEmailHtml,
  buildForgotPasswordEmailHtml,
  buildInvitationEmailHtml,
  buildTestEmailHtml,
  buildTopicApprovedEmailHtml,
} from "./emailTemplates.js";

export type EmailDelivery = {
  sendForgotPasswordEmail: (to: string, resetUrl: string) => Promise<{ sent: boolean; error?: string }>;
  sendInvitationEmail: (to: string, code: string, role: string) => Promise<{ sent: boolean; error?: string }>;
  sendTestEmail: (to: string) => Promise<{ ok: boolean; error?: string }>;
  sendTopicApprovedEmail: (
    to: string,
    topicTitle: string,
    topicSummary: string
  ) => Promise<{ sent: boolean; error?: string }>;
  sendAdminTopicApprovedEmail: (
    to: string,
    topicTitle: string,
    topicSummary: string
  ) => Promise<{ sent: boolean; error?: string }>;
  sendAdminTopicRejectedEmail: (
    to: string,
    topicTitle: string,
    topicSummary: string
  ) => Promise<{ sent: boolean; error?: string }>;
  sendAdminTopicDirectionEmail: (
    to: string,
    directionText: string,
    fromEmail?: string
  ) => Promise<{ sent: boolean; error?: string }>;
  sendArticlesNotificationEmail: (to: string, articleTitle?: string) => Promise<{ sent: boolean; error?: string }>;
  sendAtfxArticlesNotificationEmail: (to: string, articleTitle?: string) => Promise<{ sent: boolean; error?: string }>;
  sendCustomEmail: (to: string, subject: string, text: string, html: string) => Promise<{ sent: boolean; error?: string }>;
};

export function createEmailDelivery(opts: {
  mailTransporter: Transporter | null;
  smtpFrom: string;
  appBaseUrl: string;
}): EmailDelivery {
  const { mailTransporter, smtpFrom, appBaseUrl } = opts;

  return {
    async sendForgotPasswordEmail(to: string, resetUrl: string) {
      if (!mailTransporter) return { sent: false, error: "SMTP not configured" };
      const subject = "Reset your password – Newsa.io";
      const text = `You requested a password reset for your Newsa.io account.

Reset your password by visiting this link (expires in 1 hour):
${resetUrl}

If you didn't request this, you can safely ignore this email. Your password will not be changed.

— The Newsa.io team`;
      const html = buildForgotPasswordEmailHtml(resetUrl);
      try {
        await mailTransporter.sendMail({ from: smtpFrom, to, subject, text, html });
        return { sent: true };
      } catch (e: any) {
        const msg = e?.message || String(e);
        console.error("Failed to send forgot-password email to", to, msg);
        return { sent: false, error: msg };
      }
    },

    async sendInvitationEmail(to: string, code: string, role: string) {
      if (!mailTransporter) return { sent: false, error: "SMTP not configured" };
      const base = appBaseUrl.replace(/\/$/, "");
      const registerUrl = `${base}/register?code=${encodeURIComponent(code)}&email=${encodeURIComponent(to)}`;
      const subject = "You're invited to Newsa.io";
      const text = `You've been invited to join Newsa.io — your platform for financial content and market intelligence.

Create your account and get started here:
${registerUrl}

Invitation code: ${code}
(You may need this when you register.)

If you didn't expect this email, you can safely ignore it.

We look forward to having you.
— The Newsa.io team`;
      const html = buildInvitationEmailHtml(registerUrl, code, role);
      try {
        await mailTransporter.sendMail({ from: smtpFrom, to, subject, text, html });
        return { sent: true };
      } catch (e: any) {
        const msg = e?.message || String(e);
        console.error("Failed to send invitation email to", to, msg);
        return { sent: false, error: msg };
      }
    },

    async sendTestEmail(to: string) {
      if (!mailTransporter) return { ok: false, error: "SMTP not configured" };
      try {
        await mailTransporter.sendMail({
          from: smtpFrom,
          to,
          subject: "Newsa – SMTP test",
          text: "This is a test email from your Newsa app. SMTP is working.",
          html: buildTestEmailHtml(),
        });
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e?.message || String(e) };
      }
    },

    async sendTopicApprovedEmail(to: string, topicTitle: string, topicSummary: string) {
      if (!mailTransporter) return { sent: false, error: "SMTP not configured" };
      const base = appBaseUrl.replace(/\/$/, "");
      const loginUrl = `${base}/login`;
      const subject =
        "Topic review: " + (topicTitle?.slice(0, 60) || "Capital") + (topicTitle && topicTitle.length > 60 ? "…" : "");
      const text = `A topic has been approved in Topics for Capital.\n\nTopic: ${topicTitle || "—"}\n\nDescription: ${topicSummary || "No description."}\n\nSign in to view and continue:\n${loginUrl}\n\n— Newsa.io`;
      const html = buildTopicApprovedEmailHtml(loginUrl, topicTitle || "", topicSummary || "");
      try {
        await mailTransporter.sendMail({ from: smtpFrom, to, subject, text, html });
        return { sent: true };
      } catch (e: any) {
        const msg = e?.message || String(e);
        console.error("Failed to send topic-approved email to", to, msg);
        return { sent: false, error: msg };
      }
    },

    async sendAdminTopicApprovedEmail(to: string, topicTitle: string, topicSummary: string) {
      if (!mailTransporter) return { sent: false, error: "SMTP not configured" };
      const base = appBaseUrl.replace(/\/$/, "");
      const loginUrl = `${base}/login`;
      const subject =
        "Topic approved: " + (topicTitle?.slice(0, 60) || "Capital") + (topicTitle && topicTitle.length > 60 ? "…" : "");
      const text = `A topic has been approved in Topics for Capital.\n\nTopic: ${topicTitle || "—"}\n\nDescription: ${topicSummary || "No description."}\n\nView in portal: ${loginUrl}\n\n— Newsa.io`;
      const html = buildAdminTopicApprovedEmailHtml(loginUrl, topicTitle || "", topicSummary || "");
      try {
        await mailTransporter.sendMail({ from: smtpFrom, to, subject, text, html });
        return { sent: true };
      } catch (e: any) {
        const msg = e?.message || String(e);
        console.error("Failed to send admin topic-approved email to", to, msg);
        return { sent: false, error: msg };
      }
    },

    async sendAdminTopicRejectedEmail(to: string, topicTitle: string, topicSummary: string) {
      if (!mailTransporter) return { sent: false, error: "SMTP not configured" };
      const base = appBaseUrl.replace(/\/$/, "");
      const loginUrl = `${base}/login`;
      const subject =
        "Topic rejected: " + (topicTitle?.slice(0, 60) || "Capital") + (topicTitle && topicTitle.length > 60 ? "…" : "");
      const text = `A topic has been rejected in Topics for Capital.\n\nTopic: ${topicTitle || "—"}\n\nDescription: ${topicSummary || "No description."}\n\nView in portal: ${loginUrl}\n\n— Newsa.io`;
      const html = buildAdminTopicRejectedEmailHtml(loginUrl, topicTitle || "", topicSummary || "");
      try {
        await mailTransporter.sendMail({ from: smtpFrom, to, subject, text, html });
        return { sent: true };
      } catch (e: any) {
        const msg = e?.message || String(e);
        console.error("Failed to send admin topic-rejected email to", to, msg);
        return { sent: false, error: msg };
      }
    },

    async sendAdminTopicDirectionEmail(to: string, directionText: string, fromEmail?: string) {
      if (!mailTransporter) return { sent: false, error: "SMTP not configured" };
      const base = appBaseUrl.replace(/\/$/, "");
      const loginUrl = `${base}/login`;
      const dirTrim = typeof directionText === "string" ? directionText.trim().slice(0, 400) : "";
      const subject = dirTrim ? `Topic direction suggestion: ${dirTrim}${dirTrim.length >= 400 ? "…" : ""}` : "Topic direction suggestion";
      const fromLine = fromEmail ? `From: ${fromEmail}\n\n` : "";
      const text = `${fromLine}A user submitted a suggested new direction for upcoming topics:\n\n${(directionText || "").trim() || "—"}\n\nView in portal: ${loginUrl}\n\n— Newsa.io`;
      const html = buildAdminTopicDirectionEmailHtml(loginUrl, { fromEmail, directionText: directionText || "" });
      try {
        await mailTransporter.sendMail({ from: smtpFrom, to, subject, text, html });
        return { sent: true };
      } catch (e: any) {
        const msg = e?.message || String(e);
        console.error("Failed to send admin topic-direction email to", to, msg);
        return { sent: false, error: msg };
      }
    },

    async sendArticlesNotificationEmail(to: string, articleTitle?: string) {
      if (!mailTransporter) return { sent: false, error: "SMTP not configured" };
      const base = appBaseUrl.replace(/\/$/, "");
      const loginUrl = `${base}/login`;
      const titleTrim = typeof articleTitle === "string" ? articleTitle.trim().slice(0, 80) : "";
      const subject = titleTrim
        ? `Capital Articles: ${titleTrim}${titleTrim.length >= 80 ? "…" : ""}`
        : "Capital Articles – new content in the portal";
      const textIntro = titleTrim
        ? `A new article is available in the portal and is ready for your review.\n\nArticle: ${titleTrim}\n\n`
        : "New article content is now available in the portal and is ready for your review.\n\n";
      const text = `${textIntro}Sign in to view: ${loginUrl}\n\n— Newsa.io`;
      const html = buildArticlesNotificationEmailHtml(loginUrl, articleTitle || "");
      try {
        await mailTransporter.sendMail({ from: smtpFrom, to, subject, text, html });
        return { sent: true };
      } catch (e: any) {
        const msg = e?.message || String(e);
        console.error("Failed to send articles notification to", to, msg);
        return { sent: false, error: msg };
      }
    },

    async sendAtfxArticlesNotificationEmail(to: string, articleTitle?: string) {
      if (!mailTransporter) return { sent: false, error: "SMTP not configured" };
      const base = appBaseUrl.replace(/\/$/, "");
      const loginUrl = `${base}/login`;
      const titleTrim = typeof articleTitle === "string" ? articleTitle.trim().slice(0, 80) : "";
      const subject = titleTrim
        ? `ATFX Articles: ${titleTrim}${titleTrim.length >= 80 ? "…" : ""}`
        : "ATFX Articles – new content in the portal";
      const textIntro = titleTrim
        ? `A new article is available in the ATFX portal and is ready for your review.\n\nArticle: ${titleTrim}\n\n`
        : "New article content is now available in the ATFX portal and is ready for your review.\n\n";
      const text = `${textIntro}Sign in to view: ${loginUrl}\n\n— Newsa.io`;
      const html = buildArticlesNotificationEmailHtml(loginUrl, articleTitle || "").replace(/Capital Articles/g, "ATFX Articles");
      try {
        await mailTransporter.sendMail({ from: smtpFrom, to, subject, text, html });
        return { sent: true };
      } catch (e: any) {
        const msg = e?.message || String(e);
        console.error("Failed to send ATFX articles notification to", to, msg);
        return { sent: false, error: msg };
      }
    },

    async sendCustomEmail(to: string, subject: string, text: string, html: string) {
      if (!mailTransporter) return { sent: false, error: "SMTP not configured" };
      try {
        await mailTransporter.sendMail({ from: smtpFrom, to, subject, text, html });
        return { sent: true };
      } catch (e: any) {
        const msg = e?.message || String(e);
        console.error("Failed to send custom email to", to, msg);
        return { sent: false, error: msg };
      }
    },
  };
}
