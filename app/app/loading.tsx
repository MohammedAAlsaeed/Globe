"use client";
/**
 * Shown while a page's server render streams in on navigation: the compass
 * rose swinging to north (the same loader the pages use for their data).
 */
import { useTranslation } from "react-i18next";
import { CompassScreen } from "@/features/account/ui";

export default function Loading() {
  const { t } = useTranslation();
  return <CompassScreen label={t("sysLoading")} />;
}
