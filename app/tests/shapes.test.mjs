// Shape Tool logic that needs no canvas: primitives, the combined outline
// (add / subtract / intersect / exclude, groups), stroke runs and portals,
// transforms, flattening, combining and releasing, styles, legacy region
// conversion and validation.
import test from "node:test";
import assert from "node:assert/strict";
import {
  closedTensionNodes,
  combineParts,
  computeOutline,
  containsPoint,
  flattenParts,
  measure,
  nearestPath,
  portalPoint,
  primFromDrag,
  primNodes,
  reanchorPortals,
  releaseParts,
  shiftShape,
  strokeRuns,
  transformPrim,
  transformShape,
  withNodes,
  withPrim,
} from "../features/mapmaker/shapes/geometry.ts";
import { insertNode } from "../features/mapmaker/lines/geometry.ts";
import {
  baseShapeLook,
  builtinShapeStyles,
  defaultShapeToolState,
  factoryShapeLook,
  resetShapeProp,
} from "../features/mapmaker/shapes/state.ts";
import {
  validShape,
  validShapeLook,
} from "../features/mapmaker/shapes/validate.ts";
import { migrateProject } from "../features/mapmaker/stamps/migrate.ts";
import { validateProject } from "../features/mapmaker/validation.ts";

const W = 1000,
  H = 1000;
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const rect = (cx, cy, w, h, extra = {}) => ({
  kind: "rect",
  cx,
  cy,
  w,
  h,
  rot: 0,
  radius: 0,
  ...extra,
});
const path = (id, op, prim) => ({
  id,
  op,
  nodes: primNodes(prim, W, H),
  prim,
});
const ellipse = (cx, cy, w, h) => ({ kind: "ellipse", cx, cy, w, h, rot: 0 });
function shape(parts, extra = {}) {
  return {
    id: "s1",
    kind: "shape",
    parts,
    portals: [],
    frame: { x: 0, y: 0, rot: 0, scale: 1 },
    ...factoryShapeLook(),
    ...extra,
  };
}

test("primitives: rectangles, round corners, ellipses, polygons and stars", () => {
  const r = primNodes(rect(0.5, 0.5, 0.4, 0.2), W, H);
  assert.equal(r.length, 4);
  assert.deepEqual(
    r.map((n) => [Math.round(n.x * W), Math.round(n.y * H)]),
    [
      [300, 400],
      [700, 400],
      [700, 600],
      [300, 600],
    ],
  );
  // Round corners: two nodes per corner, with handles.
  const rr = primNodes(rect(0.5, 0.5, 0.4, 0.2, { radius: 0.25 }), W, H);
  assert.equal(rr.length, 8);
  assert.ok(rr.every((n) => n.hi || n.ho));
  // Fully round: a pill (sides collapse), still closed and valid.
  assert.equal(
    primNodes(rect(0.5, 0.5, 0.2, 0.2, { radius: 0.5 }), W, H).length,
    4,
  );
  // An ellipse is 4 smooth nodes whose area is π·a·b (within flattening).
  const e = computeOutline(
    [path("e", "add", ellipse(0.5, 0.5, 0.2, 0.1))],
    W,
    H,
  );
  assert.ok(near(measure(e).area, Math.PI * 100 * 50, 120));
  const hex = primNodes(
    { kind: "polygon", cx: 0.5, cy: 0.5, w: 0.2, h: 0.2, rot: 0, sides: 6 },
    W,
    H,
  );
  assert.equal(hex.length, 6);
  assert.ok(near(hex[0].x, 0.5) && near(hex[0].y, 0.4)); // first corner on top
  const star = primNodes(
    {
      kind: "star",
      cx: 0.5,
      cy: 0.5,
      w: 0.2,
      h: 0.2,
      rot: 0,
      sides: 5,
      inner: 0.4,
    },
    W,
    H,
  );
  assert.equal(star.length, 10);
  // Non-square maps: sizes are fractions of the width, so a square stays square.
  const sq = primNodes(rect(0.5, 0.5, 0.1, 0.1), 2000, 1000);
  assert.ok(near((sq[1].x - sq[0].x) * 2000, (sq[2].y - sq[1].y) * 1000));
});

