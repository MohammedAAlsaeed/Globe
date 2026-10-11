"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { auth } from "./api";
import { useAuth } from "./AuthProvider";
import { AuthShell } from "./AuthShell";
import { GoogleButton } from "./LoginForm";
import { CompassScreen, errorMessage, safeNext } from "./ui";
import {ApiError} from "@/lib/api/client";

export function RegisterForm() {
  const { t, i18n } = useTranslation(),
    router = useRouter(),
    params = useSearchParams(),
    next = safeNext(params.get("next")),
    { user, setUser } = useAuth();
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; form?: string }>({});

  useEffect(() => {
    if (user) router.replace(next);
  }, [user, next, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setErrors({ password: t("acPasswordsDiffer") });
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      setUser(
        await auth.register({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          password_confirmation: confirm,
          locale: i18n.language === "ar" ? "ar" : "en",
        }),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setErrors({
          name: err.field("name") ?? undefined,
          email: err.field("email") ? (/taken/i.test(err.field("email")!) ? t("acErrorEmailTaken") : err.field("email")!) : undefined,
          password: err.field("password") ? t("acPasswordHint") : undefined,
        });
      } else setErrors({ form: errorMessage(t, err) });
      setBusy(false);
    }
  }

  if (user) return <CompassScreen label={t("acSigningIn")} />;
  return (
    <AuthShell title={t("acRegisterTitle")} lead={t("acRegisterLead")}>
      <form className="auth-form" onSubmit={submit} noValidate>
        <label className="site-field">
          {t("acName")}
          <input autoComplete="name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
          {errors.name && <span className="site-field-error">{errors.name}</span>}
        </label>
        <label className="site-field">
          {t("acEmail")}
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} />
          {errors.email && <span className="site-field-error">{errors.email}</span>}
        </label>
        <label className="site-field">
          {t("acPassword")}
          <input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} />
          <span className={errors.password ? "site-field-error" : undefined}>{errors.password ?? t("acPasswordHint")}</span>
        </label>
        <label className="site-field">
          {t("acPasswordConfirm")}
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {errors.form && (
          <p className="site-notice error" role="alert">
            {errors.form}
          </p>
        )}
        <button className="site-btn" type="submit" disabled={busy || !name || !email || !password || !confirm}>
          {t("acCreateAccount")}
        </button>
      </form>
      <div className="auth-or">{t("acOr")}</div>
      <GoogleButton next={next} />
      <p className="auth-switch">
        {t("acHaveAccount")} <Link href={`/login?next=${encodeURIComponent(next)}`}>{t("acSignIn")}</Link>
      </p>
    </AuthShell>
  );
}
