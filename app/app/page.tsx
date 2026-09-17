"use client";
/* Local blob images must stay in the browser; no image optimization server is used. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "../lib/i18n";
import {
  geometry,
  renderGores,
  pngWithDpi,
  type Settings,
} from "../lib/projection";

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    globe: (
      <>
        <circle cx="12" cy="12" r="9" />
        <ellipse cx="12" cy="12" rx="4" ry="9" />
        <path d="M3 12h18M5 6.5h14M5 17.5h14" />
      </>
    ),
    upload: (
      <>
        <path d="M12 16V3m-4 4 4-4 4 4M4 15v5h16v-5" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v13m-4-4 4 4 4-4M4 17v4h16v-4" />
      </>
    ),
    image: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8" cy="8" r="1.5" />
        <path d="m3 17 6-6 4 4 3-3 5 5" />
      </>
    ),
    sliders: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
        <path d="M8 3v6m8 0v6M10 15v6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    link: (
      <>
        <path
          d="m10 14 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"
          transform="translate(1 -1)"
        />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    ruler: (
      <>
        <path d="m3 16 13-13 5 5L8 21Z" />
        <path d="m7 12 3 3m1-7 3 3m1-7 3 3" />
      </>
    ),
    spark: (
      <>
        <path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    minus: <path d="M5 12h14" />,
    plus: <path d="M5 12h14M12 5v14" />,
    reset: (
      <>
        <path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-11v2" />
      </>
    ),
    grid: (
      <>
        <path d="M4 3v18m5-18v18m6-18v18m5-18v18M3 3h18M3 21h18" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.globe}
    </svg>
  );
}
function Astrolabe() {
  return (
    <svg className="astrolabe" viewBox="0 0 280 280" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth=".8">
        <circle cx="140" cy="140" r="115" />
        <circle cx="140" cy="140" r="108" />
        <circle cx="140" cy="140" r="92" />
        <circle cx="140" cy="140" r="62" />
        <ellipse
          cx="140"
          cy="140"
          rx="45"
          ry="108"
          transform="rotate(35 140 140)"
        />
        <ellipse
          cx="140"
          cy="140"
          rx="45"
          ry="108"
          transform="rotate(-35 140 140)"
        />
        <path d="M25 140h230M140 25v230M59 59l162 162M59 221 221 59" />
        {Array.from({ length: 60 }, (_, i) => (
          <path
            key={i}
            d={`M140 25v${i % 5 === 0 ? 10 : 4}`}
            transform={`rotate(${i * 6} 140 140)`}
          />
        ))}
        <path d="m140 63 16 61 61 16-61 16-16 61-16-61-61-16 61-16Z" />
        <circle cx="140" cy="140" r="9" />
      </g>
    </svg>
  );
}
export default function Home() {
  const { t, i18n } = useTranslation();
  const [s, setS] = useState<Settings>({
    height: 150,
    width: 150,
    gores: 12,
    gap: 3,
    offset: 0,
    guides: true,
    grid: false,
  });
  const [linked, setLinked] = useState(true),
    [dpi, setDpi] = useState(300),
    [format, setFormat] = useState("svg");
  const [source, setSource] = useState("/atelier-world.svg"),
    [filename, setFilename] = useState(""),
    [image, setImage] = useState<HTMLImageElement | null>(null);
  const [view, setView] = useState("gores"),
    [zoom, setZoom] = useState(1),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [modal, setModal] = useState(""),
    [drag, setDrag] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null),
    file = useRef<HTMLInputElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    currentUrl = useRef(""),
    uploadId = useRef(0);
  const g = geometry(s),
    sourceDpi = image
      ? Math.min(
          image.naturalWidth / ((Math.PI * s.width) / 25.4),
          image.naturalHeight / (g.goreHeight / 25.4),
        )
      : 0;
  useEffect(() => {
    const lang = localStorage.getItem("atelier-language");
    if (lang === "ar" || lang === "en") i18n.changeLanguage(lang);
  }, [i18n]);
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.documentElement.dir = i18n.language === "ar" ? "rtl" : "ltr";
  }, [i18n.language]);
  useEffect(() => {
    let active = true;
    const img = new Image();
    img.onload = () => {
      if (active) setImage(img);
    };
    img.onerror = () => {
      if (active) setNotice("uploadError");
    };
    img.src = source;
    return () => {
      active = false;
    };
  }, [source]);
  useEffect(() => {
    if (image && canvas.current && view === "gores")
      renderGores(canvas.current, image, s, 1600 / g.sheetWidth);
  }, [image, s, g.sheetWidth, view]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  useEffect(
    () => () => {
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    },
    [],
  );
  function change(key: keyof Settings, value: number | boolean) {
    setS((p) => ({
      ...p,
      [key]: value,
      ...(linked && (key === "height" || key === "width")
        ? { height: Number(value), width: Number(value) }
        : {}),
    }));
  }
  async function upload(f?: File) {
    if (!f) return;
    const id = ++uploadId.current;
    setNotice("");
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(f.type) ||
      f.size > 40 * 1024 * 1024
    ) {
      setNotice("errorImage");
      return;
    }
    const url = URL.createObjectURL(f),
      img = new Image();
    img.src = url;
    try {
      await img.decode();
      if (id !== uploadId.current) {
        URL.revokeObjectURL(url);
        return;
      }
      if (img.naturalWidth * img.naturalHeight > 60e6) throw new Error();
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
      currentUrl.current = url;
      setSource(url);
      setFilename(f.name);
    } catch {
      URL.revokeObjectURL(url);
      if (id === uploadId.current) setNotice("errorImage");
    }
  }
  async function download() {
    if (!image) return;
    setNotice("");
    const ppm = dpi / 25.4;
    if (
      Math.ceil(g.sheetWidth * ppm) * Math.ceil(g.sheetHeight * ppm) > 40e6 ||
      Math.max(g.sheetWidth, g.sheetHeight) * ppm > 16000
    ) {
      setNotice("errorExport");
      return;
    }
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 40));
      const out = document.createElement("canvas");
      renderGores(out, image, s, ppm);
      let blob: Blob;
      if (format === "png") blob = await pngWithDpi(out, dpi);
      else
        blob = new Blob(
          [
            `<svg xmlns="http://www.w3.org/2000/svg" width="${g.sheetWidth}mm" height="${g.sheetHeight}mm" viewBox="0 0 ${out.width} ${out.height}"><image width="${out.width}" height="${out.height}" href="${out.toDataURL("image/png")}"/></svg>`,
          ],
          { type: "image/svg+xml" },
        );
      const a = document.createElement("a");
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = `al-idrisi-${s.gores}-gores-${s.width}x${s.height}mm-${dpi}dpi.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      out.width = 0;
      out.height = 0;
      setNotice("ready");
    } catch {
      setNotice("errorGeneric");
    } finally {
      setBusy(false);
    }
  }
  const toggle = (key: "guides" | "grid", label: string) => (
    <button
      type="button"
      className="toggle-row"
      role="switch"
      aria-checked={s[key]}
      onClick={() => change(key, !s[key])}
    >
      <span>{t(label)}</span>
      <span className={`switch ${s[key] ? "on" : ""}`}>
        <i />
      </span>
    </button>
  );
  return (
    <div className="site-shell">
      <header className="header">
        <Link href="/" className="brand">
          <span className="brand-emblem">✳</span>
          <span>
            <b>{t("brand")}</b>
            <small>{t("atelier")}</small>
          </span>
        </Link>
        <nav aria-label={t("studio")}>
          <button className="nav-active" onClick={() => setModal("")}>
            {t("studio")}
          </button>
          <button onClick={() => setModal("guide")}>{t("guide")}</button>
          <button onClick={() => setModal("about")}>{t("about")}</button>
        </nav>
        <button
          className="language"
          onClick={() => {
            const lang = i18n.language === "en" ? "ar" : "en";
            i18n.changeLanguage(lang);
            localStorage.setItem("atelier-language", lang);
          }}
        >
          <Icon name="globe" size={17} />
          <span>{i18n.language === "en" ? "العربية" : "English"}</span>
        </button>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span /> {t("eyebrow")}
            </div>
            <h1>{t("title")}</h1>
            <p>{t("intro")}</p>
          </div>
          <Astrolabe />
          <span className="hero-coordinate">٢٤° ٤٢′ ش · ٤٦° ٤٠′ ق</span>
        </section>
        <div className="workspace-heading">
          <div className="project-name">
            <Icon name="globe" size={18} />
            <span>{t("project")}</span>
            <span className="saved">
              <i />
              {t("saved")}
            </span>
          </div>
          <div className="steps">
            <span>
              <b>01</b>
              {t("step1")}
            </span>
            <i />
            <span>
              <b>02</b>
              {t("step2")}
            </span>
            <i />
            <span>
              <b>03</b>
              {t("step3")}
            </span>
          </div>
        </div>
        <div className="workspace">
          <aside className="controls">
            <section className="control-section source-section">
              <h2>
                <Icon name="image" />
                {t("source")}
                <span className="section-number">01</span>
              </h2>
              <input
                ref={file}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(e) => {
                  upload(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <button
                className={`upload-zone ${drag ? "dragging" : ""}`}
                onClick={() => file.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  upload(e.dataTransfer.files[0]);
                }}
              >
                <span className="upload-icon">
                  <Icon name="upload" size={23} />
                </span>
                <strong>{t("upload")}</strong>
                <span>{t("drop")}</span>
                <small>{t("formats")}</small>
              </button>
              <div className="source-file">
                <img src={source} alt="" />
                <div>
                  <strong title={filename}>{filename || t("sample")}</strong>
                  <span>
                    {image
                      ? `${image.naturalWidth.toLocaleString()} × ${image.naturalHeight.toLocaleString()} px`
                      : t("empty")}
                  </span>
                </div>
                <button
                  title={t("replace")}
                  aria-label={t("replace")}
                  onClick={() => file.current?.click()}
                >
                  <Icon name="image" size={16} />
                </button>
              </div>
              <p className="micro">
                <Icon name="info" size={12} />
                {t("projection")}
              </p>
              {filename && (
                <button
                  className="text-button"
                  onClick={() => {
                    uploadId.current++;
                    setSource("/atelier-world.svg");
                    setFilename("");
                    setNotice("");
                  }}
                >
                  {t("sampleAction")}
                </button>
              )}
            </section>
            <section className="control-section">
              <h2>
                <Icon name="ruler" />
                {t("dimensions")}
                <span className="section-number">02</span>
              </h2>
              <p className="section-description">{t("sizeNote")}</p>
              <div className="dimension-inputs">
                {(["height", "width"] as const).map((key) => (
                  <label key={key}>
                    {t(key)}
                    <span className="number-box">
                      <input
                        type="number"
                        min="20"
                        max="500"
                        step="1"
                        value={s[key]}
                        onChange={(e) => {
                          if (e.target.value !== "")
                            change(
                              key,
                              Math.max(
                                20,
                                Math.min(500, Number(e.target.value)),
                              ),
                            );
                        }}
                      />
                      <span>{t("mm")}</span>
                    </span>
                  </label>
                ))}
              </div>
              <button
                className={`link-dimensions ${linked ? "linked" : ""}`}
                aria-pressed={linked}
                onClick={() => {
                  setLinked(!linked);
                  if (!linked) setS((p) => ({ ...p, width: p.height }));
                }}
              >
                <Icon name="link" size={14} />
                {t(linked ? "linked" : "unlinked")}
              </button>
              <div className="range-label">
                <label htmlFor="gores">{t("gores")}</label>
                <span>{s.gores}</span>
              </div>
              <input
                id="gores"
                type="range"
                min="6"
                max="36"
                step="2"
                value={s.gores}
                onChange={(e) => change("gores", +e.target.value)}
              />
              <div className="range-hints">
                <span>{t("fewer")}</span>
                <span>{t("more")}</span>
              </div>
              <div className="gore-presets">
                {[8, 12, 16, 24].map((n) => (
                  <button
                    key={n}
                    className={s.gores === n ? "selected" : ""}
                    onClick={() => change("gores", n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </section>
            <section className="control-section">
              <h2>
                <Icon name="sliders" />
                {t("settings")}
                <span className="section-number">03</span>
              </h2>
              <div className="inline-setting">
                <label htmlFor="offset">{t("seam")}</label>
                <span className="small-number">
                  <input
                    id="offset"
                    type="number"
                    min="-180"
                    max="180"
                    value={s.offset}
                    onChange={(e) =>
                      change(
                        "offset",
                        Math.max(-180, Math.min(180, +e.target.value)),
                      )
                    }
                  />
                  <span>°</span>
                </span>
              </div>
              <div className="inline-setting">
                <label htmlFor="gap">{t("gap")}</label>
                <span className="small-number">
                  <input
                    id="gap"
                    type="number"
                    min="0"
                    max="10"
                    step=".5"
                    value={s.gap}
                    onChange={(e) =>
                      change("gap", Math.max(0, Math.min(10, +e.target.value)))
                    }
                  />
                  <span>{t("mm")}</span>
                </span>
              </div>
              {toggle("guides", "cutlines")}
              {toggle("grid", "graticule")}
            </section>
            <div className="sidebar-note">
              <Icon name="shield" size={15} />
              <span>
                {t("private")}
                <small>{t("local")}</small>
              </span>
            </div>
          </aside>
          <div className="main-panel">
            <section className="preview-panel">
              <div className="preview-header">
                <h2>
                  {t("preview")}
                  <span className="live">
                    <i />
                    {t("live")}
                  </span>
                </h2>
                <button
                  className="icon-button"
                  title={t("reset")}
                  aria-label={t("reset")}
                  onClick={() => setZoom(1)}
                >
                  <Icon name="reset" size={16} />
                </button>
              </div>
              <div className="preview-toolbar">
                <div className="tabs">
                  <button
                    className={view === "gores" ? "active" : ""}
                    onClick={() => setView("gores")}
                  >
                    <Icon name="grid" size={15} />
                    {t("flat")}
                  </button>
                  <button
                    className={view === "source" ? "active" : ""}
                    onClick={() => setView("source")}
                  >
                    <Icon name="image" size={15} />
                    {t("original")}
                  </button>
                </div>
                <div className="zoom">
                  <button
                    aria-label="−"
                    onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
                  >
                    <Icon name="minus" size={13} />
                  </button>
                  <button onClick={() => setZoom(1)}>
                    {zoom === 1 ? t("fit") : `${Math.round(zoom * 100)}%`}
                  </button>
                  <button
                    aria-label="+"
                    onClick={() => setZoom(Math.min(3, zoom + 0.25))}
                  >
                    <Icon name="plus" size={13} />
                  </button>
                </div>
              </div>
              <div className="preview-scroll">
                <div
                  className="map-plate"
                  style={{
                    width: `${zoom * 100}%`,
                    minWidth: `${zoom * 100}%`,
                  }}
                >
                  <div className="plate-top">
                    <span>{t("plate")}</span>
                    <span>✧</span>
                    <span>AL-IDRISI ATELIER</span>
                  </div>
                  <div className="plate-title">
                    <h3>{t("plateDynamic", { count: s.gores })}</h3>
                    <p>{t("sinusoidal")}</p>
                  </div>
                  <div className="map-area">
                    <div className="pole-label">{t("north")}</div>
                    {view === "gores" ? (
                      <canvas
                        ref={canvas}
                        aria-label={t("preview")}
                        role="img"
                      />
                    ) : (
                      <img
                        className="original-map"
                        src={source}
                        alt={t("source")}
                      />
                    )}
                    <div className="pole-label">{t("south")}</div>
                  </div>
                  <div className="plate-bottom">
                    <span>✧</span>
                    <span>
                      {s.gores} {t("count")}
                      <i /> {s.width} × {s.height} {t("mm")}
                      <i /> 360°
                    </span>
                    <span>✧</span>
                  </div>
                </div>
              </div>
              <div className="preview-stats">
                {[
                  [t("count"), s.gores.toString()],
                  [t("goreHeight"), `${g.goreHeight.toFixed(1)} ${t("mm")}`],
                  [
                    t("sheet"),
                    `${g.sheetWidth.toFixed(0)} × ${g.sheetHeight.toFixed(0)} ${t("mm")}`,
                  ],
                  [t("resolution"), `${Math.round(sourceDpi)} ${t("dpi")}`],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="export-panel">
              <div className="export-heading">
                <span className="export-icon">
                  <Icon name="download" size={23} />
                </span>
                <div>
                  <h2>{t("export")}</h2>
                  <p>{t("exportNote")}</p>
                </div>
              </div>
              <div className="export-options">
                <label>
                  {t("quality")}
                  <select value={dpi} onChange={(e) => setDpi(+e.target.value)}>
                    {[150, 300, 600].map((n, i) => (
                      <option value={n} key={n}>
                        {n} {t("dpi")} — {t(["standard", "high", "maximum"][i])}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t("filetype")}
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                  >
                    <option value="svg">SVG</option>
                    <option value="png">PNG</option>
                  </select>
                </label>
                <button
                  className="export-button"
                  disabled={busy || !image}
                  onClick={download}
                >
                  <Icon name="download" size={18} />
                  {t(busy ? "exporting" : "download")}
                  <Icon name="chevron" size={16} />
                </button>
              </div>
              <p className={`quality-note ${sourceDpi < dpi ? "warning" : ""}`}>
                <Icon name={sourceDpi < dpi ? "info" : "check"} size={14} />
                {t(sourceDpi < dpi ? "qualityLow" : "qualityGood")}
                <span>{t("printTip")}</span>
              </p>
              {image &&
                Math.abs(image.naturalWidth / image.naturalHeight - 2) >
                  0.05 && <p className="notice warning">{t("ratioWarning")}</p>}
              {notice && (
                <p
                  role="status"
                  className={`notice ${notice === "ready" ? "success" : "warning"}`}
                >
                  {t(notice)}
                </p>
              )}
            </section>
            <section className="craft-banner">
              <span className="craft-star">✳</span>
              <div>
                <h3>{t("craftTitle")}</h3>
                <p>{t("craftText")}</p>
              </div>
              <button onClick={() => setModal("guide")} aria-label={t("guide")}>
                <Icon name="chevron" />
              </button>
            </section>
          </div>
        </div>
        <footer>
          <span>
            © {new Date().getFullYear()} {t("brand")} <i>·</i> {t("atelier")}
          </span>
          <span>{t("sourceCredit")}</span>
          <span>
            <Icon name="spark" size={12} />
            {t("precise")}
          </span>
        </footer>
      </main>
      <dialog
        ref={dialog}
        onCancel={() => setModal("")}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModal("");
        }}
      >
        <div className="dialog-header">
          <span className="eyebrow">{t("brand")}</span>
          <button
            className="icon-button"
            aria-label={t("close")}
            onClick={() => setModal("")}
          >
            <Icon name="close" />
          </button>
        </div>
        <h2>{t(modal === "guide" ? "helpTitle" : "about")}</h2>
        <p>{t(modal === "guide" ? "helpText" : "aboutText")}</p>
        <button className="export-button" onClick={() => setModal("")}>
          {t("close")}
        </button>
      </dialog>
    </div>
  );
}