test("primitives from a drag: corners, centre, constrain, polygons turn", () => {
  const a = { x: 100, y: 100 },
    b = { x: 300, y: 200 };
  const box = primFromDrag(
    "rect",
    a,
    b,
    { constrain: false, fromCenter: false },
    W,
    H,
  );
  assert.ok(
    near(box.cx, 0.2) &&
      near(box.cy, 0.15) &&
      near(box.w, 0.2) &&
      near(box.h, 0.1),
  );
  const sq = primFromDrag(
    "rect",
    a,
    b,
    { constrain: true, fromCenter: false },
    W,
    H,
  );
  assert.ok(near(sq.w, sq.h));
  const c = primFromDrag(
    "ellipse",
    a,
    b,
    { constrain: false, fromCenter: true },
    W,
    H,
  );
  assert.ok(near(c.cx, 0.1) && near(c.w, 0.4) && near(c.h, 0.2));
  const poly = primFromDrag(
    "polygon",
    a,
    { x: 200, y: 100 },
    { constrain: true, fromCenter: true, sides: 5 },
    W,
    H,
  );
  assert.equal(poly.sides, 5);
  assert.ok(near(poly.w, 0.2) && near(poly.rot, 90));
});

test("outline: add, subtract, intersect, exclude, groups", () => {
  const big = path("a", "add", rect(0.5, 0.5, 0.4, 0.4)); // 400×400
  const small = (op) => path("b", op, rect(0.7, 0.5, 0.2, 0.2)); // 200×200, half outside
  const area = (parts) => measure(computeOutline(parts, W, H)).area;
  assert.ok(near(area([big]), 160000, 1));
  assert.ok(near(area([big, small("add")]), 160000 + 20000, 1));
  assert.ok(near(area([big, small("subtract")]), 160000 - 20000, 1));
  assert.ok(near(area([big, small("intersect")]), 20000, 1));
  assert.ok(near(area([big, small("exclude")]), 160000, 1));
  // A hole: one outer loop and one hole loop.
  const holed = computeOutline(
    [big, path("h", "subtract", rect(0.5, 0.5, 0.1, 0.1))],
    W,
    H,
  );
  assert.equal(holed.contours.length, 2);
  assert.deepEqual(holed.contours.map((c) => c.hole).sort(), [false, true]);
  assert.ok(!containsPoint(holed, { x: 500, y: 500 }));
  assert.ok(containsPoint(holed, { x: 350, y: 500 }));
  // A group combines first: big − (hole ∪ island-in-hole) keeps the island out.
  const group = {
    id: "g",
    op: "subtract",
    parts: [
      path("g1", "add", rect(0.5, 0.5, 0.2, 0.2)),
      path("g2", "subtract", rect(0.5, 0.5, 0.1, 0.1)),
    ],
  };
  // big − ring = big with a ring-shaped gap: 160000 − (40000 − 10000).
  assert.ok(near(area([big, group]), 130000, 1));
  // One plain part keeps its curves (drawn directly).
  assert.ok(computeOutline([big], W, H).direct);
  assert.equal(computeOutline([big, small("add")], W, H).direct, null);
});

