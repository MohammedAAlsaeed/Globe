"use client";
/**
 * Who is signed in, for the whole app. Loads the user once (GET auth/me)
 * and lets pages refresh or clear it after signing in or out.
 *
 * While that first answer is on its way, `expected` says what the browser
 * remembered (lib/session.ts), so pages can draw the member's layout
 * straight away instead of the visitor's.
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
import { SIGNED_OUT_EVENT, type SignedOutDetail } from "@/lib/api/client";
import { rememberSignedIn } from "@/lib/session";
import type { User } from "./types";

interface AuthState {
  /** undefined while loading, null when signed out. */
  user: User | null | undefined;
  /** Still loading, and this browser was signed in last time. */
  expected: boolean;
  /** The API could not be reached on load (offline or not running). */
  offline: boolean;
  refresh: () => Promise<User | null>;
  setUser: (user: User | null) => void;
  signOut: () => Promise<void>;
  /** Why the server signed this browser out (shown on the sign-in page). */
  endedBy: SignedOutDetail | null;
  clearEnded: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({
  children,
  expectSignedIn = false,
}: {
  children: ReactNode;
  /** The signed-in hint the server read from the browser's cookie. */
  expectSignedIn?: boolean;
}) {
  const [user, setUserState] = useState<User | null | undefined>(undefined),
    [offline, setOffline] = useState(false),
    [endedBy, setEndedBy] = useState<SignedOutDetail | null>(null);

  /** Sets who is signed in, and remembers it for the next page load. */
  const setUser = useCallback((next: User | null) => {
    rememberSignedIn(next !== null);
    setUserState(next);
  }, []);

  // Staff ended this session or suspended the account: sign out here too.
  useEffect(() => {
    const ended = (e: Event) => {
      setEndedBy((e as CustomEvent<SignedOutDetail>).detail);
      setUser(null);
    };
    window.addEventListener(SIGNED_OUT_EVENT, ended);
    return () => window.removeEventListener(SIGNED_OUT_EVENT, ended);
  }, [setUser]);
  const clearEnded = useCallback(() => setEndedBy(null), []);

  const refresh = useCallback(async () => {
    try {
      const me = await auth.me();
      setUser(me);
      setOffline(false);
      return me;
    } catch {
      // Unreachable API: carry on signed out (the editor still works locally).
      // The hint is kept: the session itself may be fine.
      setUserState(null);
      setOffline(true);
      return null;
    }
  }, [setUser]);

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
  }, [setUser]);

  const value = useMemo(
    () => ({
      user,
      expected: user === undefined && expectSignedIn,
      offline,
      refresh,
      setUser,
      signOut,
      endedBy,
      clearEnded,
    }),
    [
      user,
      expectSignedIn,
      offline,
      refresh,
      setUser,
      signOut,
      endedBy,
      clearEnded,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
