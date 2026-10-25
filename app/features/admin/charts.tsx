"use client";
/**
 * The dashboard's charts, drawn as SVG: one series each (the card title
 * names it, so no legend), a 2px line over a 10% wash, hairline grid, and a
 * crosshair tooltip on hover or keyboard focus. Every chart has a table
 * view for screen readers and for reading exact values.
 */
import { useId, useMemo, useRef, useState } from "react";
import { fmtNumber } from "./ui";

export interface Point {
  date: string;
  n: number;
}

function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

export function TrendChart({
  points,
  locale,
  label,
  rtl = false,
  height = 180,
}: {
  points: Point[];
  locale: string;
  label: string;
  /** Time runs right to left (Arabic). */
  rtl?: boolean;
  height?: number;
}) {
  const W = 640,
    H = height,
    padL = 34,
    padR = 12,
    padT = 12,
    padB = 24;
  const max = niceMax(Math.max(0, ...points.map((p) => p.n)));
  const x = (i: number) =>
    padL +
    (points.length <= 1 ? 0 : (i / (points.length - 1)) * (W - padL - padR));
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const line = points
    .map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.n).toFixed(1)}`)
    .join("");
  const area = points.length
    ? `${line}L${x(points.length - 1)} ${y(0)}L${x(0)} ${y(0)}Z`
    : "";
  const [hover, setHover] = useState<number | null>(null),
    svgRef = useRef<SVGSVGElement>(null),
    tableId = useId();
  const ticks = [0, max / 2, max];
  const dayFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }),
    [locale],
  );
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  function pick(clientX: number) {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r || !points.length) return;
    let fx = ((clientX - r.left) / r.width) * W;
    if (rtl) fx = W - fx;
    const i = Math.round(
      ((fx - padL) / (W - padL - padR)) * (points.length - 1),
    );
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  }

  const h = hover !== null ? points[hover] : null;
  return (
    <div className="adm-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        aria-describedby={tableId}
        tabIndex={0}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            const step = (e.key === "ArrowRight") !== rtl ? 1 : -1;
            setHover((v) =>
              Math.max(
                0,
                Math.min(points.length - 1, (v ?? points.length - 1) + step),
              ),
            );
          }
        }}
        onBlur={() => setHover(null)}
        style={{ direction: "ltr" }}
      >
        <g transform={rtl ? `translate(${W} 0) scale(-1 1)` : undefined}>
          {ticks.map((v) => (
            <line
              key={v}
              className="adm-chart-grid"
              x1={padL}
              x2={W - padR}
              y1={y(v)}
              y2={y(v)}
            />
          ))}
          <path className="adm-chart-area" d={area} />
          <path className="adm-chart-line" d={line} />
          {h && hover !== null && (
            <>
              <line
                className="adm-chart-cross"
                x1={x(hover)}
                x2={x(hover)}
                y1={padT}
                y2={H - padB}
              />
              <circle
                className="adm-chart-dot"
                cx={x(hover)}
                cy={y(h.n)}
                r={4.5}
              />
            </>
          )}
        </g>
      </svg>
      <div
        className="adm-chart-axis-y"
        style={{ height: `${((H - padB) / H) * 100}%` }}
      >
        {[...ticks].reverse().map((v) => (
          <span key={v}>{fmtNumber(v, locale)}</span>
        ))}
      </div>
      <div className="adm-chart-axis-x">
        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <span
              key={p.date}
              className={(i / labelEvery) % 2 === 1 ? "alt" : undefined}
              style={{ insetInlineStart: `${(x(i) / W) * 100}%` }}
            >
              {dayFmt.format(new Date(p.date + "T00:00:00"))}
            </span>
          ) : null,
        )}
      </div>
      {h && hover !== null && (
        <div
          className="adm-chart-tip"
          style={{ insetInlineStart: `${(x(hover) / W) * 100}%` }}
          role="status"
        >
          <b>{fmtNumber(h.n, locale)}</b>
          <span>{dayFmt.format(new Date(h.date + "T00:00:00"))}</span>
        </div>
      )}
      <table id={tableId} className="adm-sr-only">
        <caption>{label}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <th>{p.date}</th>
              <td>{p.n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A horizontal bar per category (one hue: this is magnitude, not identity). */
export function BarList({
  rows,
  locale,
  label,
}: {
  rows: { key: string; label: string; value: number }[];
  locale: string;
  label: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value)),
    total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <ul className="adm-bars" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key} title={`${r.label}: ${r.value}`}>
          <span className="adm-bars-label">{r.label}</span>
          <span className="adm-bars-track">
            <span
              className="adm-bars-fill"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </span>
          <span className="adm-bars-value">
            {fmtNumber(r.value, locale)}
            <small>
              {total ? `${Math.round((r.value / total) * 100)}%` : "—"}
            </small>
          </span>
        </li>
      ))}
    </ul>
  );
}
