import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// A browser-ish Image: loads succeed or fail per URL, as the test decides.
const outcome = new Map(); // url -> "ok" | "fail"
const loads = [];
globalThis.Image = class {
  set src(url) {
    this._src = url;
    loads.push({ url, crossOrigin: this.crossOrigin });
    queueMicrotask(() =>
      (outcome.get(url) ?? "ok") === "ok" ? this.onload?.() : this.onerror?.(),
    );
  }
  get src() {
    return this._src;
  }
};
const fetches = [];
let fetchStatus = 200;
globalThis.fetch = async (url, init) => {
  fetches.push({ url, init });
  return new Response(fetchStatus === 200 ? "png" : null, {
    status: fetchStatus,
  });
};
globalThis.URL.createObjectURL = () => "blob:http://site/1";

const { loadCorsImage } = await import("../lib/corsImage.ts");
const reset = () => {
  loads.length = 0;
  fetches.length = 0;
  outcome.clear();
  fetchStatus = 200;
};

test("loads with CORS; nothing more when it works", async () => {
  reset();
  const img = await loadCorsImage("https://r2/a.png?sig=1");
  assert.equal(img.src, "https://r2/a.png?sig=1");
  assert.deepEqual(loads, [
    { url: "https://r2/a.png?sig=1", crossOrigin: "anonymous" },
  ]);
  assert.equal(fetches.length, 0);
});

test("a cached non-CORS copy: fetched again past the cache, drawn from a blob", async () => {
  reset();
  outcome.set("https://r2/b.png?sig=1", "fail");
  const img = await loadCorsImage("https://r2/b.png?sig=1");
  assert.equal(fetches.length, 1);
  // The signed URL unchanged (a changed one would break its signature).
  assert.equal(fetches[0].url, "https://r2/b.png?sig=1");
  assert.equal(fetches[0].init.cache, "reload");
  assert.equal(fetches[0].init.mode, "cors");
  assert.equal(img.src, "blob:http://site/1");
});

test("a file that really can't be read fails once, without a loop", async () => {
  reset();
  outcome.set("https://r2/c.png?sig=1", "fail");
  fetchStatus = 403;
  await assert.rejects(loadCorsImage("https://r2/c.png?sig=1"));
  assert.equal(fetches.length, 1);
  assert.equal(loads.length, 1);

  // The blob itself failing (not an image): fails too, no second retry.
  reset();
  outcome.set("https://r2/d.png?sig=1", "fail");
  outcome.set("blob:http://site/1", "fail");
  await assert.rejects(loadCorsImage("https://r2/d.png?sig=1"));
  assert.equal(fetches.length, 1);
});

const root = new URL("..", import.meta.url).pathname;
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

test("uploaded images are loaded the same way everywhere (CORS)", () => {
  // Every <img> showing an uploaded asset's URL asks for CORS, like the
  // editor's canvas: a plain copy in the cache would break the canvas.
  for (const p of ["app", "features", "components"]
    .flatMap((d) => walk(join(root, d)))
    .filter((p) => p.endsWith(".tsx"))) {
    const src = readFileSync(p, "utf8");
    for (const m of src.matchAll(/<img\b[^>]*?src=\{(\w+)\.url}[^>]*?\/>/gs)) {
      if (!["a", "asset", "s", "stamp"].includes(m[1])) continue;
      assert.match(
        m[0],
        /crossOrigin="anonymous"/,
        `${relative(root, p)}: an image of ${m[1]}.url without crossOrigin`,
      );
    }
  }
  // The canvas loads uploaded images through the loader with the retry.
  const render = readFileSync(
    join(root, "features/mapmaker/stamps/render.ts"),
    "utf8",
  );
  assert.match(render, /loadCorsImage\(a\.url\)/);
  assert.ok(!/new Image\(\)/.test(render), "render.ts loads images itself");
});
