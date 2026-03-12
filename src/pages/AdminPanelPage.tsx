import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Loader2, UserPlus, Copy, Check, Users, Mail, Plus, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { inputClass, labelClass } from "../lib/formClasses";

type Group = { id: number; name: string; created_at: string };

type InvitationRow = {
  id: number;
  code: string;
  role: string;
  used: number;
  email: string | null;
  created_at: string;
  group_id: number | null;
  group_name: string | null;
};

export default function AdminPanelPage() {
  const { authFetch } = useAuth();
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newRole, setNewRole] = useState<"admin" | "client">("client");
  const [newEmail, setNewEmail] = useState("");
  const [newGroupId, setNewGroupId] = useState<number | "add" | "">("");
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [testEmailTo, setTestEmailTo] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadInvitations = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/api/admin/invitations");
      if (!res.ok) throw new Error("Failed to load invitations");
      const data = await res.json();
      setInvitations(data);
    } catch (e: any) {
      setError(e?.message || "Error loading invitations");
    } finally {
      setLoading(false);
    }
  };

  const loadGroups = async () => {
    try {
      const res = await authFetch("/api/admin/groups");
      if (!res.ok) throw new Error("Failed to load groups");
      const data = await res.json();
      setGroups(data);
    } catch (e: any) {
      console.error("Load groups:", e);
    }
  };

  useEffect(() => {
    loadInvitations();
    loadGroups();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const createInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const groupId = typeof newGroupId === "number" ? newGroupId : null;
    if (groupId == null) {
      setError("Please select a user group.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await authFetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole, email: newEmail || undefined, groupId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to create invitation");
      }
      const data = await res.json();
      const group = groups.find((g) => g.id === data.groupId);
      setInvitations((prev) => [
        {
          id: Date.now(),
          code: data.code,
          role: data.role,
          used: 0,
          email: data.email,
          created_at: new Date().toISOString(),
          group_id: data.groupId ?? null,
          group_name: group?.name ?? null,
        },
        ...prev,
      ]);
      setNewEmail("");
      if (data.emailSent && data.email) {
        setToast(`Invitation created and email sent to ${data.email}`);
      } else if (data.email) {
        setToast("Invitation created. SMTP not configured — copy the code to send manually.");
      }
    } catch (e: any) {
      setError(e?.message || "Error creating invitation");
    } finally {
      setCreating(false);
    }
  };

  const addGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newGroupName.trim();
    if (!name) return;
    setAddingGroup(true);
    setError("");
    try {
      const res = await authFetch("/api/admin/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to add group");
      }
      const created = await res.json();
      setGroups((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewGroupId(created.id);
      setNewGroupName("");
      setShowAddGroup(false);
      setToast(`Group "${created.name}" added.`);
    } catch (e: any) {
      setError(e?.message || "Error adding group");
    } finally {
      setAddingGroup(false);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const deleteInvitation = async (id: number) => {
    if (!window.confirm("Remove this invitation? This cannot be undone.")) return;
    setDeletingId(id);
    setError("");
    try {
      const res = await authFetch(`/api/admin/invitations/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to delete invitation");
      }
      setInvitations((prev) => prev.filter((inv) => inv.id !== id));
      setToast("Invitation removed.");
    } catch (e: any) {
      setError(e?.message || "Error deleting invitation");
    } finally {
      setDeletingId(null);
    }
  };

  const sendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailTo.trim()) return;
    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await authFetch("/api/admin/send-test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testEmailTo.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ ok: true, message: data.message || "Test email sent." });
      } else {
        setTestResult({ ok: false, message: data.error || "Failed to send" });
      }
    } catch (e: any) {
      setTestResult({ ok: false, message: e?.message || "Request failed" });
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div>
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-6 mb-8"
      >
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <UserPlus className="w-5 h-5" />
          Create invitation
        </h2>
        <form onSubmit={createInvite} className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className={labelClass}>Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as "admin" | "client")}
                className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
              >
                <option value="client">Client</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="min-w-[180px]">
              <label className={labelClass}>User group</label>
              <select
                value={newGroupId === "add" ? "add" : newGroupId === "" ? "" : String(newGroupId)}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "add") {
                    setNewGroupId("add");
                    setShowAddGroup(true);
                  } else if (v === "") {
                    setNewGroupId("");
                    setShowAddGroup(false);
                  } else {
                    setNewGroupId(Number(v));
                    setShowAddGroup(false);
                  }
                }}
                className="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none w-full"
                required
              >
                <option value="">Select group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
                <option value="add">+ Add new group</option>
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className={labelClass}>Email</label>
              <input type="email" placeholder="invitee@example.com" className={inputClass} value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </div>
            <button type="submit" disabled={creating} className="btn-primary flex items-center gap-2">
              {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : "Send"}
            </button>
          </div>
          {showAddGroup && (
            <div className="flex flex-wrap items-end gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="min-w-[200px]">
                <label className={labelClass}>New group name</label>
                <input
                  type="text"
                  placeholder="e.g. Acme Corp"
                  className={inputClass}
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  autoFocus
                />
              </div>
              <button
                type="button"
                onClick={addGroup}
                disabled={addingGroup || !newGroupName.trim()}
                className="btn-primary flex items-center gap-2"
              >
                {addingGroup ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add group
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddGroup(false);
                  setNewGroupName("");
                  if (newGroupId === "add") setNewGroupId("");
                }}
                className="px-3 py-2 text-slate-600 hover:text-slate-800 border border-slate-300 rounded-lg hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          )}
        </form>
        {error && <p className="mt-3 text-red-500 text-sm">{error}</p>}
        {toast && (
          <p className="mt-3 text-green-600 text-sm font-medium">{toast}</p>
        )}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.03 }}
        className="card p-6 mb-8"
      >
        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <Mail className="w-5 h-5" />
          Send test email
        </h2>
        <form onSubmit={sendTestEmail} className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className={labelClass}>To</label>
            <input type="email" required placeholder="your@email.com" className={inputClass} value={testEmailTo} onChange={(e) => setTestEmailTo(e.target.value)} />
          </div>
          <button type="submit" disabled={sendingTest} className="btn-primary flex items-center gap-2">
            {sendingTest ? <Loader2 className="w-5 h-5 animate-spin" /> : "Send test email"}
          </button>
        </form>
        {testResult && (
          <p className={`mt-3 text-sm font-medium ${testResult.ok ? "text-green-600" : "text-red-500"}`}>
            {testResult.ok ? testResult.message : testResult.message}
          </p>
        )}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="card overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2">
          <Users className="w-5 h-5 text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-800">Invitations</h2>
        </div>
        {loading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left text-sm text-slate-600">
                  <th className="px-6 py-3 font-medium">Code</th>
                  <th className="px-6 py-3 font-medium">Role</th>
                  <th className="px-6 py-3 font-medium">Group</th>
                  <th className="px-6 py-3 font-medium">Email</th>
                  <th className="px-6 py-3 font-medium">Registration</th>
                  <th className="px-6 py-3 font-medium">Created</th>
                  <th className="px-6 py-3 w-28 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-6 py-3 font-mono text-sm">{inv.code}</td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          inv.role === "admin" ? "bg-primary/20 text-primary" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {inv.role}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-600">{inv.group_name ?? "—"}</td>
                    <td className="px-6 py-3 text-sm text-slate-600">{inv.email || "—"}</td>
                    <td className="px-6 py-3">
                      {inv.used ? (
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                          Completed
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-500">
                      {new Date(inv.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {!inv.used && (
                          <button
                            type="button"
                            onClick={() => copyCode(inv.code)}
                            className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                            title="Copy code"
                          >
                            {copiedCode === inv.code ? (
                              <Check className="w-4 h-4 text-green-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteInvitation(inv.id)}
                          disabled={deletingId === inv.id}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          title="Remove invitation"
                        >
                          {deletingId === inv.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {invitations.length === 0 && (
              <p className="p-8 text-center text-slate-500">No invitations yet. Create one above.</p>
            )}
          </div>
        )}
      </motion.section>

      <p className="mt-6 text-sm text-slate-500">
        <Link to="/" className="text-primary hover:underline">Back to Dashboard</Link>
      </p>
    </div>
  );
}
