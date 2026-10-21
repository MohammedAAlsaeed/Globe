"use client";
/**
 * Where "Continue with Google" lands: the API has signed the browser in,
 * so load the user and go on to the page the person started from.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/features/account/AuthProvider";
import { NEXT_KEY } from "@/features/account/LoginForm";
import { CompassScreen, safeNext } from "@/features/account/ui";

export default function AuthCallbackPage() {
  const { t } = useTranslation(),
    router = useRouter(),
    { refresh } = useAuth();

  useEffect(() => {
    let next: string | null = null;
    try {
      next = sessionStorage.getItem(NEXT_KEY);
      sessionStorage.removeItem(NEXT_KEY);
    } catch {}
    void refresh().then((user) =>
      router.replace(user ? safeNext(next) : "/login?error=google"),
    );
  }, [refresh, router]);

  return <CompassScreen label={t("acSigningIn")} />;
}
