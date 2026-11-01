"use client";
/**
 * Whether the atelier's server can be used right now, and what to show when
 * it can't:
 *
 *  - offline (the browser says so): a notice; the editor and the print
 *    studio keep working on this device;
 *  - maintenance (the API answered 503 `maintenance`): pages that need the
 *    server (sign-in, My maps, the library, settings, admin) show the
 *    maintenance screen; the others a notice;
 *  - unreachable (no answer, or a gateway error): a notice.
 *
 * While not "ok" it checks GET /api/v1/status every so often (sooner when
 * the browser comes back online), and everything returns by itself.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  api,
  SERVICE_EVENT,
  type ServiceDetail,
  type ServiceState,
} from "@/lib/api/client";
import { Flourish } from "@/components/ui/Flourish";

type Status = {
  state: ServiceState;
  online: boolean;
  /** When the API expects to be back (maintenance), in ms since the epoch. */
  backAt: number | null;
  /** The same, in whole minutes from when the API said so. */
  backInMinutes: number | null;
  /** Ask the API now (the "Check now" button). */
  check: () => Promise<void>;
  checking: boolean;
};

const Ctx = createContext<Status>({
  state: "ok",
  online: true,
  backAt: null,
  backInMinutes: null,
  check: async () => {},
  checking: false,
});

export const useServiceStatus = () => useContext(Ctx);

/** Pages that can do nothing without the server. */
const NEEDS_SERVER = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/auth",
  "/maps",
  "/library",
  "/settings",
  "/admin",
];
const needsServer = (path: string) =>
  NEEDS_SERVER.some((p) => path === p || path.startsWith(`${p}/`));

export function ServiceStatusProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ServiceState>("ok"),
    [online, setOnline] = useState(true),
    [backAt, setBackAt] = useState<number | null>(null),
    [backInMinutes, setBackInMinutes] = useState<number | null>(null),
    [checking, setChecking] = useState(false),
    [recovered, setRecovered] = useState(false),
    attempt = useRef(0),
    path = usePathname() ?? "/";

  const check = useCallback(async () => {
    setChecking(true);
    try {
      // The client reports the outcome (ok / maintenance / unreachable).
      await api.get("status");
    } catch {
    } finally {
      setChecking(false);
    }
  }, []);

  // What the API client saw.
  useEffect(() => {
    const onService = (e: Event) => {
      const { state: next, retryAfter } = (e as CustomEvent<ServiceDetail>)
        .detail;
      setState((prev) => {
        if (prev !== "ok" && next === "ok") setRecovered(true);
        return next;
      });
      setBackAt(retryAfter ? Date.now() + retryAfter * 1000 : null);
      setBackInMinutes(
        retryAfter ? Math.max(1, Math.round(retryAfter / 60)) : null,
      );
      if (next === "ok") attempt.current = 0;
    };
    window.addEventListener(SERVICE_EVENT, onService);
    return () => window.removeEventListener(SERVICE_EVENT, onService);
  }, []);

  // What the browser knows about the connection.
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const back = () => {
      update();
      void check();
    };
    update();
    window.addEventListener("online", back);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", back);
      window.removeEventListener("offline", update);
    };
  }, [check]);

  // Not ok: ask again, a little later each time (maintenance: when the API
  // said it would be back, within reason).
  useEffect(() => {
    if (state === "ok" || !online) return;
    const wait =
      state === "maintenance"
        ? Math.min(Math.max((backAt ?? 0) - Date.now(), 15_000), 120_000)
        : Math.min(10_000 * 2 ** attempt.current, 60_000);
    const timer = setTimeout(() => {
      attempt.current++;
      void check();
    }, wait);
    return () => clearTimeout(timer);
  }, [state, online, backAt, check, checking]);

  // "Connected again", briefly.
  useEffect(() => {
    if (!recovered) return;
    const timer = setTimeout(() => setRecovered(false), 4000);
    return () => clearTimeout(timer);
  }, [recovered]);

  const value: Status = {
    state,
    online,
    backAt,
    backInMinutes,
    check,
    checking,
  };
  const blocked = state === "maintenance" && needsServer(path);

  return (
    <Ctx.Provider value={value}>
      {blocked ? <MaintenanceScreen /> : children}
      <StatusBanner recovered={recovered} hidden={blocked} />
    </Ctx.Provider>
  );
}

function StatusBanner({
  recovered,
  hidden,
}: {
  recovered: boolean;
  hidden: boolean;
}) {
  const { t } = useTranslation(),
    { state, online } = useServiceStatus();
  if (hidden) return null;
  const message = !online
    ? t("sysBannerOffline")
    : state === "maintenance"
      ? t("sysBannerMaintenance")
      : state === "unreachable"
        ? t("sysBannerUnreachable")
        : recovered
          ? t("sysBannerBack")
          : null;
  if (!message) return null;
  const tone = !online || state !== "ok" ? "warn" : "ok";
  return (
    <div className={`status-banner ${tone}`} role="status" aria-live="polite">
      <span className="status-dot" aria-hidden />
      {message}
    </div>
  );
}

/** The whole page, while the server is in maintenance. */
export function MaintenanceScreen() {
  const { t } = useTranslation(),
    { backInMinutes: minutes, check, checking } = useServiceStatus();
  return (
    <div className="site system-page">
      <main className="system-main">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand artwork */}
        <img
          className="system-rose turning"
          src="/brand/compass-512.webp"
          alt=""
          width={150}
          height={150}
        />
        <h1 className="fl-title">
          <Flourish text={t("sysMaintenanceTitle")} />
        </h1>
        <p className="system-lead">{t("sysMaintenanceLead")}</p>
        {minutes && (
          <p className="system-note">{t("sysMaintenanceUntil", { minutes })}</p>
        )}
        <p className="system-note">{t("sysMaintenanceOffline")}</p>
        <div className="system-actions">
          <button
            className="site-btn"
            onClick={() => void check()}
            disabled={checking}
          >
            {checking ? t("sysChecking") : t("sysCheckNow")}
          </button>
          <Link className="site-btn quiet" href="/editor">
            {t("sysOpenEditor")}
          </Link>
          <Link className="site-btn quiet" href="/print">
            {t("sysPrintStudio")}
          </Link>
        </div>
      </main>
    </div>
  );
}
