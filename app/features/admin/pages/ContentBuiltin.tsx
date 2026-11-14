"use client";
/* eslint-disable @next/next/no-img-element -- previews are data URLs drawn by the editor's own engines */
/**
 * The art that ships inside the web app — built-in stamps, line art, line /
 * text / shape styles, textures and the Earth template — shown exactly as
 * the editor draws it, each with a switch: shown to customers, or hidden.
 *
 * This art is code, so it is never deleted: hiding takes an item out of the
 * editor's catalogs, and maps that already use it keep drawing it. Loaded in
 * the browser only (it draws with the editor's canvas engines).
 */
import { useMemo, useReducer, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAdmin } from "../AdminApp";
import { admin } from "../api";
import {
  Button,
  Empty,
  ErrorNote,
  Select,
  Skeleton,
  adminError,
  fmtNumber,
  useLoad,
  useToast,
} from "../ui";
import {
  setHiddenContent,
  type ControlKind,
} from "../../mapmaker/contentControls";
import { EarthThumb } from "../../mapmaker/CreateMapModal";
import {
  TEXTURES,
  TEXTURE_CATEGORIES,
  textureThumb,
} from "../../mapmaker/brush/textures";
import { builtinLineSets, lineSetLabel } from "../../mapmaker/lines/catalog";
import { lookPreview } from "../../mapmaker/lines/render";
import {
  builtinLineStyles,
  factoryLook,
  withSet,
} from "../../mapmaker/lines/state";
import { shapeLookPreview } from "../../mapmaker/shapes/render";
import { builtinShapeStyles } from "../../mapmaker/shapes/state";
import { BUILTIN_SETS, CLASSIC_SETS } from "../../mapmaker/stamps/builtin";
import { STAMP_CATEGORIES, builtinKey } from "../../mapmaker/stamps/catalog";
import { stampThumb } from "../../mapmaker/stamps/render";
import { TextSample } from "../../mapmaker/text/TextSample";
import { BUILTIN_TEXT_STYLES } from "../../mapmaker/text/state";

type T = (key: string, opts?: Record<string, unknown>) => string;

interface Item {
  key: string;
  label: string;
  /** Section heading inside the grid (a stamp or texture category). */
  group?: string;
  note?: string;
  preview: ReactNode;
}

