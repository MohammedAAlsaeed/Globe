export type Settings = {
  height: number;
  width: number;
  gores: number;
  gap: number;
  offset: number;
  guides: boolean;
  grid: boolean;
};
export function geometry(s: Settings) {
  const a = s.width / 2,
    b = s.height / 2,
    steps = 2048;
  const arcs = new Float64Array(steps + 1);
  for (let i = 1; i <= steps; i++) {
    const latitude = -Math.PI / 2 + ((i - 0.5) / steps) * Math.PI;
    arcs[i] =
      arcs[i - 1] +
      (Math.hypot(a * Math.sin(latitude), b * Math.cos(latitude)) * Math.PI) /
        steps;
  }
  const goreHeight = arcs[steps],
    goreWidth = (Math.PI * s.width) / s.gores;
  return {
    arcs,
    goreHeight,
    goreWidth,
    sheetWidth: Math.PI * s.width + s.gap * (s.gores - 1) + 10,
    sheetHeight: goreHeight + 10,
  };
}
/** Latitude is parametric on an ellipsoid. Meridian distances are integrated numerically. */
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
export function renderGores(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  s: Settings,
  pixelsPerMM: number,
) {
  const g = geometry(s);
  canvas.width = Math.ceil(g.sheetWidth * pixelsPerMM);
  canvas.height = Math.ceil(g.sheetHeight * pixelsPerMM);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const margin = 5 * pixelsPerMM,
    gh = g.goreHeight * pixelsPerMM,
    gw = g.goreWidth * pixelsPerMM,
    gap = s.gap * pixelsPerMM;
  const rows = Math.ceil(gh);
  for (let row = 0; row < rows; row++) {
    const latitude = latitudeAt(((row + 0.5) / rows) * g.goreHeight, g.arcs);
    const bandWidth = Math.max(0.001, gw * Math.cos(latitude));
    const sy = Math.max(
      0,
      Math.min(
        image.naturalHeight - 1,
        (0.5 - latitude / Math.PI) * image.naturalHeight - 0.5,
      ),
    );
    for (let gore = 0; gore < s.gores; gore++) {
      const sx =
        ((((gore / s.gores + s.offset / 360) % 1) + 1) % 1) *
        image.naturalWidth;
      const sw = image.naturalWidth / s.gores,
        first = Math.min(sw, image.naturalWidth - sx);
      const dx = margin + gore * (gw + gap) + (gw - bandWidth) / 2;
      ctx.drawImage(
        image,
        sx,
        sy,
        first,
        1,
        dx,
        margin + row,
        (bandWidth * first) / sw,
        1,
      );
      if (first < sw)
        ctx.drawImage(
          image,
          0,
          sy,
          sw - first,
          1,
          dx + (bandWidth * first) / sw,
          margin + row,
          (bandWidth * (sw - first)) / sw,
          1,
        );
    }
  }
  ctx.strokeStyle = "#605d4b";
  ctx.lineWidth = Math.max(0.55, 0.12 * pixelsPerMM);
  for (let gore = 0; gore < s.gores; gore++) {
    const cx = margin + gore * (gw + gap) + gw / 2;
    if (s.guides) {
      ctx.beginPath();
      for (let side = -1; side <= 1; side += 2)
        for (let n = 0; n <= 128; n++) {
          const f = side === -1 ? n / 128 : 1 - n / 128;
          const latitude = latitudeAt(f * g.goreHeight, g.arcs);
          const x = cx + ((side * gw) / 2) * Math.cos(latitude),
            y = margin + f * gh;
          if (side === -1 && n === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      ctx.closePath();
      ctx.stroke();
    }
    if (s.grid) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.setLineDash([2 * pixelsPerMM, pixelsPerMM]);
      for (const f of [1 / 6, 1 / 3, 0.5, 2 / 3, 5 / 6]) {
        const index = f * (g.arcs.length - 1),
          lower = Math.floor(index);
        const dist =
          g.arcs[lower] +
          (g.arcs[Math.min(lower + 1, g.arcs.length - 1)] - g.arcs[lower]) *
            (index - lower);
        const half = (gw / 2) * Math.sin(f * Math.PI);
        ctx.beginPath();
        ctx.moveTo(cx - half, margin + dist * pixelsPerMM);
        ctx.lineTo(cx + half, margin + dist * pixelsPerMM);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
  return g;
}
// A pHYs chunk retains the requested print DPI in the PNG.
export async function pngWithDpi(
  canvas: HTMLCanvasElement,
  dpi: number,
): Promise<Blob> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))),
      "image/png",
    ),
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunk = new Uint8Array(21),
    v = new DataView(chunk.buffer);
  v.setUint32(0, 9);
  chunk.set([112, 72, 89, 115], 4);
  v.setUint32(8, Math.round(dpi / 0.0254));
  v.setUint32(12, Math.round(dpi / 0.0254));
  chunk[16] = 1;
  let crc = 0xffffffff;
  for (const byte of chunk.slice(4, 17)) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  v.setUint32(17, (crc ^ 0xffffffff) >>> 0);
  return new Blob([bytes.slice(0, 33), chunk, bytes.slice(33)], {
    type: "image/png",
  });
}
