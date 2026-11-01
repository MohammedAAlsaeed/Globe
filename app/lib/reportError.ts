/**
 * Sends an error seen in this browser to the API, which writes it to the
 * server's log (POST /api/v1/client-errors), so errors on visitors' screens
 * show up where the server's own do.
 *
 * Kept small and safe to call from anywhere, an error page included: the
 * same error is sent once, at most ten per page load; noise that isn't ours
 * (browser extensions, cross-origin scripts) is skipped; nothing is sent
 * from a local development copy (the browser console has it all there).
 */
import { API_URL, ApiError, NetworkError } from "./api/client";
import { APP_ENV } from "./site";

export type ErrorKind = "render" | "global" | "window" | "promise";

const sent = new Set<string>();
let count = 0;

/** Expected outcomes the app already shows to the person: not bugs. */
function expected(error: unknown) {
  return error instanceof ApiError || error instanceof NetworkError;
}

function noise(message: string, stack: string) {
  return (
    /ResizeObserver loop|^Script error\.?$|Load failed|cancelled|AbortError/i.test(
      message,
    ) || /(chrome|moz|safari(-web)?)-extension:\/\//.test(stack)
  );
}

export function reportError(kind: ErrorKind, error: unknown, digest?: string) {
  if (typeof window === "undefined" || expected(error)) return;
  const e =
    error instanceof Error
      ? error
      : new Error(typeof error === "string" ? error : "Non-error thrown");
  const message = (e.message || e.name || "Unknown error").slice(0, 1000),
    stack = (e.stack ?? "").slice(0, 8000);
  if (noise(message, stack)) return;

  const key = `${kind}|${message}|${stack.slice(0, 300)}`;
  if (sent.has(key) || count >= 10) return;
  sent.add(key);
  count++;

  if (APP_ENV === "local") return;
  try {
    void fetch(`${API_URL}/api/v1/client-errors`, {
      method: "POST",
      // Still sent if the page is being left or reloaded.
      keepalive: true,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        kind,
        message,
        stack: stack || undefined,
        digest,
        url: location.href,
        release: APP_ENV,
      }),
    }).catch(() => {});
  } catch {}
}