/** A preview the editor draws on a canvas; redrawn when its art arrives. */
function Drawn({ draw }: { draw: (onReady: () => void) => HTMLCanvasElement }) {
  const [tick, redraw] = useReducer((n: number) => n + 1, 0);
  const url = useMemo(
    () => draw(redraw).toDataURL("image/png"),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick`: draw again once the art has loaded
    [draw, tick],
  );
  return <img src={url} alt="" draggable={false} />;
}

/** The first few variants of a stamp set, side by side. */
function StampThumbs({ set, variants }: { set: string; variants: number }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  return (
    <span className="adm-bi-stamps">
      {Array.from({ length: Math.min(4, variants) }, (_, v) => {
        const url = stampThumb(
          builtinKey(set, v),
          undefined,
          undefined,
          redraw,
        );
        return url ? <img key={v} src={url} alt="" draggable={false} /> : null;
      })}
    </span>
  );
}

function itemsOf(kind: ControlKind, t: T): Item[] {
  switch (kind) {
    case "stamp_set": {
      const category = (key: string) =>
        t(STAMP_CATEGORIES.find((c) => c.key === key)?.labelKey ?? key);
      return [...BUILTIN_SETS, ...CLASSIC_SETS].map((s) => ({
        key: s.id,
        label: t(s.labelKey),
        group: category(s.category),
        note: s.variants > 1 ? t("adVariants", { n: s.variants }) : undefined,
        preview: <StampThumbs set={s.id} variants={s.variants} />,
      }));
    }
    case "line_art":
      return builtinLineSets().map((s) => {
        const look = withSet(factoryLook(), s);
        return {
          key: s.id,
          label: lineSetLabel(t, s),
          preview: (
            <Drawn draw={(ready) => lookPreview(look, 168, 44, ready)} />
          ),
        };
      });
    case "line_style":
      return builtinLineStyles().map((s) => ({
        key: s.id,
        label: s.labelKey ? t(s.labelKey) : s.id,
        preview: (
          <Drawn draw={(ready) => lookPreview(s.look, 168, 44, ready)} />
        ),
      }));
    case "text_style":
      return BUILTIN_TEXT_STYLES.map((s) => {
        const label = s.labelKey ? t(s.labelKey) : s.id;
        return {
          key: s.id,
          label,
          preview: <TextSample text={label} look={s.look} height={44} />,
        };
      });
    case "shape_style":
      return builtinShapeStyles().map((s) => ({
        key: s.id,
        label: s.labelKey ? t(s.labelKey) : s.id,
        preview: (
          <Drawn draw={(ready) => shapeLookPreview(s.look, 96, 60, ready)} />
        ),
      }));
    case "texture": {
      const category = (key: string) =>
        t(TEXTURE_CATEGORIES.find((c) => c.key === key)?.labelKey ?? key);
      return TEXTURES.map((x) => ({
        key: x.id,
        label: t(x.labelKey),
        group: category(x.category),
        preview: <TextureSwatch id={x.id} />,
      }));
    }
    case "template":
      return [
        {
          key: "earth",
          label: t("mmTplEarth"),
          note: t("mmTplEarthNote"),
          preview: <EarthThumb />,
        },
      ];
  }
}

function TextureSwatch({ id }: { id: string }) {
  const url = useMemo(() => textureThumb(id), [id]);
  return <img className="fill" src={url} alt="" draggable={false} />;
}

export default function BuiltinContent({ kind }: { kind: ControlKind }) {
  const { t, i18n } = useTranslation(),
    L = i18n.language,
    toast = useToast(),
    { guard } = useAdmin(),
    { data, error, reload, setData } = useLoad(
      () => admin.content.hidden(),
      [],
    ),
    [busy, setBusy] = useState<string | null>(null),
    [show, setShow] = useState(""),
    // Previews are canvases: built once per language, not on every switch.
    items = useMemo(() => itemsOf(kind, t as T), [kind, t]);

  if (error) return <ErrorNote error={error} onRetry={reload} />;
  if (!data) return <Skeleton rows={4} />;
  const hidden = new Set(data[kind] ?? []),
    hiddenCount = items.filter((i) => hidden.has(i.key)).length;

  async function change(keys: string[], hide: boolean) {
    setBusy(keys.length === 1 ? keys[0] : "*");
    try {
      const next = await guard(() => admin.content.setHidden(kind, keys, hide));
      setData(next);
      // This browser's editor follows at once; everyone else's within a minute.
      setHiddenContent(next);
      toast("ok", t("adSaved"));
    } catch (e) {
      toast("error", adminError(t, e));
    } finally {
      setBusy(null);
    }
  }

  const listed = items.filter((i) =>
      show === "hidden"
        ? hidden.has(i.key)
        : show === "shown"
          ? !hidden.has(i.key)
          : true,
    ),
    groups: { title: string | undefined; items: Item[] }[] = [];
  for (const i of listed) {
    const g = groups.find((x) => x.title === i.group);
    if (g) g.items.push(i);
    else groups.push({ title: i.group, items: [i] });
  }

  return (
    <section className="adm-bi">
      <div className="adm-toolbar">
        <h2 className="adm-subhead">{t(`adBuiltin_${kind}`)}</h2>
        <span className="adm-muted small">
          {t("adBuiltinCount", {
            shown: fmtNumber(items.length - hiddenCount, L),
            hidden: fmtNumber(hiddenCount, L),
          })}
        </span>
        {items.length > 1 && (
          <Select
            label={t("adFilterState")}
            value={show}
            onChange={setShow}
            options={[
              { value: "", label: t("adShowEverything") },
              { value: "shown", label: t("adShown") },
              { value: "hidden", label: t("adHidden") },
            ]}
          />
        )}
        {hiddenCount > 0 && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy !== null}
            onClick={() =>
              change(
                items.filter((i) => hidden.has(i.key)).map((i) => i.key),
                false,
              )
            }
          >
            {t("adShowAll")}
          </Button>
        )}
      </div>
      {listed.length === 0 ? (
        <Empty title={t("adNoResults")} />
      ) : (
        groups.map((g) => (
          <div key={g.title ?? ""} className="adm-bi-group">
            {g.title && <h3 className="adm-bi-title">{g.title}</h3>}
            <ul className={`adm-bi-grid ${kind}`}>
              {g.items.map((i) => {
                const off = hidden.has(i.key);
                return (
                  <li key={i.key} className={off ? "off" : undefined}>
                    <span className="adm-bi-preview">{i.preview}</span>
                    <b title={i.label}>{i.label}</b>
                    {i.note && <small>{i.note}</small>}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!off}
                      aria-label={i.label}
                      className={`adm-switch${off ? "" : " on"}`}
                      disabled={busy !== null}
                      onClick={() => change([i.key], !off)}
                    >
                      <span />
                      {off ? t("adHidden") : t("adShown")}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
