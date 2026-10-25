"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { auth } from "./api";
import { useAuth } from "./AuthProvider";
import { AuthShell } from "./AuthShell";
import { CompassScreen, GoogleMark, errorMessage, safeNext } from "./ui";
import { ApiError } from "@/lib/api/client";

/** Remembered across the Google round trip (it leaves the site). */
export const NEXT_KEY = "auth-next";

export function GoogleButton({ next }: { next: string }) {
  const { t } = useTranslation();
  return (
    <a
      className="site-btn quiet auth-google"
      href={auth.googleUrl()}
      onClick={() => {
        try {
          sessionStorage.setItem(NEXT_KEY, next);
        } catch {}
      }}
    >
      <GoogleMark />
      {t("acGoogle")}
    </a>
  );
}

function suspendedText(
  t: (k: string, o?: Record<string, unknown>) => string,
  reason: unknown,
) {
  return typeof reason === "string" && reason
    ? t("acSuspendedReason", { reason })
    : t("acSuspended");
}

export function LoginForm() {
  const { t } = useTranslation(),
    router = useRouter(),
    params = useSearchParams(),
    next = safeNext(params.get("next")),
    { user, setUser, endedBy, clearEnded } = useAuth();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [remember, setRemember] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);

  // Already signed in: nothing to do here.
  useEffect(() => {
    if (user) router.replace(next);
  }, [user, next, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setUser(await auth.login(email.trim(), password, remember));
      clearEnded();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 422
          ? t("acErrorCredentials")
          : err instanceof ApiError && err.code === "account_suspended"
            ? suspendedText(t, err.body.reason)
            : errorMessage(t, err),
      );
      setBusy(false);
    }
  }

  if (user) return <CompassScreen label={t("acSigningIn")} />;
  const googleError = params.get("error");
  return (
    <AuthShell title={t("acLoginTitle")} lead={t("acLoginLead")}>
      {googleError && (
        <p className="site-notice error" role="alert">
          {t(
            googleError === "google_email"
              ? "acGoogleEmail"
              : googleError === "suspended"
                ? "acSuspended"
                : "acGoogleFailed",
          )}
        </p>
      )}
      {endedBy && !error && (
        <p className="site-notice error" role="alert">
          {endedBy.code === "account_suspended"
            ? suspendedText(t, endedBy.reason)
            : t("acSessionEnded")}
        </p>
      )}
      {params.get("reset") === "1" && (
        <p className="site-notice ok">{t("acResetDone")}</p>
      )}
      <form className="auth-form" onSubmit={submit} noValidate>
        <label className="site-field">
          {t("acEmail")}
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="site-field">
          {t("acPassword")}
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <div className="auth-row">
          <label className="site-check">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            {t("acRemember")}
          </label>
          <Link href="/forgot-password">{t("acForgot")}</Link>
        </div>
        {error && (
          <p className="site-notice error" role="alert">
            {error}
          </p>
        )}
        <button
          className="site-btn"
          type="submit"
          disabled={busy || !email || !password}
        >
          {t("acSignIn")}
        </button>
      </form>
      <div className="auth-or">{t("acOr")}</div>
      <GoogleButton next={next} />
      <p className="auth-switch">
        {t("acNoAccount")}{" "}
        <Link href={`/register?next=${encodeURIComponent(next)}`}>
          {t("acCreateAccount")}
        </Link>
      </p>
    </AuthShell>
  );
}
