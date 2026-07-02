import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useMemo } from "react";
import { setSessionExpiredHandler } from "../lib/apiFetch";
import { qk } from "../query";
import * as api from "./client";
import type { UserProfile } from "./types";

/** `loading` while the initial `/auth/me` probe is in flight, then `authed` or `anon`. */
export type AuthStatus = "loading" | "authed" | "anon";

export interface AuthContextValue {
  user: UserProfile | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Session provider (production-hardening 2B). A single `/auth/me` query is the source of truth for
 * "who am I" — mutations write its cache directly so the whole app re-renders authed/anon in step.
 * On logout we clear the query cache so no other user's cached workspace data lingers.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: qk.me, queryFn: api.fetchMe, staleTime: 5 * 60_000 });

  // When a background refresh fails (session truly over), drop to anon so RequireAuth redirects.
  useEffect(() => {
    setSessionExpiredHandler(() => qc.setQueryData(qk.me, null));
    return () => setSessionExpiredHandler(null);
  }, [qc]);

  const setUser = (user: UserProfile) => qc.setQueryData(qk.me, user);

  const loginM = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      api.login(email, password),
    onSuccess: setUser,
  });
  const registerM = useMutation({
    mutationFn: (v: { email: string; password: string; displayName?: string }) =>
      api.register(v.email, v.password, v.displayName),
    onSuccess: setUser,
  });
  const logoutM = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      // Drop every cached query of the outgoing session; the /auth/me observer refetches → anon.
      qc.clear();
    },
  });

  const value = useMemo<AuthContextValue>(() => {
    const user = query.data ?? null;
    const status: AuthStatus = query.isPending ? "loading" : user ? "authed" : "anon";
    return {
      user,
      status,
      login: async (email, password) => {
        await loginM.mutateAsync({ email, password });
      },
      register: async (email, password, displayName) => {
        await registerM.mutateAsync({ email, password, displayName });
      },
      logout: async () => {
        await logoutM.mutateAsync();
      },
    };
  }, [query.data, query.isPending, loginM, registerM, logoutM]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
