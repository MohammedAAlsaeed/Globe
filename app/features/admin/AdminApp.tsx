"use client";
/* eslint-disable @next/next/no-img-element -- static brand artwork */
/**
 * The admin panel's frame. In order: are you signed in, are you staff, have
 * you set up two-factor sign-in, has this session passed a code — then the
 * shell (sidebar by permission, top bar, command palette) around the page.
 *
 * Everything a page needs about the staff member comes from `useAdmin()`:
 * `can(permission)` to show only what they may do, and `guard(fn)` to run a
 * change that may ask for a fresh two-factor code first.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAuth } from "../account/AuthProvider";
import { CompassScreen } from "../account/ui";
import { admin } from "./api";
import { Icon } from "./icons";
import { StepUpDialog, TwoFactorSetup, TwoFactorVerify } from "./TwoFactor";
import type { AdminSession, Permission, UserRow } from "./types";
import { StepUpCancelled, ToastProvider, adminError } from "./ui";
import { ApiError } from "@/lib/api/client";
import { rememberLanguage } from "@/lib/language";

interface AdminContext {
  session: AdminSession;
  can: (p: Permission) => boolean;
  /** Runs a change; if it needs a fresh two-factor code, asks, then retries once. */
  guard: <R>(fn: () => Promise<R>) => Promise<R>;
  reloadSession: () => Promise<void>;
}

const Ctx = createContext<AdminContext | null>(null);
export function useAdmin() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAdmin must be used inside <AdminApp>");
  return c;
}

export interface NavItem {
  href: string;
  key: string;
  icon: string;
  permission: Permission | null;
}
export const NAV: NavItem[] = [
  {
    href: "/admin",
    key: "adNavDashboard",
    icon: "dashboard",
    permission: "stats.view",
  },
  {
    href: "/admin/users",
    key: "adNavUsers",
    icon: "users",
    permission: "users.view",
  },
  {
    href: "/admin/subscriptions",
    key: "adNavSubscriptions",
    icon: "card",
    permission: "subscriptions.view",
  },
  {
    href: "/admin/plans",
    key: "adNavPlans",
    icon: "tag",
    permission: "plans.view",
  },
  {
    href: "/admin/content",
    key: "adNavContent",
    icon: "library",
    permission: "content.manage",
  },
  {
    href: "/admin/maps",
    key: "adNavMaps",
    icon: "map",
    permission: "maps.view",
  },
  {
    href: "/admin/audit",
    key: "adNavAudit",
    icon: "scroll",
    permission: "audit.view",
  },
  {
    href: "/admin/security",
    key: "adNavSecurity",
    icon: "shield",
    permission: null,
  },
];

type Theme = "dark" | "light";
const THEME_KEY = "admin-theme";

