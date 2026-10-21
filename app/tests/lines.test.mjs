// Line Tool logic that needs no canvas: the Bézier path engine, Free Draw
// fitting, node editing, the Stamp Stroke layout, styles and resets, legacy
// path conversion and validation.
import test from "node:test";
import assert from "node:assert/strict";
import {
  cubics,
  cubicPoint,
  fitTrail,
  flatten,
  insertNode,
  moveHandle,
  nearest,
  pointAt,
  removeNode,
  reverseNodes,
  sharpNodes,
  snapAngle,
  toggleNodeType,
  transformNodes,
} from "../features/mapmaker/lines/geometry.ts";
import { layoutPieces } from "../features/mapmaker/lines/distribute.ts";
import {
  allLineSets,
  builtinLineSets,
  lineSet,
  pieceAspect,
  pieceAsset,
} from "../features/mapmaker/lines/catalog.ts";
import {
  baseLook,
  builtinLineStyles,
  factoryLook,
  resetProp,
  withSet,
} from "../features/mapmaker/lines/state.ts";
import { validLine, validLook } from "../features/mapmaker/lines/validate.ts";
import { migrateProject } from "../features/mapmaker/stamps/migrate.ts";
import { validateProject } from "../features/mapmaker/validation.ts";

const W = 1000,
  H = 500;
