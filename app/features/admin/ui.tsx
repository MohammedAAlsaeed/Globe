"use client";
/**
 * The admin panel's building blocks: buttons and badges, dialogs (with a
 * reason or a typed confirmation), toasts, tables with paging, and the
 * filters that live in the URL so every view can be bookmarked and shared.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ApiError, NetworkError } from "@/lib/api/client";

export type T = (key: string, opts?: Record<string, unknown>) => string;

// ---- formatting --------------------------------------------------------------
export function fmtDate(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export function fmtDateTime(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/** "3 hours ago", in the interface language. */
export function fmtAgo(value: string | null | undefined, locale: string) {
  if (!value) return "—";
  const s = (new Date(value).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [86400 * 30, "day"],
    [86400 * 365, "month"],
    [Infinity, "year"],
  ];
  const div = [1, 60, 3600, 86400, 86400 * 30, 86400 * 365];
  for (let i = 0; i < steps.length; i++)
    if (Math.abs(s) < steps[i][0])
      return rtf.format(Math.round(s / div[i]), steps[i][1]);
  return "—";
}

export function fmtNumber(n: number | null | undefined, locale: string) {
  if (n === null || n === undefined) return "∞";
  return new Intl.NumberFormat(locale, {
    notation: Math.abs(n) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(n);
}

export function fmtBytes(bytes: number, locale: string) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes,
    i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 }).format(v)} ${units[i]}`;
}

/** A friendly message for any error a request can throw. */
export function adminError(t: T, e: unknown): string {
  if (e instanceof StepUpCancelled) return t("adStepUpCancelled");
  if (e instanceof NetworkError) return t("adErrNetwork");
  if (e instanceof ApiError) {
    if (e.status === 422 && Object.keys(e.errors).length)
      return Object.values(e.errors)[0][0];
    if (e.code && t(`adErr_${e.code}`) !== `adErr_${e.code}`)
      return t(`adErr_${e.code}`);
    if (e.status === 429) return t("adErrTooMany");
    if (e.status === 403) return t("adErrForbidden");
    if (e.status === 404) return t("adErrNotFound");
    if (e.message) return e.message;
  }
  return t("adErrGeneric");
}

// ---- small pieces ---------------------------------------------------------------
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "quiet" | "danger" | "ghost";
  size?: "sm" | "md";
  busy?: boolean;
};
export function Button({
  variant = "quiet",
  size = "md",
  busy,
  className,
  children,
  disabled,
  ...rest
}: BtnProps) {
  return (
    <button
      type="button"
      className={`adm-btn ${variant} ${size}${className ? ` ${className}` : ""}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy && <span className="adm-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Badge({
  tone = "neutral",
  children,
  title,
}: {
  tone?: "neutral" | "accent" | "ok" | "warn" | "danger" | "info";
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={`adm-badge ${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="adm-field">
      <span className="adm-field-label">{label}</span>
      {children}
      {error ? (
        <span className="adm-field-error" role="alert">
          {error}
        </span>
      ) : (
        hint && <span className="adm-field-hint">{hint}</span>
      )}
    </label>
  );
}

export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="adm-empty">
      <b>{title}</b>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Skeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="adm-skeleton" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} style={{ width: `${70 + ((i * 37) % 30)}%` }} />
      ))}
    </div>
  );
}

export function PageHead({
  title,
  lead,
  actions,
}: {
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="adm-pagehead">
      <div>
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
      </div>
      {actions && <div className="adm-pagehead-actions">{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`adm-card${className ? ` ${className}` : ""}`}>
      {(title || actions) && (
        <div className="adm-card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="adm-card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Copies text, saying so for a moment. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useTranslation(),
    [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {}
      }}
    >
      {done ? t("adCopied") : label}
    </Button>
  );
}

// ---- toasts -------------------------------------------------------------------------
type Toast = { id: number; kind: "ok" | "error"; text: string };
const ToastContext = createContext<(kind: Toast["kind"], text: string) => void>(
  () => {},
);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]),
    next = useRef(1);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = next.current++;
    setToasts((ts) => [...ts.slice(-3), { id, kind, text }]);
    setTimeout(
      () => setToasts((ts) => ts.filter((x) => x.id !== id)),
      kind === "error" ? 7000 : 3500,
    );
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="adm-toasts" role="status" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} className={`adm-toast ${x.kind}`}>
            {x.text}
            <button
              aria-label="×"
              onClick={() => setToasts((ts) => ts.filter((y) => y.id !== x.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---- dialogs ------------------------------------------------------------------------
/** A modal on the native <dialog> (focus trap, Escape and the top layer for free). */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`adm-dialog${wide ? " wide" : ""}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open && (
        <div className="adm-dialog-body">
          <h2 id={titleId}>{title}</h2>
          {children}
          {footer && <div className="adm-dialog-foot">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export interface ConfirmSpec {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** Ask for a reason (kept in the audit log). */
  reason?: boolean;
  /** The person must type this exactly (an email address, say). */
  typed?: string;
  run: (reason: string) => Promise<unknown>;
}

/** A confirmation with an optional reason and typed check. */
export function ConfirmDialog({
  spec,
  onClose,
}: {
  spec: ConfirmSpec | null;
  onClose: () => void;
}) {
  const { t } = useTranslation(),
    toast = useToast(),
    [reason, setReason] = useState(""),
    [typed, setTyped] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a fresh form for each confirmation
    setReason("");
    setTyped("");
    setError(null);
    setBusy(false);
  }, [spec]);
  const ok =
    (!spec?.reason || reason.trim().length >= 3) &&
    (!spec?.typed || typed.trim().toLowerCase() === spec.typed.toLowerCase());
  async function go() {
    if (!spec || !ok) return;
    setBusy(true);
    setError(null);
    try {
      await spec.run(reason.trim());
      onClose();
    } catch (e) {
      if (e instanceof StepUpCancelled) {
        setBusy(false);
        return;
      }
      setError(adminError(t, e));
      toast("error", adminError(t, e));
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={!!spec}
      title={spec?.title ?? ""}
      onClose={() => !busy && onClose()}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("adCancel")}
          </Button>
          <Button
            variant={spec?.danger ? "danger" : "primary"}
            busy={busy}
            disabled={!ok}
            onClick={go}
          >
            {spec?.confirmLabel}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void go();
        }}
        className="adm-stack"
      >
        {spec?.body && <div className="adm-dialog-text">{spec.body}</div>}
        {spec?.reason && (
          <Field label={t("adReason")} hint={t("adReasonHint")}>
            <textarea
              rows={3}
              maxLength={500}
              value={reason}
              autoFocus
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
        )}
        {spec?.typed && (
          <Field label={t("adTypeToConfirm", { value: spec.typed })}>
            <input
              value={typed}
              autoFocus={!spec.reason}
              autoComplete="off"
              spellCheck={false}
              dir="ltr"
              onChange={(e) => setTyped(e.target.value)}
            />
          </Field>
        )}
        {error && (
          <p className="adm-notice error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/** Thrown when the person closes the two-factor prompt instead of answering it. */
export class StepUpCancelled extends Error {}

// ---- URL-synced filters ---------------------------------------------------------------
/**
 * Filters and paging kept in the address bar (`?q=…&page=2`), so a view can
 * be reloaded, bookmarked or sent to a colleague as it is.
 */
export function useUrlQuery<K extends string>(keys: readonly K[]) {
  const params = useSearchParams(),
    router = useRouter(),
    path = usePathname();
  const values = useMemo(() => {
    const v = {} as Record<K, string>;
    for (const k of keys) v[k] = params.get(k) ?? "";
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keys is a constant list
  }, [params]);
  const set = useCallback(
    (patch: Partial<Record<K | "page", string | number | null>>) => {
      const p = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === "") p.delete(k);
        else p.set(k, String(v));
      }
      // A new filter starts from the first page.
      if (!("page" in patch)) p.delete("page");
      const s = p.toString();
      router.replace(s ? `${path}?${s}` : path, { scroll: false });
    },
    [params, path, router],
  );
  const page = Math.max(1, Number(params.get("page")) || 1);
  return { values, set, page };
}

/** A search box that waits for a pause in typing before searching. */
export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- follow the URL (back/forward)
    setDraft(value);
  }, [value]);
  useEffect(() => {
    if (draft === value) return;
    const id = setTimeout(() => onChange(draft), 300);
    return () => clearTimeout(id);
  }, [draft, value, onChange]);
  return (
    <input
      type="search"
      className="adm-search"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      aria-label={placeholder}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <select
      className="adm-select"
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Pager({
  meta,
  onPage,
}: {
  meta: { total: number; page: number; last_page: number; per_page: number };
  onPage: (page: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const from = meta.total ? (meta.page - 1) * meta.per_page + 1 : 0,
    to = Math.min(meta.total, meta.page * meta.per_page);
  return (
    <nav className="adm-pager" aria-label={t("adPaging")}>
      <span>
        {t("adShowing", {
          from: fmtNumber(from, i18n.language),
          to: fmtNumber(to, i18n.language),
          total: fmtNumber(meta.total, i18n.language),
        })}
      </span>
      <div>
        <Button
          size="sm"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
        >
          {t("adPrev")}
        </Button>
        <Button
          size="sm"
          disabled={meta.page >= meta.last_page}
          onClick={() => onPage(meta.page + 1)}
        >
          {t("adNext")}
        </Button>
      </div>
    </nav>
  );
}

/**
 * Loads data for a view and reloads when its inputs (`deps`, compared by
 * value) change. A slow answer to an older request never overwrites a newer one.
 */
export function useLoad<R>(load: () => Promise<R>, deps: unknown[]) {
  const [data, setData] = useState<R | null>(null),
    [error, setError] = useState<unknown>(null),
    [loading, setLoading] = useState(true),
    seq = useRef(0),
    latest = useRef(load),
    key = JSON.stringify(deps);
  useEffect(() => {
    latest.current = load;
  });
  const run = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const r = await latest.current();
      if (mine === seq.current) {
        setData(r);
        setError(null);
      }
    } catch (e) {
      if (mine === seq.current) setError(e);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading data for the view
    void run();
  }, [key, run]);
  return { data, error, loading, reload: run, setData };
}

export function ErrorNote({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="adm-notice error" role="alert">
      {adminError(t, error)}
      {onRetry && (
        <Button size="sm" variant="ghost" onClick={onRetry}>
          {t("adRetry")}
        </Button>
      )}
    </div>
  );
}