test("stroke runs: one loop per contour, portals cut it, runs keep the inside on their right", () => {
  const room = shape([path("a", "add", rect(0.5, 0.5, 0.4, 0.2))]);
  const o = computeOutline(room.parts, W, H);
  const whole = strokeRuns(room, o, W, H);
  assert.equal(whole.length, 1);
  assert.ok(whole[0].poly.closed);
  assert.ok(near(whole[0].poly.length, 1200, 0.01));
  assert.equal(whole[0].corners.length, 4);
  // A door in the middle of the top wall (piece 0, t 0.5), 50 px wide.
  const door = { id: "d", part: "a", seg: 0, t: 0.5, width: 0.05 };
  const cut = strokeRuns({ ...room, portals: [door] }, o, W, H);
  assert.equal(cut.length, 1);
  assert.equal(cut[0].poly.closed, false);
  assert.ok(near(cut[0].poly.length, 1150, 0.01));
  // The run starts at the door's right edge and ends at its left edge.
  const xy = cut[0].poly.xy;
  assert.ok(near(xy[0], 525, 0.01) && near(xy[1], 400, 0.01));
  assert.ok(near(xy[xy.length - 2], 475, 0.01));
  // Two doors: two runs; doors on a hole cut the hole.
  const two = strokeRuns(
    { ...room, portals: [door, { ...door, id: "e", seg: 2 }] },
    o,
    W,
    H,
  );
  assert.equal(two.length, 2);
  // Inside is on the right of travel for outer loops and holes alike.
  const holed = shape([
    path("a", "add", rect(0.5, 0.5, 0.4, 0.4)),
    path("h", "subtract", rect(0.5, 0.5, 0.1, 0.1)),
  ]);
  const runs = strokeRuns(holed, computeOutline(holed.parts, W, H), W, H);
  for (const r of runs) {
    const p = r.poly.xy,
      dir = Math.atan2(p[3] - p[1], p[2] - p[0]),
      mid = { x: (p[0] + p[2]) / 2, y: (p[1] + p[3]) / 2 },
      right = { x: mid.x - Math.sin(dir) * 3, y: mid.y + Math.cos(dir) * 3 };
    assert.ok(containsPoint(computeOutline(holed.parts, W, H), right));
  }
  // A door is where its path says, even after the shape moved.
  assert.deepEqual(
    Object.values(portalPoint(room.parts, door, W, H))
      .slice(0, 2)
      .map(Math.round),
    [500, 400],
  );
});

test("portals stay on their wall when nodes change; nearest path for placing", () => {
  const room = shape([path("a", "add", rect(0.5, 0.5, 0.4, 0.2))], {
    portals: [{ id: "d", part: "a", seg: 1, t: 0.5, width: 0.04 }],
  });
  // A node inserted before the door's piece shifts its index.
  const nodes = insertNode(room.parts[0].nodes, true, 0, 0.5, W, H);
  const next = withNodes(room, "a", nodes, W, H);
  assert.equal(next.parts[0].prim, undefined); // node edits drop the primitive
  assert.equal(next.portals[0].seg, 2);
  assert.ok(near(next.portals[0].t, 0.5, 1e-3));
  // Resizing a primitive keeps the door on the same (right) wall.
  const wider = withPrim(room, "a", rect(0.5, 0.5, 0.6, 0.2), W, H);
  assert.equal(wider.portals[0].seg, 1);
  const pt = portalPoint(wider.parts, wider.portals[0], W, H);
  assert.ok(near(pt.x, 800, 0.5));
  // Doors of a removed path go away.
  assert.equal(
    reanchorPortals(
      room.parts,
      [path("z", "add", rect(0.5, 0.5, 0.1, 0.1))],
      room.portals,
      W,
      H,
    ).length,
    0,
  );
  const hit = nearestPath(room.parts, { x: 702, y: 500 }, W, H);
  assert.equal(hit.path.id, "a");
  assert.equal(hit.seg, 1);
  assert.ok(hit.gap < 3);
});

test("moving and transforming: primitives, frame, strokes and doors follow", () => {
  const s = shape([path("a", "add", rect(0.5, 0.5, 0.4, 0.2))], {
    portals: [{ id: "d", part: "a", seg: 0, t: 0.5, width: 0.04 }],
  });
  const moved = shiftShape(s, 0.1, -0.1);
  assert.ok(near(moved.parts[0].prim.cx, 0.6) && near(moved.frame.y, -0.1));
  // Turn 90° about the map centre and grow ×2.
  const turn = (p) => ({ x: 500 - (p.y - 500) * 2, y: 500 + (p.x - 500) * 2 });
  const t = transformShape(s, W, H, turn, 2);
  assert.ok(near(t.parts[0].prim.rot, 90));
  assert.ok(near(t.parts[0].prim.w, 0.8) && near(t.parts[0].prim.h, 0.4));
  assert.ok(near(t.frame.rot, 90) && near(t.frame.scale, 2));
  assert.ok(near(t.portals[0].width, 0.08));
  assert.ok(near(t.stroke.color.width, s.stroke.color.width * 2));
  // A skew makes it a free path.
  assert.equal(
    transformPrim(rect(0.5, 0.5, 0.2, 0.2), W, H, (p) => ({
      x: p.x + p.y * 0.5,
      y: p.y,
    })),
    null,
  );
});

