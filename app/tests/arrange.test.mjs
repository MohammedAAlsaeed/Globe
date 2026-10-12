// Arranging objects: groups, alignment, even spacing, offsets.
import test from "node:test";
import assert from "node:assert/strict";
import { alignDeltas, distributeDeltas, pickable, shiftPatch, withGroups } from "../features/mapmaker/arrange.ts";

const rects = new Map([
  ["a", { x: 0, y: 0, width: 10, height: 10 }],
  ["b", { x: 50, y: 20, width: 20, height: 10 }],
  ["c", { x: 30, y: 60, width: 10, height: 30 }],
]);

test("align to the selection's own edges and centers", () => {
  assert.deepEqual([...alignDeltas(rects, "left").values()].map((d) => d.dx), [0, -50, -30]);
  assert.deepEqual([...alignDeltas(rects, "right").values()].map((d) => d.dx), [60, 0, 30]);
  assert.deepEqual([...alignDeltas(rects, "centerX").values()].map((d) => d.dx), [30, -25, 0]);
  assert.deepEqual([...alignDeltas(rects, "bottom").values()].map((d) => d.dy), [80, 60, 0]);
  assert.ok([...alignDeltas(rects, "top").values()].every((d) => d.dx === 0));
});

test("distribute spaces centers evenly between the outer two", () => {
  const d = distributeDeltas(rects, "x");
  // centers 5, 60, 35 → sorted a(5) c(35) b(60): c moves to 32.5
  assert.equal(d.get("a").dx, 0);
  assert.equal(d.get("b").dx, 0);
  assert.equal(d.get("c").dx, -2.5);
  assert.equal(distributeDeltas(new Map([...rects].slice(0, 2)), "x").size, 0);
});

test("a group is picked as a whole", () => {
  const objs = [
    { id: "1", kind: "stamp", group: "g" },
    { id: "2", kind: "stamp", group: "g" },
    { id: "3", kind: "stamp", group: "g", hidden: true },
    { id: "4", kind: "stamp" },
  ];
  assert.deepEqual(withGroups(["1"], objs).sort(), ["1", "2"]);
  assert.deepEqual(withGroups(["4"], objs), ["4"]);
  assert.equal(pickable({ locked: true }), false);
  assert.equal(pickable({ hidden: true }), false);
  assert.equal(pickable({}), true);
});

test("moving by an offset", () => {
  assert.deepEqual(shiftPatch({ kind: "stamp", x: 0.2, y: 0.3 }, 0.1, -0.1), { x: 0.30000000000000004, y: 0.19999999999999998 });
  assert.deepEqual(shiftPatch({ kind: "path", points: [{ x: 0, y: 0 }] }, 0.5, 0.5), { points: [{ x: 0.5, y: 0.5 }] });
  assert.deepEqual(shiftPatch({ kind: "paint" }, 1, 1), {});
});
