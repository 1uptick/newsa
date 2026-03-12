import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Loader2, Users, Search, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { inputClass } from "../lib/formClasses";
import { useDebounce } from "../lib/useDebounce";

type UserRow = {
  firebase_uid: string;
  email: string | null;
  role: string;
  group_id: number | null;
  group_name: string | null;
  created_at: string;
  last_login: string | null;
};

export default function AdminUsersPage() {
  const { authFetch } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterRole, setFilterRole] = useState<string>("");
  const [filterGroup, setFilterGroup] = useState<string>("");
  const [searchEmail, setSearchEmail] = useState("");
  const [deletingUid, setDeletingUid] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/api/admin/users");
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      setUsers(data);
    } catch (e: any) {
      setError(e?.message || "Error loading users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const groups = useMemo(() => {
    const set = new Set<string>();
    users.forEach((u) => {
      if (u.group_name) set.add(u.group_name);
    });
    return Array.from(set).sort();
  }, [users]);

  const debouncedSearch = useDebounce(searchEmail, 300);
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (filterRole && u.role !== filterRole) return false;
      if (filterGroup && u.group_name !== filterGroup) return false;
      if (debouncedSearch.trim()) {
        const email = (u.email || "").toLowerCase();
        const q = debouncedSearch.trim().toLowerCase();
        if (!email.includes(q)) return false;
      }
      return true;
    });
  }, [users, filterRole, filterGroup, debouncedSearch]);

  const deleteUser = async (uid: string) => {
    if (!window.confirm("Remove this user from the platform? They will lose access.")) return;
    setDeletingUid(uid);
    setError("");
    try {
      const res = await authFetch(`/api/admin/users/${encodeURIComponent(uid)}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to delete user");
      }
      setUsers((prev) => prev.filter((u) => u.firebase_uid !== uid));
    } catch (e: any) {
      setError(e?.message || "Error deleting user");
    } finally {
      setDeletingUid(null);
    }
  };

  return (
    <div>
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Users className="w-5 h-5 text-slate-500" />
            Users
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[160px] max-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by email"
                className={`${inputClass} pl-9`}
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
              />
            </div>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white"
            >
              <option value="">All roles</option>
              <option value="admin">Admin</option>
              <option value="client">Client</option>
            </select>
            <select
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none bg-white min-w-[140px]"
            >
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && (
          <p className="px-6 py-3 text-red-500 text-sm">{error}</p>
        )}
        {loading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 text-left text-sm text-slate-600">
                  <th className="px-6 py-3 font-medium">Email</th>
                  <th className="px-6 py-3 font-medium">Role</th>
                  <th className="px-6 py-3 font-medium">Group</th>
                  <th className="px-6 py-3 font-medium">Joined</th>
                  <th className="px-6 py-3 font-medium">Last login</th>
                  <th className="px-6 py-3 w-20 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.firebase_uid} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-6 py-3 text-sm text-slate-800">{u.email || "—"}</td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          u.role === "admin" ? "bg-primary/20 text-primary" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-600">{u.group_name ?? "—"}</td>
                    <td className="px-6 py-3 text-sm text-slate-500">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-6 py-3 text-sm text-slate-500">
                      {u.last_login ? new Date(u.last_login).toLocaleString() : "—"}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => deleteUser(u.firebase_uid)}
                        disabled={deletingUid === u.firebase_uid}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title="Remove user"
                      >
                        {deletingUid === u.firebase_uid ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredUsers.length === 0 && (
              <p className="p-8 text-center text-slate-500">
                {users.length === 0 ? "No users yet." : "No users match the current filters."}
              </p>
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
