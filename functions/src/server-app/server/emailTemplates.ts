/** Pure HTML builders for transactional email (no I/O). */

const EMAIL_PRIMARY = "#ff7900";
const EMAIL_BG = "#ffffff";
const EMAIL_TEXT = "#1e293b";
const EMAIL_TEXT_MUTED = "#64748b";
const EMAIL_LINK = "#ff7900";
const EMAIL_HEADER_BG = "#1b1b1d";
const EMAIL_FOOTER_BG = "#1b1b1d";
const EMAIL_FOOTER_TEXT = "#ffffff";
const EMAIL_BUTTON_GRADIENT = "linear-gradient(to right, #ff7900, #facc15)";

const EMAIL_HEADER_LOGO_URL = "https://newsa.io/wp-content/uploads/2026/03/newsa-app-logo.png";
const EMAIL_HEADER_LOGO_HEIGHT = 44;
const EMAIL_HEADER_LOGO_MAX_WIDTH = 200;
const EMAIL_HEADER_LINK = "https://portal.newsa.io";

export function buildInvitationEmailHtml(registerUrl: string, code: string, _role: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're invited to Newsa</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen-Sans,Ubuntu,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background-color:${EMAIL_BG};border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.07);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 24px;background-color:${EMAIL_HEADER_BG};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <a href="${EMAIL_HEADER_LINK}" style="display:inline-block;text-decoration:none;">
                      <img src="${EMAIL_HEADER_LOGO_URL}" alt="Newsa" style="display:block;height:${EMAIL_HEADER_LOGO_HEIGHT}px;width:auto;max-width:${EMAIL_HEADER_LOGO_MAX_WIDTH}px;object-fit:contain;" />
                    </a>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="font-size:14px;font-weight:600;color:#ffffff;">Invitation</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${EMAIL_TEXT};">
                You've been invited to join <strong>Newsa.io</strong> — your platform for financial content and market intelligence.
              </p>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${EMAIL_TEXT};">
                Click the button below to create your account and get started.
              </p>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:${EMAIL_TEXT_MUTED};">
                Invitation code: <strong style="color:${EMAIL_TEXT};">${code}</strong> (you may need this when you register). If you didn't expect this email, you can safely ignore it.
              </p>
              <p style="margin:0 0 20px;font-size:16px;color:${EMAIL_TEXT};">We look forward to having you.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                <tr>
                  <td>
                    <a href="${registerUrl}" style="display:inline-block;padding:14px 28px;background:${EMAIL_BUTTON_GRADIENT};background-color:${EMAIL_PRIMARY};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Accept invitation &amp; register</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:${EMAIL_TEXT_MUTED};">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:8px 0 0;">
                <a href="${registerUrl}" style="font-size:13px;color:${EMAIL_LINK};word-break:break-all;">${registerUrl}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:${EMAIL_FOOTER_BG};">
              <p style="margin:0;font-size:12px;color:${EMAIL_FOOTER_TEXT};"><a href="https://newsa.io" style="color:${EMAIL_FOOTER_TEXT};text-decoration:none;">Newsa.io</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildForgotPasswordEmailHtml(resetUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password – Newsa.io</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen-Sans,Ubuntu,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background-color:${EMAIL_BG};border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.07);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:28px 32px 24px;background-color:${EMAIL_HEADER_BG};">
              <a href="${EMAIL_HEADER_LINK}" style="display:inline-block;text-decoration:none;">
                <img src="${EMAIL_HEADER_LOGO_URL}" alt="Newsa" style="display:block;height:${EMAIL_HEADER_LOGO_HEIGHT}px;width:auto;max-width:${EMAIL_HEADER_LOGO_MAX_WIDTH}px;object-fit:contain;" />
              </a>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${EMAIL_TEXT};">
                You requested a password reset for your <strong>Newsa.io</strong> account.
              </p>
              <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:${EMAIL_TEXT};">
                Click the button below to set a new password. This link expires in 1 hour.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                <tr>
                  <td>
                    <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;background:${EMAIL_BUTTON_GRADIENT};background-color:${EMAIL_PRIMARY};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Reset password</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:${EMAIL_TEXT_MUTED};">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:8px 0 0;">
                <a href="${resetUrl}" style="font-size:13px;color:${EMAIL_LINK};word-break:break-all;">${resetUrl}</a>
              </p>
              <p style="margin:24px 0 0;font-size:13px;color:${EMAIL_TEXT_MUTED};">
                If you didn't request this, you can safely ignore this email. Your password will not be changed.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:${EMAIL_FOOTER_BG};">
              <p style="margin:0;font-size:12px;color:${EMAIL_FOOTER_TEXT};"><a href="https://newsa.io" style="color:${EMAIL_FOOTER_TEXT};text-decoration:none;">Newsa.io</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildTestEmailHtml(): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Newsa – SMTP test</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen-Sans,Ubuntu,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background-color:${EMAIL_BG};border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.07);overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 24px;background-color:${EMAIL_HEADER_BG};">
              <a href="${EMAIL_HEADER_LINK}" style="display:inline-block;text-decoration:none;">
                <img src="${EMAIL_HEADER_LOGO_URL}" alt="Newsa" style="display:block;height:${EMAIL_HEADER_LOGO_HEIGHT}px;width:auto;max-width:${EMAIL_HEADER_LOGO_MAX_WIDTH}px;object-fit:contain;" />
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0;font-size:16px;line-height:1.6;color:${EMAIL_TEXT};">
                This is a test email from your <strong>Newsa.io</strong> app. SMTP is working.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:${EMAIL_FOOTER_BG};">
              <p style="margin:0;font-size:12px;color:${EMAIL_FOOTER_TEXT};"><a href="https://newsa.io" style="color:${EMAIL_FOOTER_TEXT};text-decoration:none;">Newsa.io</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildTopicApprovedEmailHtml(loginUrl: string, topicTitle: string, topicSummary: string): string {
  const summary = topicSummary || "No description provided.";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Topic review – Newsa.io Capital</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen-Sans,Ubuntu,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:${EMAIL_BG};border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.07);overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 24px;background-color:${EMAIL_HEADER_BG};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <a href="${EMAIL_HEADER_LINK}" style="display:inline-block;text-decoration:none;">
                      <img src="${EMAIL_HEADER_LOGO_URL}" alt="Newsa" style="display:block;height:${EMAIL_HEADER_LOGO_HEIGHT}px;width:auto;max-width:${EMAIL_HEADER_LOGO_MAX_WIDTH}px;object-fit:contain;" />
                    </a>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="font-size:14px;font-weight:600;color:#ffffff;">Topic review</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${EMAIL_TEXT};">
                A new topic has been prepared and is awaiting your review.
              </p>
              <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:${EMAIL_TEXT};">
                Topic
              </p>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:${EMAIL_TEXT};">
                ${topicTitle.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
              </p>
              <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:${EMAIL_TEXT};">
                Description
              </p>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:${EMAIL_TEXT_MUTED};">
                ${summary.replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 500)}${summary.length > 500 ? "…" : ""}
              </p>
              <p style="margin:0 0 20px;font-size:15px;color:${EMAIL_TEXT};">
                Sign in to the portal to view details and continue.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                <tr>
                  <td>
                    <a href="${loginUrl}" style="display:inline-block;padding:14px 28px;background:${EMAIL_BUTTON_GRADIENT};background-color:${EMAIL_PRIMARY};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Sign in to Newsa</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:${EMAIL_TEXT_MUTED};">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:8px 0 0;">
                <a href="${loginUrl}" style="font-size:13px;color:${EMAIL_LINK};word-break:break-all;">${loginUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:${EMAIL_FOOTER_BG};">
              <p style="margin:0;font-size:12px;color:${EMAIL_FOOTER_TEXT};"><a href="https://newsa.io" style="color:${EMAIL_FOOTER_TEXT};text-decoration:none;">Newsa.io</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function escapeHtml(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildTopicApprovedBatchEmailHtml(params: {
  loginUrl: string;
  topics: { title: string; summary?: string; socialHook?: string }[];
  customMessageHtml?: string;
}): string {
  const { loginUrl, topics, customMessageHtml } = params;
  const safeTopics = (Array.isArray(topics) ? topics : []).slice(0, 20);
  const listHtml = safeTopics
    .map((t) => {
      const title = escapeHtml(t?.title || "—");
      const hookRaw = (t?.socialHook || t?.summary || "").trim();
      const hook = escapeHtml(hookRaw || "No description provided.").slice(0, 260) + (hookRaw.length > 260 ? "…" : "");
      return `
        <tr>
          <td style="padding:14px 0;border-bottom:1px solid #e2e8f0;">
            <p style="margin:0 0 6px;font-size:15px;font-weight:700;line-height:1.35;color:${EMAIL_TEXT};">${title}</p>
            <p style="margin:0;font-size:13px;line-height:1.5;color:${EMAIL_TEXT_MUTED};">${hook}</p>
          </td>
        </tr>`;
    })
    .join("");

  /** Optional note: same typography as body copy, no callout box. */
  const messageBlock = customMessageHtml
    ? `<div style="margin:18px 0 0;font-size:16px;line-height:1.6;color:${EMAIL_TEXT};">${customMessageHtml}</div>`
    : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Topic review – Newsa.io Capital</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen-Sans,Ubuntu,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:${EMAIL_BG};border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.07);overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 24px;background-color:${EMAIL_HEADER_BG};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <a href="${EMAIL_HEADER_LINK}" style="display:inline-block;text-decoration:none;">
                      <img src="${EMAIL_HEADER_LOGO_URL}" alt="Newsa" style="display:block;height:${EMAIL_HEADER_LOGO_HEIGHT}px;width:auto;max-width:${EMAIL_HEADER_LOGO_MAX_WIDTH}px;object-fit:contain;" />
                    </a>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="font-size:14px;font-weight:600;color:#ffffff;">Topic review</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 14px;font-size:16px;line-height:1.6;color:${EMAIL_TEXT};">
                Dear {{USER_NAME}},
              </p>
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${EMAIL_TEXT};">
                New topic proposals have been approved in Topics for Capital and are ready for your review.
              </p>
              <p style="margin:0 0 10px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${EMAIL_TEXT_MUTED};font-weight:700;">
                Pending topics (${safeTopics.length})
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                ${listHtml}
              </table>
              ${messageBlock}
              <p style="margin:18px 0 20px;font-size:15px;color:${EMAIL_TEXT};">
                Sign in to the portal to view details and continue.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                <tr>
                  <td>
                    <a href="${loginUrl}" style="display:inline-block;padding:14px 28px;background:${EMAIL_BUTTON_GRADIENT};background-color:${EMAIL_PRIMARY};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Sign in to Newsa</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:${EMAIL_TEXT_MUTED};">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:8px 0 0;">
                <a href="${loginUrl}" style="font-size:13px;color:${EMAIL_LINK};word-break:break-all;">${loginUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:${EMAIL_FOOTER_BG};">
              <p style="margin:0;font-size:12px;color:${EMAIL_FOOTER_TEXT};"><a href="https://newsa.io" style="color:${EMAIL_FOOTER_TEXT};text-decoration:none;">Newsa.io</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildAdminTopicApprovedEmailHtml(loginUrl: string, topicTitle: string, topicSummary: string): string {
  const summary = topicSummary || "No description provided.";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Topic approved – Newsa.io Capital</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen-Sans,Ubuntu,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:${EMAIL_BG};border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.07);overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 24px;background-color:${EMAIL_HEADER_BG};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <a href="${EMAIL_HEADER_LINK}" style="display:inline-block;text-decoration:none;">
                      <img src="${EMAIL_HEADER_LOGO_URL}" alt="Newsa" style="display:block;height:${EMAIL_HEADER_LOGO_HEIGHT}px;width:auto;max-width:${EMAIL_HEADER_LOGO_MAX_WIDTH}px;object-fit:contain;" />
                    </a>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="font-size:14px;font-weight:600;color:#22c55e;">Approved</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${EMAIL_TEXT};">
                A topic has been <strong>approved</strong> in Topics for Capital.
              </p>
              <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:${EMAIL_TEXT};">Topic</p>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:${EMAIL_TEXT};">
                ${(topicTitle || "—").replace(/</g, "&lt;").replace(/>/g, "&gt;")}
              </p>
              <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:${EMAIL_TEXT};">Description</p>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:${EMAIL_TEXT_MUTED};">
                ${summary.replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 500)}${summary.length > 500 ? "…" : ""}
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                <tr>
                  <td>
                    <a href="${loginUrl}" style="display:inline-block;padding:14px 28px;background:${EMAIL_BUTTON_GRADIENT};background-color:${EMAIL_PRIMARY};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">View in portal</a>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;"><a href="${loginUrl}" style="font-size:13px;color:${EMAIL_LINK};word-break:break-all;">${loginUrl}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:${EMAIL_FOOTER_BG};">
              <p style="margin:0;font-size:12px;color:${EMAIL_FOOTER_TEXT};"><a href="https://newsa.io" style="color:${EMAIL_FOOTER_TEXT};text-decoration:none;">Newsa.io</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildAdminTopicRejectedEmailHtml(loginUrl: string, topicTitle: string, topicSummary: string): string {
  const summary = topicSummary || "No description provided.";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Topic rejected – Newsa.io Capital</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen-Sans,Ubuntu,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:${EMAIL_BG};border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.07);overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 24px;background-color:${EMAIL_HEADER_BG};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <a href="${EMAIL_HEADER_LINK}" style="display:inline-block;text-decoration:none;">
                      <img src="${EMAIL_HEADER_LOGO_URL}" alt="Newsa" style="display:block;height:${EMAIL_HEADER_LOGO_HEIGHT}px;width:auto;max-width:${EMAIL_HEADER_LOGO_MAX_WIDTH}px;object-fit:contain;" />
                    </a>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="font-size:14px;font-weight:600;color:#ef4444;">Rejected</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${EMAIL_TEXT};">
                A topic has been <strong>rejected</strong> in Topics for Capital.
              </p>
              <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:${EMAIL_TEXT};">Topic</p>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:${EMAIL_TEXT};">
                ${(topicTitle || "—").replace(/</g, "&lt;").replace(/>/g, "&gt;")}
              </p>
              <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:${EMAIL_TEXT};">Description</p>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:${EMAIL_TEXT_MUTED};">
                ${summary.replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 500)}${summary.length > 500 ? "…" : ""}
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                <tr>
                  <td>
                    <a href="${loginUrl}" style="display:inline-block;padding:14px 28px;background:${EMAIL_BUTTON_GRADIENT};background-color:${EMAIL_PRIMARY};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">View in portal</a>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;"><a href="${loginUrl}" style="font-size:13px;color:${EMAIL_LINK};word-break:break-all;">${loginUrl}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:${EMAIL_FOOTER_BG};">
              <p style="margin:0;font-size:12px;color:${EMAIL_FOOTER_TEXT};"><a href="https://newsa.io" style="color:${EMAIL_FOOTER_TEXT};text-decoration:none;">Newsa.io</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildAdminTopicDirectionEmailHtml(loginUrl: string, opts: { fromEmail?: string; directionText: string }): string {
  const fromEmail = (opts.fromEmail || "").trim();
  const direction = (opts.directionText || "").trim();
  const directionEscaped = direction.replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 1500);
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New topic direction – Newsa.io</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen-Sans,Ubuntu,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:${EMAIL_BG};border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.07);overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 24px;background-color:${EMAIL_HEADER_BG};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <a href="${EMAIL_HEADER_LINK}" style="display:inline-block;text-decoration:none;">
                      <img src="${EMAIL_HEADER_LOGO_URL}" alt="Newsa" style="display:block;height:${EMAIL_HEADER_LOGO_HEIGHT}px;width:auto;max-width:${EMAIL_HEADER_LOGO_MAX_WIDTH}px;object-fit:contain;" />
                    </a>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="font-size:14px;font-weight:600;color:#ffffff;">Topic direction</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 10px;font-size:16px;line-height:1.6;color:${EMAIL_TEXT};">
                A user submitted a suggested <strong>new direction</strong> for upcoming topics.
              </p>
              ${fromEmail ? `<p style="margin:0 0 18px;font-size:13px;color:${EMAIL_TEXT_MUTED};">From: <strong style="color:${EMAIL_TEXT};">${fromEmail.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</strong></p>` : ""}
              <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:${EMAIL_TEXT};">Suggestion</p>
              <div style="margin:0 0 22px;padding:14px 14px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;color:${EMAIL_TEXT};font-size:14px;line-height:1.6;white-space:pre-wrap;">${directionEscaped || "—"}</div>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:18px 0 0;">
                <tr>
                  <td>
                    <a href="${loginUrl}" style="display:inline-block;padding:12px 22px;background:${EMAIL_BUTTON_GRADIENT};background-color:${EMAIL_PRIMARY};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">Open portal</a>
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0;"><a href="${loginUrl}" style="font-size:13px;color:${EMAIL_LINK};word-break:break-all;">${loginUrl}</a></p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:${EMAIL_FOOTER_BG};">
              <p style="margin:0;font-size:12px;color:${EMAIL_FOOTER_TEXT};"><a href="https://newsa.io" style="color:${EMAIL_FOOTER_TEXT};text-decoration:none;">Newsa.io</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildArticlesNotificationEmailHtml(loginUrl: string, articleTitle?: string): string {
  const titleEscaped = articleTitle ? (articleTitle || "").replace(/</g, "&lt;").replace(/>/g, "&gt;").slice(0, 200) : "";
  const pageTitle = titleEscaped ? `Capital Articles: ${titleEscaped} – Newsa.io` : "Capital Articles – Newsa.io";
  const introLine = titleEscaped
    ? `A new article is available in the portal and is ready for your review.`
    : "New article content is now available in the portal and is ready for your review.";
  const titleBlock = titleEscaped
    ? `<p style="margin:0 0 8px;font-size:14px;font-weight:600;color:${EMAIL_TEXT};">Article</p><p style="margin:0 0 20px;font-size:16px;line-height:1.5;color:${EMAIL_TEXT};">${titleEscaped}</p>`
    : "";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen-Sans,Ubuntu,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background-color:${EMAIL_BG};border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.07);overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 24px;background-color:${EMAIL_HEADER_BG};">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <a href="${EMAIL_HEADER_LINK}" style="display:inline-block;text-decoration:none;">
                      <img src="${EMAIL_HEADER_LOGO_URL}" alt="Newsa" style="display:block;height:${EMAIL_HEADER_LOGO_HEIGHT}px;width:auto;max-width:${EMAIL_HEADER_LOGO_MAX_WIDTH}px;object-fit:contain;" />
                    </a>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="font-size:14px;font-weight:600;color:#ffffff;">Capital Articles</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${EMAIL_TEXT};">
                ${introLine}
              </p>
              ${titleBlock}
              <p style="margin:0 0 24px;font-size:15px;color:${EMAIL_TEXT};">
                Sign in to view and review the latest content.
              </p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                <tr>
                  <td>
                    <a href="${loginUrl}" style="display:inline-block;padding:14px 28px;background:${EMAIL_BUTTON_GRADIENT};background-color:${EMAIL_PRIMARY};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Sign in to Newsa</a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:${EMAIL_TEXT_MUTED};">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:8px 0 0;">
                <a href="${loginUrl}" style="font-size:13px;color:${EMAIL_LINK};word-break:break-all;">${loginUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:${EMAIL_FOOTER_BG};">
              <p style="margin:0;font-size:12px;color:${EMAIL_FOOTER_TEXT};"><a href="https://newsa.io" style="color:${EMAIL_FOOTER_TEXT};text-decoration:none;">Newsa.io</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
