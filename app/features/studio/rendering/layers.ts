import type {
  MapLayer,
  IconObject,
  PathObject,
  RegionObject,
  LabelObject,
  Biome,
  PathKind,
} from "../domain/types";
import { ICONS } from "../domain/icons";
type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
/** Shared with the editor's object palette so on-screen colors match the export. */
export const BIOME_FILL: Record<Biome, string> = {
  forest: "#3d5a3d",
  mountains: "#7d7565",
  desert: "#c9a86a",
  water: "#3d6a8a",
  grass: "#6f8f52",
  swamp: "#556b4f",
};
export const PATH_STYLE: Record<PathKind, { color: string; dash?: number[] }> = {
  river: { color: "#3d6a8a" },
  road: { color: "#7a5c3a", dash: [2.2, 1.6] },
  border: { color: "#8a3d3d", dash: [0.8, 1.4] },
};
const LABEL_FONT = '"Georgia", "Times New Roman", serif';
function drawIcon(ctx: Context, o: IconObject, width: number, height: number) {
  const def = ICONS[o.icon];
  const size = Math.max(1, o.scale * width * 0.05),
    s = size / 24;
  ctx.save();
  ctx.translate(o.x * width, o.y * height);
  ctx.rotate((o.rotation * Math.PI) / 180);
  ctx.scale(s, s);
  ctx.translate(-12, -12);
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = o.color;
  ctx.fillStyle = o.color;
  if (def.stroke) ctx.stroke(new Path2D(def.stroke));
  if (def.fill) ctx.fill(new Path2D(def.fill));
  ctx.restore();
}
function drawPath(ctx: Context, o: PathObject, width: number, height: number) {
  if (o.points.length < 2) return;
  const style = PATH_STYLE[o.pathKind],
    lineWidth = Math.max(0.5, o.width * width);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = o.color || style.color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(style.dash ? style.dash.map((d) => d * lineWidth) : []);
  ctx.beginPath();
  ctx.moveTo(o.points[0].x * width, o.points[0].y * height);
  for (const pt of o.points.slice(1)) ctx.lineTo(pt.x * width, pt.y * height);
  ctx.stroke();
  ctx.restore();
}
function drawRegion(
  ctx: Context,
  o: RegionObject,
  width: number,
  height: number,
) {
  if (o.points.length < 3) return;
  ctx.save();
  ctx.globalAlpha = o.opacity;
  ctx.fillStyle = BIOME_FILL[o.biome];
  ctx.beginPath();
  ctx.moveTo(o.points[0].x * width, o.points[0].y * height);
  for (const pt of o.points.slice(1)) ctx.lineTo(pt.x * width, pt.y * height);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function drawLabel(
  ctx: Context,
  o: LabelObject,
  width: number,
  height: number,
) {
  ctx.save();
  ctx.fillStyle = o.color;
  ctx.font = `${Math.max(1, o.size * width)}px ${LABEL_FONT}`;
  ctx.textAlign = o.align;
  ctx.textBaseline = "alphabetic";
  ctx.direction = o.rtl ? "rtl" : "ltr";
  ctx.fillText(o.text, o.x * width, o.y * height);
  ctx.restore();
}
/** Normalized coordinates keep edits independent from preview/export resolution. */
export function drawLayers(
  ctx: Context,
  layers: MapLayer[],
  width: number,
  height: number,
) {
  for (const layer of layers) {
    if (!layer.visible) continue;
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of layer.strokes) {
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.size * width;
      const p = stroke.points[0];
      if (!p) continue;
      if (stroke.kind === "brush") {
        ctx.beginPath();
        ctx.moveTo(p.x * width, p.y * height);
        if (stroke.points.length === 1)
          ctx.lineTo(p.x * width + 0.01, p.y * height);
        for (const q of stroke.points.slice(1))
          ctx.lineTo(q.x * width, q.y * height);
        ctx.stroke();
      } else {
        ctx.save();
        ctx.translate(p.x * width, p.y * height);
        const r = stroke.size * width * 2;
        ctx.lineWidth = Math.max(1, r / 8);
        ctx.beginPath();
        if (stroke.symbol === "mountain") {
          ctx.moveTo(-r, r * 0.7);
          ctx.lineTo(0, -r);
          ctx.lineTo(r, r * 0.7);
          ctx.closePath();
          ctx.stroke();
        } else if (stroke.symbol === "city") {
          ctx.strokeRect(-r * 0.6, -r * 0.6, r * 1.2, r * 1.2);
          ctx.fillRect(-r * 0.2, -r * 0.2, r * 0.4, r * 0.4);
        } else {
          for (let i = 0; i < 10; i++) {
            const angle = (i * Math.PI) / 5 - Math.PI / 2,
              rad = i % 2 ? r * 0.4 : r;
            ctx.lineTo(Math.cos(angle) * rad, Math.sin(angle) * rad);
          }
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }
    // Regions sit under paths and icons, like ground cover under roads and towns.
    for (const o of layer.objects) {
      if (o.kind === "region") drawRegion(ctx, o, width, height);
    }
    for (const o of layer.objects) {
      if (o.kind === "path") drawPath(ctx, o, width, height);
    }
    for (const o of layer.objects) {
      if (o.kind === "icon") drawIcon(ctx, o, width, height);
      else if (o.kind === "label") drawLabel(ctx, o, width, height);
    }
    ctx.restore();
  }
}
