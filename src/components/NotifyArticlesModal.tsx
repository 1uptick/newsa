import React, { useState, useEffect } from "react";
import { Loader2, Mail } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Modal } from "./Modal";
import { ContentAreaLoader } from "./ContentAreaLoader";

export type EmailRecipient = { email: string };

export type NotifyArticlesModalConfig = {
  modalTitle: string;
  description: string;
  ariaLabel: string;
  recipientsUrl: string;
  notifyUrl: string;
  usersColumnTitle: string;
  usersColumnHint: string;
  emptyUsersMessage: string;
};

export function NotifyArticlesModal({
  config,
  onClose,
  articleTitle,
  articleId,
}: {
  config: NotifyArticlesModalConfig;
  onClose: () => void;
  articleTitle?: string;
  articleId?: string;
}) {
  const { authFetch } = useAuth();
  const [admins, setAdmins] = useState<EmailRecipient[]>([]);
  const [capitalUsers, setCapitalUsers] = useState<EmailRecipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(true);
  const [selectedAdminEmails, setSelectedAdminEmails] = useState<Set<string>>(new Set());
  const [selectedUserEmails, setSelectedUserEmails] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingRecipients(true);
    (async () => {
      try {
        const res = await authFetch(config.recipientsUrl);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const adminList = Array.isArray(data.admins) ? data.admins : [];
        const userList = Array.isArray(data.capitalUsers) ? data.capitalUsers : [];
        if (cancelled) return;
        setAdmins(adminList);
        setCapitalUsers(userList);
        setSelectedAdminEmails(new Set(adminList.map((r: EmailRecipient) => r.email)));
        setSelectedUserEmails(new Set());
      } finally {
        if (!cancelled) setLoadingRecipients(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authFetch, config.recipientsUrl]);

  const toggleAdmin = (email: string) => {
    setSelectedAdminEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const toggleUser = (email: string) => {
    setSelectedUserEmails((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const handleSend = async () => {
    const adminList = Array.from(selectedAdminEmails);
    const userList = Array.from(selectedUserEmails);
    if (adminList.length + userList.length === 0) {
      setToast("Select at least one recipient");
      return;
    }
    setSending(true);
    try {
      const res = await authFetch(config.notifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmails: adminList,
          userEmails: userList,
          articleTitle: articleTitle?.trim() ?? "",
          articleId: articleId?.trim() ?? "",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to send");
      }
      const data = await res.json().catch(() => ({}));
      const sent = data?.sent ?? 0;
      let msg = sent > 0 ? `Sent to ${sent} recipient(s).` : "No emails sent.";
      if (data?.contentGenUpdated) msg += " * appended to Content gen in Airtable.";
      if (data?.contentGenError) msg += ` ${data.contentGenError}`;
      if (sent > 0 && data?.notifyBadgeRecorded === false) {
        msg +=
          ' Ready-to-post "Sent" badge was not stored (add column notify_sent_at on capital_articles, or check server logs).';
      }
      setToast(msg);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (e) {
      setToast((e as Error).message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const busy = sending;

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={config.modalTitle}
      maxWidth="max-w-3xl"
      closeOnBackdrop={!busy}
      closeDisabled={busy}
      ariaLabel={config.ariaLabel}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {toast && <span className="text-sm text-slate-600 mr-2">{toast}</span>}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={busy}
            className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Send
          </button>
        </div>
      }
    >
      <div className="p-4">
        <p className="text-sm text-slate-600 mb-4">{config.description}</p>
        {articleTitle?.trim() && (
          <div className="mb-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Article</p>
            <p className="text-sm font-semibold text-slate-900">{articleTitle.trim()}</p>
          </div>
        )}
        {loadingRecipients ? (
          <ContentAreaLoader variant="card" size="sm" />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Admins</p>
              <p className="text-xs text-slate-500 mb-2">Select admins to notify</p>
              <ul className="space-y-1.5 min-h-[200px] max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-50/50">
                {admins.length === 0 ? (
                  <li className="text-xs text-slate-500 py-2">No admin emails found.</li>
                ) : (
                  admins.map((r) => (
                    <li key={r.email} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`notify-admin-${r.email}`}
                        checked={selectedAdminEmails.has(r.email)}
                        onChange={() => toggleAdmin(r.email)}
                        className="rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      <label htmlFor={`notify-admin-${r.email}`} className="text-sm text-slate-700 truncate cursor-pointer">
                        {r.email}
                      </label>
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">{config.usersColumnTitle}</p>
              <p className="text-xs text-slate-500 mb-2">{config.usersColumnHint}</p>
              <ul className="space-y-1.5 min-h-[200px] max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-50/50">
                {capitalUsers.length === 0 ? (
                  <li className="text-xs text-slate-500 py-2">{config.emptyUsersMessage}</li>
                ) : (
                  capitalUsers.map((r) => (
                    <li key={r.email} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`notify-user-${r.email}`}
                        checked={selectedUserEmails.has(r.email)}
                        onChange={() => toggleUser(r.email)}
                        className="rounded border-slate-300 text-primary focus:ring-primary"
                      />
                      <label htmlFor={`notify-user-${r.email}`} className="text-sm text-slate-700 truncate cursor-pointer">
                        {r.email}
                      </label>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
