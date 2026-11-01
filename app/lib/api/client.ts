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

/**
 * The API's state as the last request saw it, for the notices and the
 * maintenance screen (features/system/ServiceStatus.tsx): fired on changes
 * only. "maintenance": the API answered 503 `maintenance` (php artisan down);
 * "unreachable": no answer, or a gateway error.
 */
export const SERVICE_EVENT = "idrisi:service";
export type ServiceState = "ok" | "maintenance" | "unreachable";
export type ServiceDetail = {
  state: ServiceState;
  /** Seconds until the API expects to be back (maintenance only). */
  retryAfter: number | null;
};

let serviceState: ServiceState = "ok";
function setService(state: ServiceState, retryAfter: number | null = null) {
  if (state === serviceState && state !== "maintenance") return;
  serviceState = state;
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ServiceDetail>(SERVICE_EVENT, {
      detail: { state, retryAfter },
    }),
  );
}

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
        setService("unreachable");
        throw new NetworkError(String(e));
      });
  }
  return csrfReady;
}

type Body = Record<string, unknown> | FormData | undefined;

/** How a JSON body is sent (map saves: large, so made smaller). */
export type SendOptions = {
  /** Gzip the body (`Content-Encoding: gzip`) when the API accepts that. */
  compress?: boolean;
  /** Round fractional numbers to this many decimals (see `roundNumbers`). */
  decimals?: number;
};

/**
 * Whether the API expands gzip request bodies: it says so on every
 * response (`Accept-Encoding: gzip`, RFC 7694). Until a response has said
 * so, nothing is compressed, so a web app deployed ahead of its API still
 * saves.
 */
let gzipAccepted = false;
const GZIP_FROM = 4 * 1024; // smaller bodies gain too little to bother

/**
 * A JSON replacer that rounds fractional numbers to `decimals` places.
 * Map documents are mostly normalized coordinates printed with 17 digits;
 * six decimals of a 20 000 px map is a hundredth of a pixel. Whole numbers
 * and tiny values (under 0.001, where six decimals would lose precision)
 * are kept as they are.
 */
export const roundNumbers = (decimals: number) => {
  const f = 10 ** decimals;
  return (_key: string, v: unknown) =>
    typeof v === "number" &&
    Number.isFinite(v) &&
    !Number.isInteger(v) &&
    Math.abs(v) >= 1e-3
      ? Math.round(v * f) / f
      : v;
};

/** Gzips text with the browser's own CompressionStream. */
export async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The JSON (or form) as sent, and whether it went gzipped. */
async function encode(
  body: Body,
  options: SendOptions,
): Promise<{ payload: BodyInit | undefined; gzipped: boolean }> {
  if (!body) return { payload: undefined, gzipped: false };
  if (body instanceof FormData) return { payload: body, gzipped: false };
  const json = JSON.stringify(
    body,
    options.decimals !== undefined ? roundNumbers(options.decimals) : undefined,
  );
  if (
    options.compress &&
    gzipAccepted &&
    json.length >= GZIP_FROM &&
    typeof CompressionStream !== "undefined"
  ) {
    try {
      return { payload: (await gzip(json)) as BodyInit, gzipped: true };
    } catch {
      // Compression failed (rare): send it as it is.
    }
  }
  return { payload: json, gzipped: false };
}

async function send(
  method: string,
  path: string,
  body: Body,
  options: SendOptions = {},
  retried = false,
): Promise<Response> {
  const mutating = method !== "GET";
  if (mutating) await ensureCsrf();
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = xsrfToken();
  if (mutating && token) headers["X-XSRF-TOKEN"] = token;
  if (body && !(body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const { payload, gzipped } = await encode(body, options);
  if (gzipped) headers["Content-Encoding"] = "gzip";

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1/${path.replace(/^\//, "")}`, {
      method,
      credentials: "include",
      headers,
      body: payload,
    });
  } catch (e) {
    setService("unreachable");
    throw new NetworkError(String(e));
  }
  if (/\bgzip\b/i.test(res.headers.get("Accept-Encoding") ?? ""))
    gzipAccepted = true;
  // The API refused the compressed body after all (a proxy on the way, or
  // an older API): stop compressing and send this one again as it is.
  if (gzipped && (res.status === 415 || res.status === 400)) {
    const code = await res
      .clone()
      .json()
      .then((j: { code?: unknown }) => j.code)
      .catch(() => null);
    if (res.status === 415 || code === "bad_encoding") {
      gzipAccepted = false;
      return send(method, path, body, { ...options, compress: false }, retried);
    }
  }
  // Expired CSRF token: fetch a fresh one and try once more.
  if (res.status === 419 && mutating && !retried) {
    await ensureCsrf(true);
    return send(method, path, body, options, true);
  }
  return res;
}

/**
 * Fired when the server ends this browser's session on its own: staff
 * signed the person out everywhere (`session_ended`) or suspended the
 * account (`account_suspended`). The account provider listens for it.
 */
export const SIGNED_OUT_EVENT = "idrisi:signed-out";
export type SignedOutDetail = { code: string; reason: string | null };

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) {
    setService("ok");
    return undefined as T;
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.status === 503 && json.code === "maintenance") {
    setService(
      "maintenance",
      typeof json.retry_after === "number" ? json.retry_after : null,
    );
  } else if (res.status === 502 || res.status === 503 || res.status === 504) {
    setService("unreachable");
  } else {
    setService("ok");
  }
  if (!res.ok) {
    if (
      (res.status === 401 && json.code === "session_ended") ||
      (res.status === 403 && json.code === "account_suspended")
    ) {
      window.dispatchEvent(
        new CustomEvent<SignedOutDetail>(SIGNED_OUT_EVENT, {
          detail: {
            code: json.code,
            reason: typeof json.reason === "string" ? json.reason : null,
          },
        }),
      );
    }
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
  post: <T>(path: string, body?: Body, options?: SendOptions) =>
    send("POST", path, body, options).then(parse<T>),
  put: <T>(path: string, body?: Body, options?: SendOptions) =>
    send("PUT", path, body, options).then(parse<T>),
  patch: <T>(path: string, body?: Body) =>
    send("PATCH", path, body).then(parse<T>),
  delete: <T>(path: string) => send("DELETE", path, undefined).then(parse<T>),
  /** DELETE with a body (a confirmation or a reason). */
  deleteWith: <T>(path: string, body: Body) =>
    send("DELETE", path, body).then(parse<T>),
};
