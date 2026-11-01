"use client";
/**
 * A page that failed while rendering: shown in its place, inside the site's
 * layout (the header and language still work). See features/system.
 */
import { ErrorView, type ErrorPageProps } from "@/features/system/ErrorView";

export default function Error(props: ErrorPageProps) {
  return <ErrorView {...props} />;
}
