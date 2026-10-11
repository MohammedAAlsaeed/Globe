"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { auth } from "./api";
import { AuthShell } from "./AuthShell";
import { errorMessage } from "./ui";
import {ApiError} from "@/lib/api/client";

export function ForgotPasswordForm() {
  const { t } = useTranslation();
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [sent, setSent] = useState(false),
    [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.forgotPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(errorMessage(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t("acForgotTitle")} lead={t("acForgotLead")}>
      {sent ? (
        <p className="site-notice ok" role="status">
          {t("acLinkSent")}
        </p>
      ) : (
        <form className="auth-form" onSubmit={submit} noValidate>
          <label className="site-field">
            {t("acEmail")}
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && (
            <p className="site-notice error" role="alert">
              {error}
            </p>
          )}
          <button className="site-btn" type="submit" disabled={busy || !email}>
            {t("acSendLink")}
          </button>
        </form>
      )}
      <p className="auth-switch">
        <Link href="/login">{t("acBackToSignIn")}</Link>
      </p>
    </AuthShell>
  );
}

export function ResetPasswordForm() {
  const { t } = useTranslation(),
    router = useRouter(),
    params = useSearchParams(),
    token = params.get("token") ?? "",
    email = params.get("email") ?? "";
  const [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError(t("acPasswordsDiffer"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await auth.resetPassword({ token, email, password, password_confirmation: confirm });
      router.replace("/login?reset=1");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 422
          ? (err.field("password") ? t("acPasswordHint") : (err.field("email") ?? t("acResetInvalid")))
          : errorMessage(t, err),
      );
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t("acResetTitle")} lead={email || undefined}>
      {!token || !email ? (
        <p className="site-notice error">{t("acResetInvalid")}</p>
      ) : (
        <form className="auth-form" onSubmit={submit} noValidate>
          <label className="site-field">
            {t("acNewPassword")}
            <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            <span>{t("acPasswordHint")}</span>
          </label>
          <label className="site-field">
            {t("acPasswordConfirm")}
            <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          {error && (
            <p className="site-notice error" role="alert">
              {error}
            </p>
          )}
          <button className="site-btn" type="submit" disabled={busy || !password || !confirm}>
            {t("acResetButton")}
          </button>
        </form>
      )}
      <p className="auth-switch">
        <Link href="/forgot-password">{t("acForgotTitle")}</Link>
      </p>
    </AuthShell>
  );
}
