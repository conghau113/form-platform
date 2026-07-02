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
  /** The session's effective function codes (D1 nav gate; `*` = tenant admin). Empty while
   *  loading or anonymous — surfaces gated on it appear once the probe lands. */
  functions: string[];
  /** True while the functions probe is still in flight (authed only) — gated pages show a spinner
   *  instead of flashing "no access". */
  functionsLoading: boolean;
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
  // Permissions ride a second query keyed to the session: it only runs once authed, and logout's
  // cache clear drops it with everything else. Role changes elsewhere invalidate qk.myFunctions.
  const fnQuery = useQuery({
    queryKey: qk.myFunctions,
    queryFn: api.fetchMyFunctions,
    enabled: !!query.data,
    staleTime: 5 * 60_000,
  });

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
      functions: fnQuery.data ?? [],
      functionsLoading: !!user && fnQuery.isPending,
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
  }, [query.data, query.isPending, fnQuery.data, fnQuery.isPending, loginM, registerM, logoutM]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
