/**
 * HTTP client for the Laravel API (../../api, served under /api/v1).
 *
 * The web app signs in with Sanctum's cookie-based SPA sessions: requests
 * carry the session cookie (`credentials: "include"`), and every request
 * that changes something sends the XSRF token Laravel put in the
 * `XSRF-TOKEN` cookie back as the `X-XSRF-TOKEN` header. The cookie is
 * fetched once from /sanctum/csrf-cookie and refreshed when it expires (419).
 */

/** Where the API lives. Set NEXT_PUBLIC_API_URL in .env.local for other setups. */
export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

/** An API error with the server's stable `code` (when it sent one). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Domain error code, e.g. "plan_limit_reached" or "revision_conflict". */
    readonly code: string | null,
    /** Validation errors by field (422). */
    readonly errors: Record<string, string[]>,
    /** The whole JSON body, for context fields such as `current_revision`. */
    readonly body: Record<string, unknown>,
  ) {
    super(message);
  }
  /** The first validation message for a field, if any. */
  field(name: string) {
    return this.errors[name]?.[0] ?? null;
  }
}

/** The server could not be reached at all (offline, API down). */
export class NetworkError extends Error {}

function xsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

let csrfReady: Promise<void> | null = null;
function ensureCsrf(force = false) {
  if (force || !csrfReady || !xsrfToken()) {
    csrfReady = fetch(`${API_URL}/sanctum/csrf-cookie`, {
      credentials: "include",
    })
      .then(() => undefined)
      .catch((e) => {
        csrfReady = null;
        throw new NetworkError(String(e));
      });
  }
  return csrfReady;
}

type Body = Record<string, unknown> | FormData | undefined;

async function send(
  method: string,
  path: string,
  body: Body,
  retried = false,
): Promise<Response> {
  const mutating = method !== "GET";
  if (mutating) await ensureCsrf();
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = xsrfToken();
  if (mutating && token) headers["X-XSRF-TOKEN"] = token;
  if (body && !(body instanceof FormData))
    headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1/${path.replace(/^\//, "")}`, {
      method,
      credentials: "include",
      headers,
      body:
        body instanceof FormData
          ? body
          : body
            ? JSON.stringify(body)
            : undefined,
    });
  } catch (e) {
    throw new NetworkError(String(e));
  }
  // Expired CSRF token: fetch a fresh one and try once more.
  if (res.status === 419 && mutating && !retried) {
    await ensureCsrf(true);
    return send(method, path, body, true);
  }
  return res;
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(
      res.status,
      typeof json.message === "string" ? json.message : res.statusText,
      typeof json.code === "string" ? json.code : null,
      (json.errors as Record<string, string[]>) ?? {},
      json,
    );
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => send("GET", path, undefined).then(parse<T>),
  post: <T>(path: string, body?: Body) =>
    send("POST", path, body).then(parse<T>),
  put: <T>(path: string, body?: Body) => send("PUT", path, body).then(parse<T>),
  patch: <T>(path: string, body?: Body) =>
    send("PATCH", path, body).then(parse<T>),
  delete: <T>(path: string) => send("DELETE", path, undefined).then(parse<T>),
};
