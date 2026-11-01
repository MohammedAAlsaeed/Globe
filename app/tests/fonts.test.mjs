import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import fontkit from "@pdf-lib/fontkit";

const root = new URL("..", import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), "utf8");
const DIR = "assets/fonts/thmanyah";

/** The files exactly as thmanyah publishes them (the licence forbids
 * changing them: no subsetting, no re-encoding). */
const PUBLISHED = {
  "thmanyahsans-Regular.woff2":
    "5bb4fa412273ca31d5c7a165191568b099069cb74bf1fc1dfcdc6a3c2a97552e",
  "thmanyahsans-Medium.woff2":
    "490bf85c58c82b5989a557ed18cd6c6e5a7518b8a440032acf946b5cb7de2850",
  "thmanyahsans-Bold.woff2":
    "90f7c5b4c796e102eee70e20a9346fe680c8bfe38289932b5e94290d9f150fb7",
  "thmanyahserifdisplay-Regular.woff2":
    "214a70d9dabcfa18649086841c25ccc67ef6630179837834bcffd3a149131ca6",
  "thmanyahserifdisplay-Bold.woff2":
    "d36da84ee5423145415425bdd9c10dc27f57a66afec031bd7b78e662572846ce",
};

const source = read("lib/fonts.ts");
/** Every `{ path, weight }` in lib/fonts.ts. */
const declared = [
  ...source.matchAll(/path:\s*"([^"]+)",\s*weight:\s*"(\d+)"/g),
].map(([, path, weight]) => ({
  file: path.split("/").pop(),
  path: join(root, "lib", path),
  weight: Number(weight),
}));

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

test("the font files are thmanyah's own, unchanged, and all used", () => {
  const present = readdirSync(join(root, DIR)).filter((f) =>
    f.endsWith(".woff2"),
  );
  assert.deepEqual(present.sort(), Object.keys(PUBLISHED).sort());
  for (const [file, sha] of Object.entries(PUBLISHED)) {
    const bytes = readFileSync(join(root, DIR, file));
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      sha,
      `${file} was changed`,
    );
  }
  assert.deepEqual(
    [...new Set(declared.map((d) => d.file))].sort(),
    Object.keys(PUBLISHED).sort(),
  );
  // Its licence travels with it.
  assert.ok(statSync(join(root, DIR, "LICENSE.pdf")).size > 0);
});

test("each file is declared with its own weight and family", () => {
  for (const { file, path, weight } of declared) {
    const font = fontkit.create(readFileSync(path));
    assert.equal(font["OS/2"].usWeightClass, weight, file);
    assert.match(
      font.familyName,
      file.startsWith("thmanyahsans")
        ? /^thmanyah sans/
        : /^thmanyah serif display/,
    );
  }
});

test("it stays out of public/, the Text Tool and exports", () => {
  // public/ is served as plain downloadable files.
  const pub = walk(join(root, "public")).map((p) => relative(root, p));
  assert.deepEqual(
    pub.filter((p) => /thmanyah/i.test(p)),
    [],
  );
  // The Text Tool's fonts are drawn into maps and embedded in exported
  // SVG and PDF: thmanyah's licence doesn't allow that.
  for (const dir of ["features/mapmaker", "features/studio", "public/fonts"]) {
    for (const p of walk(join(root, dir))) {
      if (!/\.(ts|tsx|json|mjs)$/.test(p)) continue;
      assert.ok(
        !/thmanyah/i.test(readFileSync(p, "utf8")),
        `${relative(root, p)} mentions thmanyah`,
      );
    }
  }
  // Only lib/fonts.ts loads the files.
  for (const dir of ["app", "features", "lib", "components"]) {
    for (const p of walk(join(root, dir))) {
      if (!/\.(ts|tsx|css|mjs)$/.test(p) || p.endsWith("lib/fonts.ts"))
        continue;
      assert.ok(
        !/thmanyah[\w-]*\.woff2/i.test(readFileSync(p, "utf8")),
        `${relative(root, p)} loads a font file`,
      );
    }
  }
});

test("other sites can't use the files (no CORS on static assets)", () => {
  const headers = read("public/_headers");
  assert.ok(!/access-control-allow-origin/i.test(headers));
});

test("Arabic pages use thmanyah throughout; English pages never load it", () => {
  const fonts = read("app/fonts.css");
  const base = fonts.match(/:root\s*{([^}]*)}/)[1];
  const ar = fonts.match(/html\[lang="ar"\]\s*{([^}]*)}/)[1];
  assert.match(ar, /--ui-sans:\s*var\(--font-thmanyah-sans\),/);
  assert.match(ar, /--ui-display:\s*var\(--font-thmanyah-display\),/);
  // English: its own fonts, which draw Arabic words too.
  assert.match(base, /--ui-sans:\s*"IBM Plex Sans Arabic"/);
  assert.match(base, /--ui-display:\s*"Amiri"/);
  assert.ok(!/thmanyah/.test(base));
  assert.match(read("app/globals.css"), /@import "\.\/fonts\.css";/);

  // Nothing outside the Arabic rules points at thmanyah directly, so an
  // English page never downloads it.
  for (const p of walk(join(root, "app"))
    .concat(walk(join(root, "features")))
    .filter((p) => p.endsWith(".css"))) {
    const css = readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const rel = relative(root, p);
    if (rel === "app/fonts.css") continue;
    assert.ok(!/--font-thmanyah/.test(css), `${rel} uses thmanyah directly`);
    // ...and no stylesheet names the English fonts directly either.
    assert.ok(!/IBM Plex|Amiri/.test(css), `${rel} names a font directly`);
  }

  // The editor and the print studio follow the page's language.
  const atelier = read("app/atelier.css");
  assert.match(
    atelier,
    /\[dir="rtl"\] {\s*--serif: var\(--ui-display\);\s*--sans: var\(--ui-sans\);/,
  );

  // The variables are defined on <html>, here and on the last-resort page,
  // with the fonts not preloaded (English pages don't need them).
  for (const p of ["app/layout.tsx", "app/global-error.tsx"])
    assert.match(read(p), /className={fontVariables}/, p);
  assert.equal([...source.matchAll(/preload: false/g)].length, 2);
  assert.equal([...source.matchAll(/localFont\(/g)].length, 2);
});
