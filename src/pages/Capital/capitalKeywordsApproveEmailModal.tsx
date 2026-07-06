import React, { useMemo, useState, useEffect } from "react";
import { Eye, Loader2, Mail, PencilLine, Send } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { Modal } from "../../components/Modal";
import type { CapitalKeywordItem } from "./types";

type EmailRecipient = { email: string };

export function CapitalKeywordsApproveEmailModal({
  item,
  items,
  onClose,
  onApproved,
  onSent,
}: {
  item?: CapitalKeywordItem;
  items?: CapitalKeywordItem[];
  onClose: () => void;
  onApproved?: (ids: string[]) => void;
  onSent?: (sent: number, total: number) => void;
}) {
  const { authFetch } = useAuth();
  const effectiveItems = useMemo(
    () => (items && items.length > 0 ? items : item ? [item] : []) as CapitalKeywordItem[],
    [items, item]
  );
  const [admins, setAdmins] = useState<EmailRecipient[]>([]);
  const [capitalUsers, setCapitalUsers] = useState<EmailRecipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(true);
  const [selectedAdminEmails, setSelectedAdminEmails] = useState<Set<string>>(new Set());
  const [selectedUserEmails, setSelectedUserEmails] = useState<Set<string>>(new Set());
  const [step, setStep] = useState<"select" | "review">("select");
  const [action, setAction] = useState<"approveOnly" | "draft" | "send" | null>(null);
  const [customMessage, setCustomMessage] = useState("");
  const [draftSubject, setDraftSubject] = useState("");
  const [draftText, setDraftText] = useState("");
  const [draftHtml, setDraftHtml] = useState("");
  const [draftMode, setDraftMode] = useState<"preview" | "edit">("preview");

  useEffect(() => {
    let cancelled = false;
    setLoadingRecipients(true);
    (async () => {
      try {
        const res = await authFetch("/api/capitalkeywords/email-recipients");
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
  }, [authFetch]);

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

  const recipients = useMemo(() => {
    const adminEmails = Array.from(selectedAdminEmails);
    const userEmails = Array.from(selectedUserEmails);
    return { adminEmails, userEmails };
  }, [selectedAdminEmails, selectedUserEmails]);

  /** True while approve / draft / send is in flight (not while recipient list is loading). */
  const submitting = action !== null;
  /** Disable destructive or slow actions until recipients are known. */
  const footerActionsDisabled = submitting || loadingRecipients;

  const approveItems = async () => {
    if (effectiveItems.length === 0) {
      throw new Error("No items selected");
    }
    for (const it of effectiveItems) {
      const res = await authFetch(`/api/capitalkeywords/${it.id}/approve`, { method: "PATCH" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Approve failed");
    }
    onApproved?.(effectiveItems.map((i) => i.id));
  };

  const handleApproveOnly = async () => {
    setAction("approveOnly");
    try {
      await approveItems();
      onClose();
    } finally {
      setAction(null);
    }
  };

  const handleDraftEmail = async () => {
    setAction("draft");
    try {
      const draftRes = await authFetch("/api/capitalkeywords/notify-approved-batch/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topics: effectiveItems.map((t) => ({ title: t.title, summary: t.summary ?? "", socialHook: t.socialHook ?? "" })),
          adminEmails: recipients.adminEmails,
          userEmails: recipients.userEmails,
          customMessage,
        }),
      });
      if (!draftRes.ok) {
        const err = await draftRes.json().catch(() => ({}));
        throw new Error(err?.error || `Draft failed (${draftRes.status})`);
      }
      const data = await draftRes.json();
      setDraftSubject(String(data.subject ?? ""));
      setDraftText(String(data.text ?? ""));
      setDraftHtml(String(data.html ?? ""));
      setStep("review");
    } finally {
      setAction(null);
    }
  };

  const [sendError, setSendError] = useState<string>("");

  const handleSend = async () => {
    setAction("send");
    setSendError("");
    try {
      const sendRes = await authFetch("/api/capitalkeywords/notify-approved-batch/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: draftSubject,
          text: draftText,
          html: draftHtml,
          adminEmails: recipients.adminEmails,
          userEmails: recipients.userEmails,
        }),
      });
      if (!sendRes.ok) {
        const err = await sendRes.json().catch(() => ({}));
        const msg = err?.error || `Send failed (${sendRes.status})`;
        setSendError(msg);
        return;
      }
      const data = await sendRes.json().catch(() => ({}));
      const sent = Number(data?.sent ?? 0) || 0;
      const total = Number(data?.total ?? 0) || 0;
      if (sent === 0 && total > 0) {
        const failedDetails = Array.isArray(data?.results)
          ? data.results.filter((r: any) => !r.sent).map((r: any) => r.error || "unknown").join("; ")
          : "";
        setSendError(`All ${total} email(s) failed to send.${failedDetails ? ` Errors: ${failedDetails}` : ""}`);
        return;
      }
      await approveItems();
      onSent?.(sent, total);
      onClose();
    } catch (e: any) {
      setSendError(e?.message || "An unexpected error occurred while sending.");
    } finally {
      setAction(null);
    }
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={effectiveItems.length > 1 ? `Approve ${effectiveItems.length} topics & notify` : "Approve topic & notify"}
      maxWidth={step === "review" ? "max-w-6xl" : "max-w-3xl"}
      closeOnBackdrop={!submitting}
      closeDisabled={submitting}
      ariaLabel="Approve topic and optionally send email notifications"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {step === "review" ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDraftMode("preview")}
                disabled={submitting}
                className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 ${
                  draftMode === "preview" ? "bg-slate-200 text-slate-900" : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-50"
                }`}
              >
                <Eye className="w-4 h-4" /> Preview
              </button>
              <button
                type="button"
                onClick={() => setDraftMode("edit")}
                disabled={submitting}
                className={`px-3 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 ${
                  draftMode === "edit" ? "bg-slate-200 text-slate-900" : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-50"
                }`}
              >
                <PencilLine className="w-4 h-4" /> Edit
              </button>
            </div>
          ) : (
            <div />
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          {step === "select" ? (
            <>
              <button
                type="button"
                onClick={handleApproveOnly}
                disabled={footerActionsDisabled}
                className="px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-200 hover:bg-slate-300 rounded-lg transition-colors disabled:opacity-50"
              >
                {action === "approveOnly" ? <Loader2 className="w-4 h-4 animate-spin inline-block mr-2" /> : null}
                Approve only
              </button>
              <button
                type="button"
                onClick={handleDraftEmail}
                disabled={footerActionsDisabled}
                className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {action === "draft" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Review email →
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={submitting}
              className="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {action === "send" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send email
            </button>
          )}
          </div>
        </div>
      }
    >
      <div className="p-4">
        {step === "select" ? (
          <>
            <p className="text-sm text-slate-600 mb-4">
              Approve {effectiveItems.length > 1 ? "these topics" : "this topic"} and optionally send a single combined email notification. Select recipients and, if you like, add a note that appears in the email body.
            </p>
            {effectiveItems.length === 0 ? (
              <div className="p-4 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800 mb-4">
                No items selected. Close this modal and select at least one item to approve.
              </div>
            ) : null}
            <div className="mb-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Topics</p>
              {effectiveItems.length === 1 ? (
                <>
                  <p className="text-sm font-semibold text-slate-900">{effectiveItems[0]?.title}</p>
                  {effectiveItems[0]?.summary ? (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{effectiveItems[0].summary}</p>
                  ) : null}
                </>
              ) : (
                <ul className="mt-1 space-y-1 max-h-28 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-50/50">
                  {effectiveItems.map((it) => (
                    <li key={it.id} className="text-xs text-slate-700 truncate">
                      {it.title}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mb-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Who to notify</p>
              <p className="text-xs text-slate-500 mb-3">Choose at least one recipient. Admins are pre-selected when loaded.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Admins</p>
                  <p className="text-xs text-slate-500 mb-2">All admins (selected by default)</p>
                  <ul className="space-y-1.5 min-h-[140px] max-h-44 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-50/50">
                    {loadingRecipients ? (
                      <li className="flex items-center gap-2 py-6 justify-center text-slate-500 text-sm">
                        <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                        Loading…
                      </li>
                    ) : admins.length === 0 ? (
                      <li className="text-xs text-slate-500 py-2">No admin emails found.</li>
                    ) : (
                      admins.map((r) => (
                        <li key={r.email} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`admin-${r.email}`}
                            checked={selectedAdminEmails.has(r.email)}
                            onChange={() => toggleAdmin(r.email)}
                            disabled={submitting}
                            className="rounded border-slate-300 text-primary focus:ring-primary disabled:opacity-50"
                          />
                          <label htmlFor={`admin-${r.email}`} className="text-sm text-slate-700 truncate cursor-pointer">
                            {r.email}
                          </label>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Capital group users</p>
                  <p className="text-xs text-slate-500 mb-2">Select users to notify</p>
                  <ul className="space-y-1.5 min-h-[140px] max-h-44 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-50/50">
                    {loadingRecipients ? (
                      <li className="flex items-center gap-2 py-6 justify-center text-slate-500 text-sm">
                        <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
                        Loading…
                      </li>
                    ) : capitalUsers.length === 0 ? (
                      <li className="text-xs text-slate-500 py-2">No capital group users with email.</li>
                    ) : (
                      capitalUsers.map((r) => (
                        <li key={r.email} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`user-${r.email}`}
                            checked={selectedUserEmails.has(r.email)}
                            onChange={() => toggleUser(r.email)}
                            disabled={submitting}
                            className="rounded border-slate-300 text-primary focus:ring-primary disabled:opacity-50"
                          />
                          <label htmlFor={`user-${r.email}`} className="text-sm text-slate-700 truncate cursor-pointer">
                            {r.email}
                          </label>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </div>

            <div className="mb-1 rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Email body preview</p>
              </div>
              <div className="px-4 py-4 space-y-3 text-slate-800">
                <p className="text-sm text-slate-500">Dear recipient,</p>
                <p className="text-base leading-relaxed">
                  New topic proposals have been approved in Topics for Capital and are ready for your review.
                </p>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Pending topics ({effectiveItems.length})
                  </p>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    In the sent email, each topic appears here with title and summary. In this dialog, titles are under
                    “Topics” above.
                  </p>
                </div>
                <div className="pt-3 mt-1 border-t border-slate-200">
                  <textarea
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder="Optional message—included after the topic list, as normal email body text (spacing and line breaks preserved)."
                    rows={4}
                    className="w-full max-h-40 min-h-[4.5rem] p-0 text-base text-slate-800 placeholder:text-slate-400 bg-transparent border-0 focus:ring-0 focus:outline-none resize-y leading-relaxed overflow-y-auto"
                    disabled={submitting}
                  />
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  You can still edit the full HTML or plain text on the next step after “Review email”.
                </p>
              </div>
            </div>
          </>
        ) : (
          <>
            {sendError && (
              <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800 mb-3">
                {sendError}
              </div>
            )}
            <div className="space-y-3">
              <div className="shrink-0">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Subject</label>
                <input
                  value={draftSubject}
                  onChange={(e) => setDraftSubject(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                  disabled={submitting}
                />
              </div>

              {draftMode === "preview" ? (
                <div className="flex flex-col gap-3 min-h-0">
                  <div className="border border-slate-200 rounded-lg bg-white overflow-hidden flex flex-col min-h-0">
                    <div className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 border-b border-slate-200 shrink-0">
                      Email preview
                    </div>
                    <div
                      className="p-3 overflow-y-auto overscroll-contain text-[13px] leading-relaxed min-h-[280px] h-[calc(90vh-15rem)] max-h-[calc(90vh-15rem)]"
                      dangerouslySetInnerHTML={{ __html: draftHtml }}
                    />
                  </div>
                  <details className="border border-slate-200 rounded-lg bg-white overflow-hidden">
                    <summary className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 border-b border-slate-200 cursor-pointer select-none">
                      Plain text (expand to edit)
                    </summary>
                    <textarea
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      className="w-full min-h-[120px] max-h-48 p-3 text-xs font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-y border-0"
                      disabled={submitting}
                    />
                  </details>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:items-stretch">
                  <div className="border border-slate-200 rounded-lg bg-white overflow-hidden flex flex-col min-h-[280px] lg:min-h-[calc(90vh-16rem)]">
                    <div className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 border-b border-slate-200 shrink-0">
                      Email preview
                    </div>
                    <div
                      className="p-3 flex-1 min-h-0 overflow-y-auto overscroll-contain text-[13px] leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: draftHtml }}
                    />
                  </div>

                  <div className="space-y-3 flex flex-col min-h-0">
                    <div className="border border-slate-200 rounded-lg bg-white overflow-hidden flex flex-col min-h-0 flex-1">
                      <div className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 border-b border-slate-200 shrink-0">
                        Plain text
                      </div>
                      <textarea
                        value={draftText}
                        onChange={(e) => setDraftText(e.target.value)}
                        className="w-full min-h-[200px] flex-1 p-3 text-xs font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-y"
                        disabled={submitting}
                      />
                    </div>

                    <div className="border border-slate-200 rounded-lg bg-white overflow-hidden flex flex-col min-h-0">
                      <div className="px-3 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 border-b border-slate-200 shrink-0">
                        HTML (advanced)
                      </div>
                      <textarea
                        value={draftHtml}
                        onChange={(e) => setDraftHtml(e.target.value)}
                        className="w-full min-h-[180px] p-3 text-xs font-mono focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-y"
                        disabled={submitting}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
