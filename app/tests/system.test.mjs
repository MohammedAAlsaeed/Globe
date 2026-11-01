import test from "node:test";
import assert from "node:assert/strict";

// A browser-ish world for the API client and the error reporter.
globalThis.window = new EventTarget();
globalThis.document = { cookie: "XSRF-TOKEN=t" };
globalThis.location = { href: "https://idrisi.win/maps?token=x" };
process.env.NEXT_PUBLIC_APP_ENV = "develop";

const { api, ApiError, NetworkError, SERVICE_EVENT } =
  await import("../lib/api/client.ts");
const { reportError } = await import("../lib/reportError.ts");

const events = [];
window.addEventListener(SERVICE_EVENT, (e) => events.push(e.detail));

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
let next = () => json(200, {});
const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  return next();
};

test("the API client reports maintenance, outages and recovery, once each", async () => {
  next = () =>
    json(503, { code: "maintenance", message: "Down", retry_after: 300 });
  await assert.rejects(api.get("plans"), (e) => e instanceof ApiError);
  assert.deepEqual(events.at(-1), { state: "maintenance", retryAfter: 300 });

  next = () => json(200, { status: "ok" });
  await api.get("status");
  assert.deepEqual(events.at(-1), { state: "ok", retryAfter: null });
  const count = events.length;
  await api.get("status"); // still ok: no new event
  assert.equal(events.length, count);

  next = () => json(502, {});
  await assert.rejects(api.get("plans"));
  assert.equal(events.at(-1).state, "unreachable");

  next = () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(api.get("plans"), (e) => e instanceof NetworkError);
  assert.equal(events.at(-1).state, "unreachable");

  next = () => json(404, { code: "not_found" });
  await assert.rejects(api.get("maps/x"));
  assert.equal(events.at(-1).state, "ok"); // the server answered
});

test("errors are reported once, without expected API errors or noise", () => {
  calls.length = 0;
  next = () => new Response(null, { status: 204 });

  const boom = new Error("Cannot read properties of undefined");
  reportError("render", boom, "123");
  reportError("render", boom, "123"); // the same one again
  assert.equal(calls.length, 1);
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.kind, "render");
  assert.equal(sent.message, "Cannot read properties of undefined");
  assert.equal(sent.digest, "123");
  assert.match(calls[0].url, /\/api\/v1\/client-errors$/);
  assert.equal(calls[0].init.keepalive, true);

  reportError("promise", new ApiError(422, "x", null, {}, {}));
  reportError("promise", new NetworkError("offline"));
  reportError("window", new Error("ResizeObserver loop limit exceeded"));
  const ext = new Error("x");
  ext.stack = "Error: x\n at chrome-extension://abc/content.js:1:1";
  reportError("window", ext);
  assert.equal(calls.length, 1);

  // At most ten per page load.
  for (let i = 0; i < 20; i++) reportError("window", new Error(`e${i}`));
  assert.equal(calls.length, 10);
});
