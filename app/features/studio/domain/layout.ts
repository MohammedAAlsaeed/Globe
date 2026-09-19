import { goreBox } from "./geometry";
import type {
  GlobeSettings,
  PrintSettings,
  PrintPlan,
  PrintPage,
} from "./types";
export const PAPER_SIZES = {
  A4: [210, 297],
  A3: [297, 420],
  Letter: [215.9, 279.4],
} as const;
/** All placements are physical millimetres. Calibration applies before packing. */
export function planPrint(s: GlobeSettings, p: PrintSettings): PrintPlan {
  const raw = p.paper === "custom" ? [p.width, p.height] : PAPER_SIZES[p.paper];
  const sizes =
    p.orientation === "auto"
      ? [
          [raw[0], raw[1]],
          [raw[1], raw[0]],
        ]
      : p.orientation === "landscape"
        ? [[Math.max(...raw), Math.min(...raw)]]
        : [[Math.min(...raw), Math.max(...raw)]];
  const candidates = sizes.flatMap(([w, h]) =>
    [false, true].map((rotated) => pack(s, p, w, h, rotated)),
  );
  return (
    candidates
      .filter((c) => !c.error)
      .sort(
        (a, b) =>
          a.pages.length - b.pages.length || Number(a.tiled) - Number(b.tiled),
      )[0] ??
    candidates.find((c) => c.error === "pageLimit") ?? {
      pages: [],
      tiled: false,
      error: "layoutError",
    }
  );
}
function pack(
  s: GlobeSettings,
  p: PrintSettings,
  w: number,
  h: number,
  rotated: boolean,
): PrintPlan {
  const g = goreBox(s),
    fw = (rotated ? g.height : g.width) * p.calibrationX,
    fh = (rotated ? g.width : g.height) * p.calibrationY;
  // Reserve a footer for the page label and calibration reminder.
  const aw = w - 2 * p.margin,
    ah = h - 2 * p.margin - 7,
    gap = s.gap * Math.max(p.calibrationX, p.calibrationY);
  if (aw < 10 || ah < 10 || p.overlap >= Math.min(aw, ah) - 1)
    return { pages: [], tiled: false, error: "layoutError" };
  const cols = Math.floor((aw + gap) / (fw + gap)),
    rows = Math.floor((ah + gap) / (fh + gap));
  const pages: PrintPage[] = [];
  if (cols > 0 && rows > 0) {
    const per = cols * rows;
    for (let i = 0; i < s.gores; i++) {
      if (i % per === 0) pages.push({ width: w, height: h, items: [] });
      const pos = i % per;
      pages[pages.length - 1].items.push({
        gore: i,
        x: p.margin + (pos % cols) * (fw + gap),
        y: p.margin + Math.floor(pos / cols) * (fh + gap),
        width: fw,
        height: fh,
        fullWidth: fw,
        fullHeight: fh,
        rotated,
        cropX: 0,
        cropY: 0,
        tile: "",
      });
    }
    return { pages, tiled: false };
  }
  const nx = Math.max(1, Math.ceil((fw - p.overlap) / (aw - p.overlap))),
    ny = Math.max(1, Math.ceil((fh - p.overlap) / (ah - p.overlap)));
  if (nx * ny * s.gores > 250)
    return { pages: [], tiled: true, error: "pageLimit" };
  for (let i = 0; i < s.gores; i++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const cx = x * (aw - p.overlap),
          cy = y * (ah - p.overlap);
        pages.push({
          width: w,
          height: h,
          items: [
            {
              gore: i,
              x: p.margin,
              y: p.margin,
              width: Math.min(aw, fw - cx),
              height: Math.min(ah, fh - cy),
              fullWidth: fw,
              fullHeight: fh,
              rotated,
              cropX: cx,
              cropY: cy,
              tile: `${y + 1}.${x + 1} / ${ny}.${nx}`,
            },
          ],
        });
      }
  return { pages, tiled: true };
}
