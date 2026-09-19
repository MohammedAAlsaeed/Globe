import type { MapLayer } from "../domain/types";
type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
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
    ctx.restore();
  }
}