test("flatten, combine and release keep the outline and the doors", () => {
  const a = shape([path("a", "add", rect(0.5, 0.5, 0.4, 0.4))], {
    portals: [{ id: "d", part: "a", seg: 3, t: 0.5, width: 0.04 }],
  });
  const b = shape([path("b", "add", rect(0.5, 0.5, 0.1, 0.1))]);
  let n = 0;
  const id = () => `n${++n}`;
  const combined = combineParts([a, b], "subtract", id);
  assert.equal(combined.parts.length, 2);
  assert.equal(combined.parts[1].op, "subtract");
  const before = measure(computeOutline(combined.parts, W, H)).area;
  const flat = flattenParts(combined, W, H, id);
  assert.deepEqual(
    flat.parts.map((p) => p.op),
    ["add", "subtract"],
  );
  assert.ok(near(measure(computeOutline(flat.parts, W, H)).area, before, 2));
  assert.equal(flat.portals.length, 1);
  assert.ok(flat.parts.some((p) => p.id === flat.portals[0].part));
  const released = releaseParts(combined);
  assert.equal(released.length, 2);
  assert.equal(released[1].parts[0].op, "add");
  assert.equal(released[0].portals.length, 1);
  assert.equal(released[1].portals.length, 0);
});

test("styles, tool defaults and resets", () => {
  const styles = builtinShapeStyles();
  assert.ok(styles.length >= 10);
  assert.ok(styles.every((s) => validShapeLook(s.look)));
  assert.ok(
    styles.some((s) => s.look.fill.type === "mask" && s.look.fill.invert),
  );
  assert.ok(
    styles.some(
      (s) => s.look.stroke.mode === "stamp" && s.look.stroke.align === "inside",
    ),
  );
  assert.equal(new Set(styles.map((s) => s.id)).size, styles.length);
  const tool = defaultShapeToolState();
  assert.ok(validShapeLook(tool.look));
  const base = baseShapeLook("p:stoneRoom", []);
  const changed = {
    ...base,
    stroke: { ...base.stroke, align: "outside", opacity: 0.3 },
  };
  const back = resetShapeProp(changed, base, "stroke.align");
  assert.equal(back.stroke.align, "inside");
  assert.equal(back.stroke.opacity, 0.3);
  const w = resetShapeProp(
    {
      ...base,
      stroke: { ...base.stroke, color: { ...base.stroke.color, width: 0.05 } },
    },
    base,
    "stroke.color.width",
  );
  assert.equal(w.stroke.color.width, base.stroke.color.width);
});

test("validation: good shapes pass, bad geometry and values fail", () => {
  const ok = shape([path("a", "add", rect(0.5, 0.5, 0.4, 0.2))], {
    portals: [{ id: "d", part: "a", seg: 0, t: 0.5, width: 0.04 }],
  });
  assert.ok(validShape(ok));
  assert.ok(!validShape({ ...ok, parts: [] }));
  assert.ok(
    !validShape({ ...ok, portals: [{ ...ok.portals[0], part: "nope" }] }),
  );
  assert.ok(!validShape({ ...ok, parts: [{ ...ok.parts[0], op: "merge" }] }));
  assert.ok(!validShape({ ...ok, fill: { ...ok.fill, type: "gradient" } }));
  assert.ok(!validShape({ ...ok, stroke: { ...ok.stroke, align: "left" } }));
  assert.ok(!validShape({ ...ok, frame: { ...ok.frame, scale: 0 } }));
  // Duplicate part ids, and nesting too deep.
  assert.ok(!validShape({ ...ok, parts: [ok.parts[0], ok.parts[0]] }));
  let deep = ok.parts[0];
  for (let i = 0; i < 6; i++) deep = { id: `g${i}`, op: "add", parts: [deep] };
  assert.ok(!validShape({ ...ok, parts: [deep], portals: [] }));
  // Too many paths.
  const many = Array.from({ length: 70 }, (_, i) => ({
    ...ok.parts[0],
    id: `p${i}`,
  }));
  assert.ok(!validShape({ ...ok, parts: many, portals: [] }));
});

