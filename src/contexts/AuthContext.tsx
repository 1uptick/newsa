import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { User } from "firebase/auth";
import { auth } from "../services/firebase";
import { apiUrl } from "../lib/api";

type Role = "admin" | "client" | null;

type FetchOptions = RequestInit & {
  /** If true, bypasses server cache and fetches fresh data */
  forceRefresh?: boolean;
};

type AuthState = {
  user: User | null;
  role: Role;
  groupId: number | null;
  groupName: string | null;
  loading: boolean;
  getIdToken: () => Promise<string | null>;
  /** Fetch with auth token. Use { forceRefresh: true } to bypass cache. */
  authFetch: (url: string, init?: FetchOptions) => Promise<Response>;
  logout: () => Promise<void>;
  refreshUser: () => void;
  /** Refetch role/group from server (e.g. after registration so new user_roles row is visible). */
  refreshAuth: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const authFetchVersion = useRef(0);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    if (!auth.currentUser) return null;
    try {
      return await auth.currentUser.getIdToken();
    } catch {
      return null;
    }
  }, []);

  const authFetch = useCallback(
    async (url: string, init?: FetchOptions): Promise<Response> => {
      const token = await getIdToken();
      const headers = new Headers(init?.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      // Support force refresh to bypass server cache
      if (init?.forceRefresh) {
        headers.set("Cache-Control", "no-cache");
      }
      // When body is FormData, do not set Content-Type so the browser sets multipart/form-data with boundary
      if (init?.body instanceof FormData) {
        headers.delete("Content-Type");
      }
      const { forceRefresh: _, ...fetchInit } = init ?? {};
      return fetch(apiUrl(url), {
        ...fetchInit,
        headers,
        ...(init?.forceRefresh ? { cache: "no-store" as RequestCache } : {}),
      });
    },
    [getIdToken]
  );

  const logout = useCallback(async () => {
    if (typeof auth.signOut === "function") await auth.signOut();
    setUser(null);
    setRole(null);
    setGroupId(null);
    setGroupName(null);
  }, []);

  const refreshUser = useCallback(() => {
    setUser(auth.currentUser ?? null);
  }, []);

  const refreshAuth = useCallback(async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return;
    const version = ++authFetchVersion.current;
    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch(apiUrl("/api/auth/me"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok && version === authFetchVersion.current) {
        const data = await res.json();
        setRole(data.role ?? null);
        setGroupId(data.groupId ?? null);
        setGroupName(data.groupName ?? null);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!auth.onAuthStateChanged) {
      setLoading(false);
      return;
    }
    const unsub = auth.onAuthStateChanged(async (firebaseUser: User | null) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        authFetchVersion.current++;
        setRole(null);
        setGroupId(null);
        setGroupName(null);
        setLoading(false);
        return;
      }
      const version = ++authFetchVersion.current;
      try {
        const token = await firebaseUser.getIdToken();
        const res = await fetch(apiUrl("/api/auth/me"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (version !== authFetchVersion.current) return;
        if (res.ok) {
          const data = await res.json();
          setRole(data.role ?? null);
          setGroupId(data.groupId ?? null);
          setGroupName(data.groupName ?? null);
        } else {
          setRole(null);
          setGroupId(null);
          setGroupName(null);
        }
      } catch {
        if (version !== authFetchVersion.current) return;
        setRole(null);
        setGroupId(null);
        setGroupName(null);
      } finally {
        if (version === authFetchVersion.current) {
          setLoading(false);
        }
      }
    });
    return () => unsub();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      role,
      groupId,
      groupName,
      loading,
      getIdToken,
      authFetch,
      logout,
      refreshUser,
      refreshAuth,
    }),
    [user, role, groupId, groupName, loading, getIdToken, authFetch, logout, refreshUser, refreshAuth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
