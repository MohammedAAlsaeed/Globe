"use client";
/**
 * The editor failed while rendering. Work is saved on this device as it
 * changes (features/mapmaker/storage.ts), so the message says so.
 */
import { ErrorView, type ErrorPageProps } from "@/features/system/ErrorView";

export default function EditorError(props: ErrorPageProps) {
  return <ErrorView {...props} variant="editor" />;
}
