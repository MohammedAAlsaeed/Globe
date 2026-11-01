import test from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";

// A browser-ish world for the API client.
globalThis.window = new EventTarget();
globalThis.document = { cookie: "XSRF-TOKEN=t" };

const { api, roundNumbers } = await import("../lib/api/client.ts");

const calls = [];
let reply = () => ok();
const ok = (headers = { "Accept-Encoding": "gzip" }) =>
  new Response(JSON.stringify({ data: {} }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...headers },
  });
globalThis.fetch = async (url, init) => {
  if (String(url).includes("/sanctum/"))
    return new Response(null, { status: 204 });
  calls.push({ url: String(url), init });
  return reply(init);
};

/** A map-sized body: thousands of points printed with 17 digits. */
const bigDoc = () => ({
  points: Array.from({ length: 4000 }, (_, i) => [
    Math.sin(i) * 0.5 + 0.5,
    Math.cos(i * 1.3) * 0.5 + 0.5,
  ]),
  seed: 12345,
  tiny: 0.000123456789,
});

const bodyOf = (init) =>
  init.headers["Content-Encoding"] === "gzip"
    ? JSON.parse(gunzipSync(Buffer.from(init.body)).toString())
    : JSON.parse(init.body);

test("rounding keeps whole numbers and tiny values, rounds the rest", () => {
  const r = roundNumbers(6);
  assert.equal(r("", 0.123456789), 0.123457);
  assert.equal(r("", 1234.56789012), 1234.56789);
  assert.equal(r("", 42), 42);
  assert.equal(r("", 0.0001234567), 0.0001234567);
  assert.equal(r("", -0.5000004), -0.5);
  assert.equal(r("", "0.123456789"), "0.123456789");
});

test("map bodies are gzipped only once the API says it accepts gzip", async () => {
  calls.length = 0;
  // An API that never says so (or an older one): plain JSON, always.
  reply = () => ok({});
  await api.put("maps/a", { document: bigDoc() }, { compress: true });
  await api.put("maps/a", { document: bigDoc() }, { compress: true });
  assert.equal(calls[0].init.headers["Content-Encoding"], undefined);
  assert.equal(calls[1].init.headers["Content-Encoding"], undefined);
  assert.equal(typeof calls[1].init.body, "string");

  // It says so: the next large body goes gzipped, and expands to the same.
  reply = () => ok();
  await api.get("maps/a");
  const doc = bigDoc();
  await api.put("maps/a", { document: doc }, { compress: true, decimals: 6 });
  const sent = calls.at(-1).init;
  assert.equal(sent.headers["Content-Encoding"], "gzip");
  const plain = JSON.stringify({ document: doc });
  assert.ok(sent.body.byteLength < plain.length / 3, "at least 3x smaller");
  const back = bodyOf(sent).document;
  assert.equal(back.seed, 12345);
  assert.equal(back.tiny, 0.000123456789);
  assert.ok(Math.abs(back.points[7][0] - doc.points[7][0]) <= 5e-7);

  // Small bodies and calls that don't ask stay plain.
  await api.put("maps/a", { name: "x" }, { compress: true });
  assert.equal(calls.at(-1).init.headers["Content-Encoding"], undefined);
  await api.put("maps/a", { document: bigDoc() });
  assert.equal(calls.at(-1).init.headers["Content-Encoding"], undefined);
});

test("a refused gzip body is sent again plain, and compression stops", async () => {
  calls.length = 0;
  reply = (init) =>
    init.headers["Content-Encoding"] === "gzip"
      ? new Response(JSON.stringify({ code: "unsupported_encoding" }), {
          status: 415,
          headers: { "Content-Type": "application/json" },
        })
      : ok({});
  await api.put("maps/a", { document: bigDoc() }, { compress: true });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.headers["Content-Encoding"], "gzip");
  assert.equal(calls[1].init.headers["Content-Encoding"], undefined);
  assert.equal(bodyOf(calls[1].init).document.seed, 12345);

  await api.put("maps/a", { document: bigDoc() }, { compress: true });
  assert.equal(calls.length, 3);
  assert.equal(calls[2].init.headers["Content-Encoding"], undefined);
});
