"use client";
/**
 * Who is signed in, for the whole app. Loads the user once (GET auth/me)
 * and lets pages refresh or clear it after signing in or out.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { auth } from "./api";
import type { User } from "./types";

interface AuthState {
  /** undefined while loading, null when signed out. */
  user: User | null | undefined;
  /** The API could not be reached on load (offline or not running). */
  offline: boolean;
  refresh: () => Promise<User | null>;
  setUser: (user: User | null) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined),
    [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const me = await auth.me();
      setUser(me);
      setOffline(false);
      return me;
    } catch {
      // Unreachable API: carry on signed out (the editor still works locally).
      setUser(null);
      setOffline(true);
      return null;
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the session once on mount
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await auth.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, offline, refresh, setUser, signOut }),
    [user, offline, refresh, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
