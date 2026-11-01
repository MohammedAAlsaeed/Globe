/**
 * A title's text with its flourishes (lib/flourish.ts): the extended fatha
 * of thmanyah, and a gold highlight. Put it inside the heading:
 *
 *   <h1 className="fl-title"><Flourish text={t("mmLandingTitle")} /></h1>
 *
 * `fl-title` adds the entrance: the title is inked in the direction it is
 * read, then its highlight is drawn (nothing moves when the visitor asks for
 * reduced motion). Styles: app/flourish.css.
 */
import { parseFlourish } from "@/lib/flourish";

export function Flourish({ text }: { text: string }) {
  return (
    <>
      {parseFlourish(text).map((p, i) =>
        p.kind === "text" ? (
          p.text
        ) : p.kind === "mark" ? (
          <mark key={i} className="fl-mark">
            {p.text}
          </mark>
        ) : (
          // The kashidas and the long fatha are drawn, but the word reads
          // as written: screen readers and search skip the kashida (U+0640).
          <span
            key={i}
            className="fl-word"
            style={{ fontFeatureSettings: `"${p.feature}"` }}
          >
            {p.drawn}
          </span>
        ),
      )}
    </>
  );
}