const near = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} ${a} ≉ ${b} (±${tol})`);

test("a straight line's length is exact; a curve's is its arc length", () => {
  const straight = flatten(
    [
      { x: 0.1, y: 0.2 },
      { x: 0.4, y: 0.6 },
    ],
    false,
    W,
    H,
  );
  near(straight.length, Math.hypot(300, 200), 1e-6);
  // A quarter circle (radius 200 px) from cubic handles k = 0.5523.
  const k = 0.5523 * 200,
    arc = flatten(
      [
        { x: 0.2, y: 0.2, ho: { x: k / W, y: 0 } },
        { x: 0.4, y: 0.6, hi: { x: 0, y: -k / H } },
      ],
      false,
      W,
      H,
    );
  near(arc.length, (Math.PI * 200) / 2, 0.5, "quarter circle");
  const mid = pointAt(arc, arc.length / 2);
  near(Math.hypot(mid.x - 200, mid.y - 300), 200, 0.6, "mid on the circle");
});

test("closed lines add the closing piece; node indices are tracked", () => {
  const sq = [
    { x: 0.1, y: 0.1 },
    { x: 0.3, y: 0.1 },
    { x: 0.3, y: 0.5 },
    { x: 0.1, y: 0.5 },
  ];
  const poly = flatten(sq, true, W, H);
  near(poly.length, 200 + 200 + 200 + 200, 1e-6);
  assert.equal(poly.nodeAt.length, 5);
  assert.deepEqual(sharpNodes(sq, true, W, H), [0, 1, 2, 3]);
  assert.deepEqual(sharpNodes(sq, false, W, H), [1, 2]);
});

test("inserting a node keeps the curve exactly", () => {
  const nodes = [
    { x: 0.1, y: 0.5, ho: { x: 0.1, y: -0.4 } },
    { x: 0.6, y: 0.5, hi: { x: -0.05, y: 0.3 } },
  ];
  const before = cubics(nodes, false, W, H)[0],
    after = insertNode(nodes, false, 0, 0.3, W, H);
  assert.equal(after.length, 3);
  assert.equal(after[1].t, "smooth");
  const [c1, c2] = cubics(after, false, W, H);
  for (const t of [0, 0.15, 0.3]) {
    const a = cubicPoint(before, t),
      b = cubicPoint(c1, t / 0.3);
    near(a.x, b.x, 1e-6);
    near(a.y, b.y, 1e-6);
  }
  const a = cubicPoint(before, 0.65),
    b = cubicPoint(c2, (0.65 - 0.3) / 0.7);
  near(a.x, b.x, 1e-6);
  near(a.y, b.y, 1e-6);
  // And removing it again leaves two nodes (open lines keep at least two).
  assert.equal(removeNode(after, 1, false).length, 2);
  assert.equal(removeNode(removeNode(after, 1, false), 0, false).length, 2);
});

test("picking finds the nearest point on the curve", () => {
  const nodes = [
    { x: 0.1, y: 0.2 },
    { x: 0.5, y: 0.2 },
  ];
  const hit = nearest(nodes, false, W, H, { x: 300, y: 130 });
  assert.equal(hit.seg, 0);
  near(hit.t, 0.5, 1e-6);
  near(hit.d, 30, 1e-6);
});

test("Free Draw turns a shaky trail into a few smooth nodes that follow it", () => {
  const trail = [];
  for (let i = 0; i <= 400; i++) {
    const x = 50 + i * 2;
    trail.push({ x, y: 250 + Math.sin(i / 40) * 80 + (i % 2 ? 0.8 : -0.8) });
  }
  const nodes = fitTrail(trail, W, H, 0.5);
  assert.ok(nodes.length >= 4 && nodes.length <= 40, `nodes: ${nodes.length}`);
  assert.ok(nodes.slice(1, -1).every((n) => n.t === "smooth"));
  const poly = flatten(nodes, false, W, H);
  for (let i = 10; i < trail.length - 10; i += 25) {
    const p = trail[i];
    const hit = nearest(nodes, false, W, H, p);
    assert.ok(hit.d < 8, `deviation ${hit.d.toFixed(2)} at ${i}`);
  }
  near(poly.length, 800 * 1.1, 200, "length roughly the trail's");
  // More smoothing never adds nodes.
  assert.ok(fitTrail(trail, W, H, 1).length <= fitTrail(trail, W, H, 0).length);
});

test("a sharp turn in Free Draw stays a corner", () => {
  const trail = [];
  for (let i = 0; i <= 100; i++) trail.push({ x: 100 + i * 3, y: 100 });
  for (let i = 1; i <= 100; i++) trail.push({ x: 400, y: 100 + i * 3 });
  const nodes = fitTrail(trail, W, H, 0.4);
  assert.ok(
    nodes.some(
      (n, i) =>
        i > 0 &&
        i < nodes.length - 1 &&
        n.t !== "smooth" &&
        Math.abs(n.x - 0.4) < 0.01,
    ),
  );
});

test("handles: smooth nodes stay in line, Alt breaks them", () => {
  const n = {
    x: 0.5,
    y: 0.5,
    t: "smooth",
    hi: { x: -0.1, y: 0 },
    ho: { x: 0.1, y: 0 },
  };
  const moved = moveHandle(n, "ho", { x: 0, y: 0.2 }, W, H, false);
  near(moved.hi.x, 0, 1e-9);
  near(moved.hi.y * H, -100, 1e-6, "opposite handle keeps its 100 px");
  const broken = moveHandle(n, "ho", { x: 0, y: 0.2 }, W, H, true);
  assert.equal(broken.t, "corner");
  assert.deepEqual(broken.hi, n.hi);
  const nodes = [
    { x: 0.1, y: 0.5 },
    { x: 0.5, y: 0.2 },
    { x: 0.9, y: 0.5 },
  ];
  const smooth = toggleNodeType(nodes, 1, false, W, H);
  assert.equal(smooth[1].t, "smooth");
  assert.ok(smooth[1].hi && smooth[1].ho);
  assert.deepEqual(toggleNodeType(smooth, 1, false, W, H)[1], {
    x: 0.5,
    y: 0.2,
  });
});

test("reverse and transform keep the shape", () => {
  const nodes = [
    { x: 0.1, y: 0.1, ho: { x: 0.1, y: 0 } },
    {
      x: 0.4,
      y: 0.3,
      t: "smooth",
      hi: { x: -0.05, y: -0.05 },
      ho: { x: 0.05, y: 0.05 },
    },
    { x: 0.7, y: 0.2 },
  ];
  assert.deepEqual(reverseNodes(reverseNodes(nodes)), nodes);
  near(
    flatten(reverseNodes(nodes), false, W, H).length,
    flatten(nodes, false, W, H).length,
    1e-3,
  );
  const moved = transformNodes(nodes, W, H, (p) => ({
    x: p.x * 2 + 10,
    y: p.y * 2,
  }));
  near(
    flatten(moved, false, W, H).length,
    flatten(nodes, false, W, H).length * 2,
    0.5,
  );
  near(moved[0].ho.x, 0.2, 1e-9, "handles scale, not shift");
});

test("Shift snaps the angle", () => {
  const p = snapAngle({ x: 0, y: 0 }, { x: 100, y: 12 }, 45);
  near(p.y, 0, 1e-9);
  near(p.x, Math.hypot(100, 12), 1e-9);
  const q = snapAngle({ x: 0, y: 0 }, { x: 50, y: 47 }, 45);
  near(q.x, q.y, 1e-9);
});

const layout = (poly, o = {}) =>
  layoutPieces(poly, {
    pieceLen: 40,
    thick: 10,
    spacing: 0,
    fit: true,
    corners: "continuous",
    cornerAt: [],
    startLen: 0,
    endLen: 0,
    cornerLen: 0,
    followPath: true,
    rotation: 0,
    offset: 0,
    flip: false,
    scaleJitter: 0,
    rotationJitter: 0,
    variants: 1,
    anchor: "center",
    seed: 1,
    max: 4000,
    ...o,
  });

test("Stamp Stroke: fitted pieces fill the path end to end", () => {
  const poly = flatten(
    [
      { x: 0.1, y: 0.5 },
      { x: 0.53, y: 0.5 },
    ],
    false,
    W,
    H,
  ); // 430 px
  const pieces = layout(poly);
  assert.equal(pieces.length, 11);
  near(
    pieces.reduce((s, p) => s + p.len, 0),
    430,
    1e-6,
  );
  near(pieces[0].x, 100 + pieces[0].len / 2, 1e-6);
  near(pieces.at(-1).x, 530 - pieces.at(-1).len / 2, 1e-6);
  // Without fit: whole pieces only, at their own length.
  const loose = layout(poly, { fit: false });
  assert.equal(loose.length, 10);
  assert.ok(loose.every((p) => Math.abs(p.len - 40) < 1e-6));
  // Spacing leaves gaps; negative spacing overlaps.
  assert.ok(layout(poly, { spacing: 0.5, fit: false }).length < 10);
  assert.ok(layout(poly, { spacing: -0.5, fit: false }).length > 10);
});

test("Stamp Stroke: corners split runs and get corner pieces; caps on open ends", () => {
  const nodes = [
    { x: 0.1, y: 0.1 },
    { x: 0.5, y: 0.1 },
    { x: 0.5, y: 0.9 },
  ];
  const poly = flatten(nodes, false, W, H);
  const corners = sharpNodes(nodes, false, W, H).map((i) => poly.nodeAt[i]);
  const pieces = layout(poly, {
    corners: "split",
    cornerAt: corners,
    cornerLen: 12,
    startLen: 12,
    endLen: 12,
  });
  const roles = pieces.map((p) => p.role);
  assert.equal(roles.filter((r) => r === "corner").length, 1);
  assert.equal(roles.filter((r) => r === "start").length, 1);
  assert.equal(roles.filter((r) => r === "end").length, 1);
  const corner = pieces.find((p) => p.role === "corner");
  near(
    Math.hypot(corner.x - 500, corner.y - 50),
    0,
    6,
    "corner piece sits on the corner",
  );
  // No segment straddles the corner: every piece is on one leg.
  for (const p of pieces.filter((x) => x.role === "seg"))
    assert.ok(
      Math.abs(p.x - 500) < 1 || Math.abs(p.y - 50) < 1,
      `${p.x},${p.y}`,
    );
  // Closed loops have no caps; a square loop gets a corner piece on all four
  // corners, including the one where it starts and ends.
  const square = [...nodes, { x: 0.1, y: 0.9 }],
    loop = flatten(square, true, W, H);
  assert.equal(
    layout(loop, { startLen: 12, endLen: 12 }).filter((p) => p.role !== "seg")
      .length,
    0,
  );
  const loopCorners = sharpNodes(square, true, W, H).map((i) => loop.nodeAt[i]);
  const boxed = layout(loop, {
    corners: "split",
    cornerAt: loopCorners,
    cornerLen: 12,
  }).filter((p) => p.role === "corner");
  assert.equal(boxed.length, 4);
  assert.ok(
    boxed.some((p) => Math.hypot(p.x - 100, p.y - 50) < 6),
    "corner piece at the start",
  );
});

test("Stamp Stroke: offset, upright pieces and base anchoring", () => {
  const poly = flatten(
    [
      { x: 0.1, y: 0.5 },
      { x: 0.5, y: 0.5 },
    ],
    false,
    W,
    H,
  );
  const right = layout(poly, { offset: 1 });
  assert.ok(
    right.every((p) => Math.abs(p.y - 260) < 1e-6),
    "one thickness to the right of travel (down)",
  );
  const upright = layout(poly, {
    followPath: false,
    rotation: 0,
    anchor: "base",
    fit: false,
  });
  assert.ok(
    upright.every((p) => p.angle === 0 && Math.abs(p.y - 245) < 1e-6),
    "standing on the line",
  );
  // Jitter is seeded: same seed, same layout.
  assert.deepEqual(
    layout(poly, { scaleJitter: 0.5, seed: 9 }),
    layout(poly, { scaleJitter: 0.5, seed: 9 }),
  );
});

test("built-in line art draws, and every built-in style is valid", () => {
  const sets = builtinLineSets();
  assert.ok(sets.length >= 10);
  for (const s of sets)
    for (const key of [
      ...s.parts.seg,
      s.parts.start,
      s.parts.end,
      s.parts.corner,
    ].filter(Boolean)) {
      const a = pieceAsset(key);
      assert.ok(a, key);
      const art = a.art();
      assert.ok(art.w > 0 && art.h > 0 && art.parts.length > 0, key);
      assert.ok(pieceAspect(key) > 0, key);
    }
  for (const style of builtinLineStyles())
    assert.ok(validLook(style.look), style.id);
  // Stamp sets are offered as line art too, but not hidden line pieces.
  const all = allLineSets();
  assert.ok(all.some((s) => s.id === "ls:tree"));
  assert.ok(!all.some((s) => s.id.startsWith("ls:ln-")));
  assert.equal(lineSet("ls:tree").defaults.followPath, false);
});

test("reset returns a property to the line's style, or the set's own default", () => {
  const styles = builtinLineStyles(),
    river = styles.find((s) => s.id === "p:river");
  const look = {
    ...river.look,
    stroke: { ...river.look.stroke, width: 0.02, color: "#000000" },
  };
  const reset = resetProp(look, baseLook("p:river", []), "stroke.width");
  assert.equal(reset.stroke.width, river.look.stroke.width);
  assert.equal(reset.stroke.color, "#000000", "only that property");
  assert.deepEqual(baseLook("nope", []), factoryLook());
  // A wall whose set was switched resets its size to the new set's own size.
  const fence = lineSet("lb:woodenFence"),
    wall = withSet(river.look, fence),
    bigger = { ...wall, stamp: { ...wall.stamp, size: 0.05 } };
  assert.equal(
    resetProp(bigger, baseLook("p:river", []), "stamp.size").stamp.size,
    fence.defaults.size,
  );
});

test("legacy paths open as lines with the same curve and look", () => {
  const points = [];
  for (let i = 0; i <= 50; i++)
    points.push({ x: 0.1 + i * 0.01, y: 0.5 + Math.sin(i / 8) * 0.1 });
  const project = {
    id: "p",
    name: "Old",
    width: W,
    height: H,
    tileCols: 40,
    tileRows: 20,
    resolutionTier: "medium",
    aspect: "landscape",
    background: "#2c5678",
    snapToGrid: false,
    updatedAt: 0,
    layers: [
      {
        id: "l",
        name: "L",
        visible: true,
        locked: false,
        opacity: 1,
        objects: [
          {
            id: "a",
            kind: "path",
            pathKind: "river",
            points,
            width: 0.006,
            color: "#4f86b0",
            opacity: 0.8,
            softness: 0.2,
            locked: true,
          },
        ],
      },
    ],
  };
  validateProject(project); // older files still import
  const out = migrateProject(project),
    line = out.layers[0].objects[0];
  assert.equal(line.kind, "line");
  assert.equal(line.id, "a");
  assert.equal(line.locked, true);
  assert.equal(line.stroke.color, "#4f86b0");
  assert.equal(line.stroke.width, 0.006);
  assert.equal(line.opacity, 0.8);
  assert.equal(line.styleId, "p:river");
  assert.ok(line.stroke.blur > 0 && line.stroke.blur <= 1);
  assert.ok(validLine(line));
  assert.ok(line.nodes.length <= points.length);
  for (const p of points.filter((_, i) => i % 5 === 0))
    assert.ok(
      nearest(line.nodes, false, W, H, { x: p.x * W, y: p.y * H }).d < 1.5,
    );
  validateProject(out);
});

test("validation rejects broken lines", () => {
  const ok = {
    ...factoryLook(),
    id: "x",
    kind: "line",
    closed: false,
    nodes: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  };
  assert.ok(validLine(ok));
  assert.ok(!validLine({ ...ok, nodes: [{ x: 0, y: 0 }] }), "one node");
  assert.ok(!validLine({ ...ok, closed: true }), "closed needs three");
  assert.ok(
    !validLine({
      ...ok,
      nodes: [
        { x: 0, y: 0 },
        { x: NaN, y: 1 },
      ],
    }),
    "NaN",
  );
  assert.ok(
    !validLine({ ...ok, stroke: { ...ok.stroke, width: 5 } }),
    "huge width",
  );
  assert.ok(
    !validLine({ ...ok, stroke: { ...ok.stroke, pattern: "zigzag" } }),
    "unknown pattern",
  );
  assert.ok(
    !validLine({
      ...ok,
      stamp: { ...ok.stamp, parts: { seg: ["javascript:alert(1)"] } },
    }),
    "bad asset key",
  );
  assert.ok(
    !validLine({
      ...ok,
      nodes: Array.from({ length: 2001 }, () => ({ x: 0, y: 0 })),
    }),
    "too many nodes",
  );
});