test("legacy regions open as shapes with the same outline and pattern", () => {
  const region = {
    id: "r1",
    kind: "region",
    biome: "desert",
    points: [
      { x: 0.2, y: 0.2 },
      { x: 0.6, y: 0.25 },
      { x: 0.5, y: 0.6 },
      { x: 0.25, y: 0.5 },
    ],
    opacity: 0.6,
    textureScale: 1.5,
    textureRotation: 30,
    locked: true,
  };
  const project = {
    name: "Old",
    width: 1600,
    height: 1200,
    tileCols: 4,
    tileRows: 3,
    resolutionTier: "medium",
    aspect: "landscape",
    background: "#2c5678",
    snapToGrid: false,
    layers: [
      {
        id: "l",
        name: "L",
        visible: true,
        locked: false,
        opacity: 1,
        objects: [region],
      },
    ],
  };
  const out = migrateProject(project);
  const s = out.layers[0].objects[0];
  assert.equal(s.kind, "shape");
  assert.equal(s.id, "r1");
  assert.equal(s.locked, true);
  assert.equal(s.fill.type, "pattern");
  assert.equal(s.fill.pattern, "desert");
  assert.equal(s.fill.source.textureScale, 1.5);
  assert.equal(s.fill.source.textureRotation, 30);
  assert.equal(s.opacity, 0.6);
  assert.equal(s.stroke.mode, "none");
  // The same points, now smooth nodes (Konva tension 0.3 → Bézier handles).
  assert.equal(s.parts[0].nodes.length, 4);
  assert.ok(s.parts[0].nodes.every((n) => n.t === "smooth"));
  assert.ok(
    near(s.parts[0].nodes[1].x, 0.6) && near(s.parts[0].nodes[1].y, 0.25),
  );
  assert.ok(validShape(s));
  // The converted map is a valid map, and converting again changes nothing.
  assert.doesNotThrow(() => validateProject(out));
  assert.equal(migrateProject(out), out);
  // Nodes match Konva's closed tension curve: handles from the neighbours.
  const nodes = closedTensionNodes(region.points, 0.3, 1600, 1200);
  assert.ok(nodes[0].hi && nodes[0].ho);
});

test("every Shape Tool string exists in English and Arabic", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const { shapesEn, shapesAr } = await import("../lib/locales/shapes.ts");
  const { mapmakerEn } = await import("../lib/locales/mapmaker.en.ts");
  const { linesEn } = await import("../lib/locales/lines.ts");
  const all = { ...mapmakerEn, ...linesEn, ...shapesEn };
  assert.deepEqual(Object.keys(shapesAr).sort(), Object.keys(shapesEn).sort());
  for (const v of Object.values(shapesAr)) assert.ok(v.trim().length > 0);
  const dir = new URL("../features/mapmaker/shapes/", import.meta.url);
  const src = readdirSync(dir)
    .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
    .map((f) => readFileSync(new URL(f, dir), "utf8"))
    .join("\n");
  const used = new Set(
    [...src.matchAll(/["`](sh[A-Z][A-Za-z]*)["`]/g)].map((m) => m[1]),
  );
  for (const k of used) assert.ok(k in all, `missing string ${k}`);
  // Keys built from lists.
  for (const op of ["new", "add", "subtract", "intersect", "exclude"])
    assert.ok(`shOp_${op}` in shapesEn);
  for (const f of ["none", "color", "texture", "pattern", "mask"])
    assert.ok(`shFill_${f}` in shapesEn);
  for (const a of ["inside", "center", "outside"])
    assert.ok(`shAlign_${a}` in shapesEn);
  for (const s of builtinShapeStyles())
    assert.ok(s.labelKey in shapesEn, `missing style name ${s.labelKey}`);
});
