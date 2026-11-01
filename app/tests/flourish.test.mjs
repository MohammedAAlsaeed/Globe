import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  parseFlourish,
  plainText,
  checkFlourish,
  KASHIDA,
  FATHA,
} from "../lib/flourish.ts";

const root = new URL("..", import.meta.url).pathname;
const { default: i18n } = await import("../lib/i18n.ts");
const bundles = {
  en: i18n.getResourceBundle("en", "translation"),
  ar: i18n.getResourceBundle("ar", "translation"),
};
const MARKER = /\^|==/;

test("an extended fatha: kashidas after its letter, the matching length", () => {
  const [, fatha, , mark] = parseFlourish(
    "ارسم ^3:عالَماً^. اطبع ==كرة أرضية==.",
  );
  assert.equal(fatha.kind, "fatha");
  assert.equal(fatha.word, "عالَماً");
  assert.equal(fatha.drawn, `عال${KASHIDA.repeat(3)}${FATHA}ماً`);
  assert.equal(fatha.feature, "ss05");
  assert.deepEqual(mark, { kind: "mark", text: "كرة أرضية" });

  // Two kashidas by default (ss04); a shadda stays on its letter.
  const [plain] = parseFlourish("^التحَكم^");
  assert.equal(plain.kashidas, 2);
  assert.equal(plain.feature, "ss04");
  assert.equal(
    parseFlourish("^تّوَقف^")[0].drawn,
    `تّو${KASHIDA.repeat(2)}${FATHA}قف`,
  );

  assert.equal(
    plainText("ارسم ^3:عالَماً^. اطبع ==كرة أرضية==."),
    "ارسم عالَماً. اطبع كرة أرضية.",
  );
  assert.deepEqual(parseFlourish("plain"), [{ kind: "text", text: "plain" }]);
});

test("thmanyah's rules: one of each, a real fatha, a letter that joins", () => {
  assert.deepEqual(checkFlourish("ارسم ^عالَماً^. اطبع ==كرة أرضية=="), []);
  const problem = (text, re) =>
    assert.ok(
      checkFlourish(text).some((p) => re.test(p)),
      `${text}: ${checkFlourish(text)}`,
    );
  problem("^عالماً^", /no fatha/); // nothing to extend
  problem("^بعودَتك^", /doesn't join/); // د doesn't join the next letter
  problem("^مدرسةَ^", /no letter after/); // nothing to stretch towards
  problem("^عَالَم^", /more than one fatha/);
  problem("^عالَم^ و^خَريطة^", /more than one extended fatha/);
  problem("==كرة== و==أرض==", /more than one highlight/);
  problem("==كرة أرضية", /unclosed/);
  problem("^كرة أرضَية^", /one word only/);
});

test("every title's flourishes keep the rules; long fathas only in Arabic", () => {
  let flourished = 0;
  for (const [lang, bundle] of Object.entries(bundles)) {
    for (const [key, value] of Object.entries(bundle)) {
      if (typeof value !== "string" || !MARKER.test(value)) continue;
      flourished++;
      assert.deepEqual(checkFlourish(value), [], `${lang}.${key}`);
      if (lang === "en")
        assert.ok(
          parseFlourish(value).every((p) => p.kind !== "fatha"),
          `en.${key} has a long fatha`,
        );
    }
  }
  assert.ok(flourished >= 15, `${flourished} flourished strings`);
});

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const sources = ["app", "features", "components"]
  .flatMap((d) => walk(join(root, d)))
  .filter((p) => /\.tsx?$/.test(p))
  .map((p) => ({ path: relative(root, p), text: readFileSync(p, "utf8") }));

test("strings with flourishes are shown through <Flourish> (or as plain text)", () => {
  const keys = new Set(
    Object.entries({ ...bundles.en, ...bundles.ar })
      .filter(([, v]) => typeof v === "string" && MARKER.test(v))
      .map(([k]) => k),
  );
  // Both languages flourish the same titles (or English keeps its plain
  // text): never a marker in a key the other language uses as plain text.
  for (const key of keys) {
    const uses = sources.flatMap(({ path, text }) =>
      [...text.matchAll(new RegExp(`(.{0,40})t\\("${key}"\\)`, "g"))].map(
        (m) => ({ path, before: m[1] }),
      ),
    );
    assert.ok(uses.length > 0, `${key} is not used`);
    for (const { path, before } of uses)
      assert.match(
        before,
        /(<Flourish text=\{|<AuthShell title=\{|plainText\()$/,
        `${path}: ${key} shown as plain text`,
      );
  }
});

test("the entrance moves nothing for people who ask for less motion", () => {
  const css = readFileSync(join(root, "app/flourish.css"), "utf8");
  const animated = css.indexOf("animation:");
  const guard = css.indexOf("@media (prefers-reduced-motion: no-preference)");
  assert.ok(guard >= 0 && guard < animated);
  // Every animation sits inside that block.
  const block = css.slice(guard, css.indexOf("\n}\n", guard));
  assert.equal(
    (css.match(/animation(-name)?:/g) ?? []).length,
    (block.match(/animation(-name)?:/g) ?? []).length,
  );
  // The site's stylesheet loads it.
  assert.match(
    readFileSync(join(root, "app/globals.css"), "utf8"),
    /@import "\.\/flourish\.css";/,
  );
});
