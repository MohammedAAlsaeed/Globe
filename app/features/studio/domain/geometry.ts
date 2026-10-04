import type { GlobeSettings, Point } from "./types";
/** Parametric latitude on an ellipsoid, integrated with midpoint quadrature. */
export function globeGeometry(
  s: Pick<GlobeSettings, "width" | "height" | "gores">,
) {
  const steps = 2048,
    a = s.width / 2,
    b = s.height / 2,
    arcs = new Float64Array(steps + 1);
  for (let i = 1; i <= steps; i++) {
    const lat = -Math.PI / 2 + ((i - 0.5) / steps) * Math.PI;
    arcs[i] =
      arcs[i - 1] +
      (Math.hypot(a * Math.sin(lat), b * Math.cos(lat)) * Math.PI) / steps;
  }
  return {
    arcs,
    goreHeight: arcs[steps],
    goreWidth: (Math.PI * s.width) / s.gores,
  };
}
export function latitudeAt(distance: number, arcs: Float64Array) {
  let lo = 0,
    hi = arcs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arcs[mid] < distance) lo = mid;
    else hi = mid;
  }
  const f = Math.max(
    0,
    Math.min(1, (distance - arcs[lo]) / (arcs[hi] - arcs[lo])),
  );
  return Math.PI / 2 - ((lo + f) / (arcs.length - 1)) * Math.PI;
}
export function goreBox(s: GlobeSettings) {
  const g = globeGeometry(s);
  return {
    ...g,
    width: g.goreWidth + s.tab + 2 * s.bleed,
    height: g.goreHeight + 2 * s.bleed + (s.labels ? 6 : 0),
    left: s.bleed,
    top: s.bleed,
  };
}
export function edgePoints(
  s: GlobeSettings,
  side: -1 | 1,
  tab = false,
): Point[] {
  const g = goreBox(s);
  return Array.from({ length: 257 }, (_, i) => {
    const f = i / 256,
      cos = Math.max(0, Math.cos(latitudeAt(f * g.goreHeight, g.arcs)));
    // Tab tapers into each pole; this avoids a bulky pile of paper at the tips.
    return {
      x:
        g.left +
        g.goreWidth / 2 +
        ((side * g.goreWidth) / 2) * cos +
        (tab && side === 1
          ? s.tab *
            (f <= 0 || f >= 1 ? 0 : Math.pow(Math.sin(Math.PI * f), 0.55))
          : 0),
      y: g.top + f * g.goreHeight,
    };
  });
}
export function pathFromPoints(points: Point[], close = false) {
  return (
    points
      .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(4)} ${p.y.toFixed(4)}`)
      .join(" ") + (close ? " Z" : "")
  );
}
export function cutPath(s: GlobeSettings) {
  return pathFromPoints(
    [...edgePoints(s, -1), ...edgePoints(s, 1, true).reverse()],
    true,
  );
}
export function seamPath(s: GlobeSettings) {
  return pathFromPoints(edgePoints(s, 1));
}
export function latitudeLines(s: GlobeSettings) {
  const g = goreBox(s);
  return [1 / 6, 1 / 3, 0.5, 2 / 3, 5 / 6].map((f) => {
    const index = f * (g.arcs.length - 1),
      i = Math.floor(index);
    const y = g.top + g.arcs[i] + (g.arcs[i + 1] - g.arcs[i]) * (index - i);
    const half = (g.goreWidth / 2) * Math.sin(f * Math.PI);
    return [
      { x: g.left + g.goreWidth / 2 - half, y },
      { x: g.left + g.goreWidth / 2 + half, y },
    ];
  });
}
export function recommendGores(width: number, maxWidth: number) {
  return Math.max(
    6,
    Math.min(72, Math.ceil((Math.PI * width) / Math.max(5, maxWidth) / 2) * 2),
  );
}
export function effectivePpi(
  sourceWidth: number,
  sourceHeight: number,
  s: GlobeSettings,
) {
  const a = s.width / 2,
    b = s.height / 2;
  const horizontal = (sourceWidth * 25.4) / (2 * Math.PI * a);
  if (s.sourceProjection === "equirectangular")
    return Math.min(
      horizontal,
      (sourceHeight * 25.4) / (Math.PI * Math.max(a, b)),
    );
  const merc = (degrees: number) =>
    Math.log(Math.tan(Math.PI / 4 + (degrees * Math.PI) / 360));
  const span = merc(s.north) - merc(s.south);
  let maxDerivative = 0;
  for (let i = 0; i <= 512; i++) {
    const lat = ((s.south + ((s.north - s.south) * i) / 512) * Math.PI) / 180;
    maxDerivative = Math.max(
      maxDerivative,
      Math.cos(lat) * Math.hypot(a * Math.sin(lat), b * Math.cos(lat)),
    );
  }
  return Math.min(horizontal, (sourceHeight * 25.4) / (span * maxDerivative));
}
export function sourceY(
  latitude: number,
  s: Pick<GlobeSettings, "sourceProjection" | "north" | "south">,
) {
  if (s.sourceProjection === "equirectangular") return 0.5 - latitude / Math.PI;
  const deg = (latitude * 180) / Math.PI;
  if (deg > s.north || deg < s.south) return null;
  const merc = (d: number) =>
    Math.log(Math.tan(Math.PI / 4 + (d * Math.PI) / 360));
  return (merc(s.north) - merc(deg)) / (merc(s.north) - merc(s.south));
}
/** Rounded bleed around the cut contour, evaluated as a disk expansion in mm. */
export function bleedBounds(
  y: number,
  s: GlobeSettings,
  g: ReturnType<typeof goreBox>,
) {
  let left = Infinity,
    right = -Infinity;
  for (let i = 0; i <= 32; i++) {
    const yy = Math.max(
        0,
        Math.min(g.goreHeight, y - s.bleed + (2 * s.bleed * i) / 32),
      ),
      dy = yy - y;
    if (Math.abs(dy) > s.bleed + 1e-9) continue;
    const f = yy / g.goreHeight,
      half = (g.goreWidth / 2) * Math.max(0, Math.cos(latitudeAt(yy, g.arcs))),
      tab =
        f <= 0 || f >= 1 ? 0 : s.tab * Math.pow(Math.sin(Math.PI * f), 0.55),
      radius = Math.sqrt(Math.max(0, s.bleed * s.bleed - dy * dy));
    left = Math.min(left, -half - radius);
    right = Math.max(right, half + tab + radius);
  }
  return { left, right };
}
