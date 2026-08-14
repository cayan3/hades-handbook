import { describe, expect, it } from "vitest";
import type { GraphEdge } from "./god-graph.js";
import { lanesFor, type Place, wire } from "./god-page.js";

/**
 * The connector routing, given its endpoints rather than measured from a page.
 *
 * The page's own tests cannot assert any of this: the runner has no layout and
 * every box measures zero, so a coordinate read back from it is a fact about
 * jsdom. These two are pure functions of the places handed to them, so the
 * places are stated here and the arithmetic is the thing under test.
 */

function place(x: number, top: number, height = 60): Place {
  return { x, top, bottom: top + height };
}

function edge(from: string, to: string): GraphEdge {
  return { id: `${from}>${to}`, from, to, taken: false, reached: false };
}

/** Two source rows at y 0 and a target row at y 200, which is a roomy gap. */
const PLACES = new Map<string, Place>([
  ["a", place(100, 0)],
  ["b", place(200, 0)],
  ["c", place(300, 0)],
  ["x", place(120, 200)],
  ["y", place(280, 200)],
]);

describe("lanesFor", () => {
  it("puts everything feeding one node on a single bar", () => {
    // The bus, and the whole reason a fan of wires reads as one thing: three
    // sources meet at one height and drop into the target once.
    const lanes = lanesFor([edge("a", "x"), edge("b", "x"), edge("c", "x")], PLACES);
    expect(new Set(lanes.values()).size).toBe(1);
  });

  it("gives two neighbouring targets different heights", () => {
    // Sharing one is what drew every wire between two bands as a single thick
    // line, which is the whole complaint this answers.
    const lanes = lanesFor([edge("a", "y"), edge("c", "x")], PLACES);
    const heights = [...new Set(lanes.values())];
    expect(heights).toHaveLength(2);
    expect(Math.abs(heights[0]! - heights[1]!)).toBe(9);
  });

  it("reuses a height once the gap has run out of room for another", () => {
    // The gap decides how many heights there are. A tight one holds a single
    // lane and every bar in the row shares it, which is where this started.
    const tight = new Map<string, Place>([
      ["a", place(100, 0)],
      ["b", place(200, 0)],
      ["x", place(120, 90)],
      ["y", place(280, 90)],
    ]);
    const lanes = lanesFor([edge("a", "x"), edge("b", "y")], tight);
    expect(new Set(lanes.values()).size).toBe(1);
  });

  it("shares a height between the bars furthest apart, never adjacent ones", () => {
    // Ordered by where the target sits, so the pair forced to share is the pair
    // least likely to overlap along the way.
    const four = new Map<string, Place>([
      ["a", place(0, 0)],
      ["x", place(0, 120)],
      ["y", place(100, 120)],
      ["z", place(200, 120)],
    ]);
    // 120 - 60 - 28 = 32 of room, which is three lanes, so the fourth target
    // would be the first to double up.
    const lanes = lanesFor([edge("a", "x"), edge("a", "y"), edge("a", "z")], four);
    expect(new Set(lanes.values()).size).toBe(3);
  });

  it("keeps a bar clear of the icons at both ends", () => {
    const lanes = lanesFor([edge("a", "x")], PLACES);
    const at = lanes.get("a>x")!;
    expect(at).toBeLessThanOrEqual(200 - 14);
    expect(at).toBeGreaterThanOrEqual(60 + 14);
  });

  it("falls back to the midpoint where the gap cannot hold the clearance", () => {
    // A tight gap has nowhere to put a bar that clears both ends, and a bar
    // drawn over an icon is worse than one drawn close to two.
    const tight = new Map<string, Place>([["a", place(100, 0)], ["x", place(200, 70)]]);
    const lanes = lanesFor([edge("a", "x")], tight);
    expect(lanes.get("a>x")).toBe(65);
  });

  it("ignores a wire inside one band, which has no gap to sit in", () => {
    const level = new Map<string, Place>([["a", place(100, 0)], ["b", place(200, 0)]]);
    expect(lanesFor([edge("a", "b")], level).size).toBe(0);
  });
});

describe("wire", () => {
  it("routes down, across its bar, and down again", () => {
    expect(wire(place(100, 0), place(200, 200), 150)).toBe(
      "M 100 60 L 100 150 L 200 150 L 200 200",
    );
  });

  it("drops straight where the two are in a column", () => {
    // Three segments where one will do reads as a detour around nothing.
    expect(wire(place(100, 0), place(100, 200), 150)).toBe("M 100 60 L 100 200");
  });

  it("draws nothing at all from an endpoint nobody has measured", () => {
    // The first frame, and every frame under a runner with no layout.
    expect(wire(undefined, place(100, 200), 150)).toBe("");
    expect(wire(place(100, 0), undefined, 150)).toBe("");
  });

  it("clears the source itself where there is no bar", () => {
    // Two nodes in one band: `lanesFor` skips the pair, so the run drops below
    // the row rather than cutting back through it.
    expect(wire(place(100, 0), place(200, 0), undefined)).toBe(
      "M 100 60 L 100 74 L 200 74 L 200 0",
    );
  });
});