export function AdminApp({ children }: { children: ReactNode }) {
  const { t } = useTranslation(),
    router = useRouter(),
    path = usePathname(),
    { user } = useAuth();
  const [session, setSession] = useState<AdminSession | null>(null),
    [problem, setProblem] = useState<unknown>(null);

  const reloadSession = useCallback(async () => {
    try {
      setSession(await admin.session());
      setProblem(null);
    } catch (e) {
      setProblem(e);
    }
  }, []);

  useEffect(() => {
    if (user === null)
      router.replace(`/login?next=${encodeURIComponent(path || "/admin")}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the panel's session once signed in
    if (user) void reloadSession();
  }, [user, path, router, reloadSession]);

  // The step-up prompt: one at a time, resolved by the dialog.
  const pending = useRef<{
      resolve: () => void;
      reject: (e: unknown) => void;
    } | null>(null),
    [stepUp, setStepUp] = useState(false);
  const askCode = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        pending.current = { resolve, reject };
        setStepUp(true);
      }),
    [],
  );
  const guard = useCallback(
    async <R,>(fn: () => Promise<R>): Promise<R> => {
      try {
        return await fn();
      } catch (e) {
        if (e instanceof ApiError && e.code === "step_up_required") {
          await askCode();
          return fn();
        }
        if (e instanceof ApiError && e.code === "two_factor_required")
          void reloadSession();
        throw e;
      }
    },
    [askCode, reloadSession],
  );

  const value = useMemo<AdminContext | null>(
    () =>
      session
        ? {
            session,
            can: (p) => session.permissions.includes(p),
            guard,
            reloadSession,
          }
        : null,
    [session, guard, reloadSession],
  );

  if (!user) return <CompassScreen label={t("adLoading")} />;
  if (problem) {
    const code = problem instanceof ApiError ? problem.code : null;
    return (
      <AdminFrame>
        <div className="adm-gate">
          <div className="adm-gate-card">
            <span className="adm-gate-mark">
              <Icon name="alert" size={26} />
            </span>
            <h1>
              {code === "not_staff" ? t("adNotStaffTitle") : t("adUnavailable")}
            </h1>
            <p className="adm-gate-lead">
              {code === "not_staff"
                ? t("adNotStaffLead")
                : adminError(t, problem)}
            </p>
            <Link className="adm-btn quiet md" href="/maps">
              {t("adBackToSite")}
            </Link>
          </div>
        </div>
      </AdminFrame>
    );
  }
  if (!session) return <CompassScreen label={t("adLoading")} />;
  if (!session.two_factor.enabled)
    return (
      <AdminFrame>
        <TwoFactorSetup onDone={reloadSession} />
      </AdminFrame>
    );
  if (!session.two_factor.verified)
    return (
      <AdminFrame>
        <TwoFactorVerify email={session.email} onDone={reloadSession} />
      </AdminFrame>
    );

  return (
    <AdminFrame>
      <Ctx.Provider value={value}>
        <Shell>{children}</Shell>
        <StepUpDialog
          open={stepUp}
          onDone={() => {
            setStepUp(false);
            pending.current?.resolve();
            pending.current = null;
            void reloadSession();
          }}
          onCancel={() => {
            setStepUp(false);
            pending.current?.reject(new StepUpCancelled());
            pending.current = null;
          }}
        />
      </Ctx.Provider>
    </AdminFrame>
  );
}

/** Theme and toasts around every state of the panel. */
function AdminFrame({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useThemeState();
  return (
    <ThemeCtx.Provider value={{ theme, setTheme }}>
      {/* Toasts inside the themed root, so they get its colours. */}
      <div className="adm" data-theme={theme}>
        <ToastProvider>{children}</ToastProvider>
      </div>
    </ThemeCtx.Provider>
  );
}

const ThemeCtx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "dark",
  setTheme: () => {},
});

function useThemeState(): [Theme, (t: Theme) => void] {
  const [theme, set] = useState<Theme>("dark");
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch {}
    const initial: Theme =
      saved === "light" || saved === "dark"
        ? saved
        : window.matchMedia?.("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading the saved choice after hydration
    set(initial);
  }, []);
  const setTheme = useCallback((v: Theme) => {
    set(v);
    try {
      localStorage.setItem(THEME_KEY, v);
    } catch {}
  }, []);
  return [theme, setTheme];
}

function Shell({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation(),
    path = usePathname(),
    { session, can, reloadSession } = useAdmin(),
    { theme, setTheme } = useContext(ThemeCtx),
    [navOpen, setNavOpen] = useState(false),
    [palette, setPalette] = useState(false);
  const items = NAV.filter((n) => !n.permission || can(n.permission));
  const active = (href: string) =>
    href === "/admin" ? path === "/admin" : path.startsWith(href);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- close the mobile menu on navigation
    setNavOpen(false);
  }, [path]);

  function toggleLanguage() {
    const lang = i18n.language === "ar" ? "en" : "ar";
    void i18n.changeLanguage(lang);
    rememberLanguage(lang);
  }
  async function lock() {
    await admin.twoFactor.lock().catch(() => {});
    await reloadSession();
  }

  return (
    <div className={`adm-shell${navOpen ? " nav-open" : ""}`}>
      <aside className="adm-side">
        <Link href="/admin" className="adm-brand">
          <img src="/brand/compass-256.webp" alt="" width={30} height={30} />
          <span>
            <b>{t("acBrand")}</b>
            <small>{t("adConsole")}</small>
          </span>
        </Link>
        <nav className="adm-nav" aria-label={t("adConsole")}>
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active(n.href) ? "page" : undefined}
            >
              <Icon name={n.icon} />
              <span>{t(n.key)}</span>
            </Link>
          ))}
        </nav>
        <div className="adm-side-foot">
          <div className="adm-who">
            <span className="adm-avatar">
              {session.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <b>{session.name}</b>
              <small>{t(`adRole_${session.role}`)}</small>
            </span>
          </div>
          <Link href="/maps" className="adm-side-link">
            <Icon name="back" size={16} />
            {t("adBackToSite")}
          </Link>
        </div>
      </aside>
      <div className="adm-scrim" onClick={() => setNavOpen(false)} />
      <div className="adm-main">
        <header className="adm-top">
          <button
            className="adm-icon-btn adm-menu-btn"
            aria-label={t("adMenu")}
            onClick={() => setNavOpen((v) => !v)}
          >
            <Icon name="menu" />
          </button>
          <button
            className="adm-palette-trigger"
            onClick={() => setPalette(true)}
          >
            <Icon name="search" size={16} />
            <span>{t("adPaletteHint")}</span>
            <kbd dir="ltr">Ctrl K</kbd>
          </button>
          <div className="adm-top-end">
            <button
              className="adm-icon-btn"
              onClick={toggleLanguage}
              title={t("acLanguageToggle")}
            >
              <Icon name="globe" />
              <span className="adm-top-label">{t("acLanguageToggle")}</span>
            </button>
            <button
              className="adm-icon-btn"
              aria-label={
                theme === "dark" ? t("adThemeLight") : t("adThemeDark")
              }
              title={theme === "dark" ? t("adThemeLight") : t("adThemeDark")}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} />
            </button>
            <button
              className="adm-icon-btn"
              onClick={lock}
              title={t("adLockHint")}
            >
              <Icon name="lock" />
              <span className="adm-top-label">{t("adLock")}</span>
            </button>
          </div>
        </header>
        <main className="adm-content">{children}</main>
      </div>
      {palette && (
        <CommandPalette
          items={items}
          onClose={() => setPalette(false)}
          onAction={(a) => {
            if (a === "theme") setTheme(theme === "dark" ? "light" : "dark");
            if (a === "language") toggleLanguage();
            if (a === "lock") void lock();
          }}
        />
      )}
    </div>
  );
}

/** Ctrl+K: jump to a page, find a person by name or email, or run an action. */
function CommandPalette({
  items,
  onClose,
  onAction,
}: {
  items: NavItem[];
  onClose: () => void;
  onAction: (a: "theme" | "language" | "lock") => void;
}) {
  const { t } = useTranslation(),
    router = useRouter(),
    { can } = useAdmin(),
    [q, setQ] = useState(""),
    [people, setPeople] = useState<UserRow[]>([]),
    [index, setIndex] = useState(0),
    listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!can("users.view") || q.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing results for a short query
      setPeople([]);
      return;
    }
    let live = true;
    const id = setTimeout(async () => {
      try {
        const r = await admin.users.list({ q: q.trim(), per_page: 6 });
        if (live) setPeople(r.data);
      } catch {}
    }, 200);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [q, can]);

  type Entry = {
    id: string;
    label: string;
    hint?: string;
    icon: string;
    run: () => void;
  };
  const needle = q.trim().toLowerCase();
  const entries: Entry[] = [
    ...items
      .filter((n) => !needle || t(n.key).toLowerCase().includes(needle))
      .map((n) => ({
        id: n.href,
        label: t(n.key),
        hint: t("adPaletteGo"),
        icon: n.icon,
        run: () => router.push(n.href),
      })),
    ...people.map((p) => ({
      id: `u-${p.id}`,
      label: p.name,
      hint: p.email,
      icon: "users",
      run: () => router.push(`/admin/users/${p.id}`),
    })),
    ...(
      [
        ["theme", "adThemeToggle", "sun"],
        ["language", "acLanguageToggle", "globe"],
        ["lock", "adLock", "lock"],
      ] as const
    )
      .filter(([, k]) => !needle || t(k).toLowerCase().includes(needle))
      .map(([a, k, icon]) => ({
        id: a,
        label: t(k),
        hint: t("adPaletteAction"),
        icon,
        run: () => onAction(a),
      })),
  ];
  const sel = Math.min(index, Math.max(0, entries.length - 1));

  function choose(e: Entry | undefined) {
    if (!e) return;
    onClose();
    e.run();
  }

  return (
    <div className="adm-palette-backdrop" onMouseDown={onClose}>
      <div
        className="adm-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t("adPaletteHint")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="adm-palette-input">
          <Icon name="search" />
          <input
            autoFocus
            value={q}
            placeholder={t("adPalettePlaceholder")}
            onChange={(e) => {
              setQ(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, entries.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter") choose(entries[sel]);
            }}
            role="combobox"
            aria-expanded="true"
            aria-controls="adm-palette-list"
            aria-activedescendant={
              entries[sel] ? `pal-${entries[sel].id}` : undefined
            }
          />
        </div>
        <ul
          className="adm-palette-list"
          id="adm-palette-list"
          role="listbox"
          ref={listRef}
        >
          {entries.length === 0 && (
            <li className="adm-palette-empty">{t("adPaletteNone")}</li>
          )}
          {entries.map((e, i) => (
            <li
              key={e.id}
              id={`pal-${e.id}`}
              role="option"
              aria-selected={i === sel}
              onMouseEnter={() => setIndex(i)}
              onClick={() => choose(e)}
            >
              <Icon name={e.icon} size={16} />
              <span>{e.label}</span>
              {e.hint && <small dir="auto">{e.hint}</small>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Shown in place of a page the staff member has no permission for. */
export function RequirePermission({
  permission,
  children,
}: {
  permission: Permission;
  children: ReactNode;
}) {
  const { t } = useTranslation(),
    { can } = useAdmin();
  if (!can(permission))
    return (
      <div className="adm-empty">
        <b>{t("adNoAccessTitle")}</b>
        <p>{t("adNoAccessLead")}</p>
      </div>
    );
  return <>{children}</>;
}
