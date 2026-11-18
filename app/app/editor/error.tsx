"use client";
/**
 * The editor failed while rendering. Work is saved on this device as it
 * changes (features/mapmaker/storage.ts), so the message says so.
 */
import { ErrorView, type ErrorPageProps } from "@/features/system/ErrorView";
import { Locales } from "@/components/Locales";

export default function EditorError(props: ErrorPageProps) {
  return (
    <Locales sections={["mapmaker"]}>
      <ErrorView {...props} variant="editor" />
    </Locales>
  );
}
