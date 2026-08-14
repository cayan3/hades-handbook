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

/**
 * A node is 62px across on the god page, so the default is that icon. `text` is
 * how far the name reaches below and beside it — names measure 50 to 102px
 * against that 62px icon, so the guard is wider as well as taller.
 */
function place(x: number, top: number, height = 60, width = 62, text = 0, textWidth = width): Place {
  const wide = Math.max(width, textWidth);
  return {
    x,
    left: x - wide / 2,
    right: x + wide / 2,
    top,
    bottom: top + height,
    guard: top + height + text,
  };
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

  it("puts targets asking for the same things on one bar", () => {
    // The bus in the game's own dependency charts: several boons behind one
    // requirement hang off a single line rather than each drawing its own.
    // Measured over both catalogs, 158 of 452 targets are in such a group and
    // the largest gathers eight.
    const roomy = new Map<string, Place>([
      ["a", place(0, 0)],
      ["x", place(0, 180)],
      ["y", place(100, 180)],
      ["z", place(200, 180)],
    ]);
    const same = lanesFor([edge("a", "x"), edge("a", "y"), edge("a", "z")], roomy);
    expect(new Set(same.values()).size).toBe(1);
  });

  it("keeps a bar of its own for a target that asks for something else", () => {
    // Merging is on the ask being identical, not on it overlapping: `z` wants a
    // second boon, so it is not on the same requirement and not on the bar.
    const roomy = new Map<string, Place>([
      ["a", place(0, 0)],
      ["b", place(300, 0)],
      ["x", place(0, 180)],
      ["y", place(100, 180)],
      ["z", place(200, 180)],
    ]);
    const mixed = lanesFor(
      [edge("a", "x"), edge("a", "y"), edge("a", "z"), edge("b", "z")],
      roomy,
    );
    expect(mixed.get("a>x")).toBe(mixed.get("a>y"));
    expect(mixed.get("a>z")).not.toBe(mixed.get("a>x"));
    expect(mixed.get("a>z")).toBe(mixed.get("b>z"));
  });

  it("shares a height once the gap has run out of room for another", () => {
    // The gap decides how many heights there are, and a tight one holds a
    // single lane — which is the degradation rather than a bar over an icon.
    const tight = new Map<string, Place>([
      ["a", place(0, 0)],
      ["b", place(300, 0)],
      ["x", place(0, 120)],
      ["y", place(200, 120)],
    ]);
    const lanes = lanesFor([edge("a", "x"), edge("b", "y")], tight);
    expect(new Set(lanes.values()).size).toBe(1);
  });

  it("keeps a bar clear of the icons at both ends", () => {
    const lanes = lanesFor([edge("a", "x")], PLACES);
    const at = lanes.get("a>x")!;
    expect(at).toBeLessThanOrEqual(200 - 26);
    expect(at).toBeGreaterThanOrEqual(60 + 26);
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
  it("routes down, across its bar, and down again, on 45s", () => {
    // Right angles cut back by 16px, which is the only other angle the page
    // draws. The horizontal survives; what goes is the corner itself.
    expect(wire(place(100, 0), place(200, 200), 150)).toBe(
      "M 100 60 L 100 134 L 116 150 L 184 150 L 200 166 L 200 200",
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
      "M 100 60 L 100 73 L 113 86 L 184 86 L 200 70 L 200 0",
    );
  });

  it("turns a sidestep into one 45 rather than two right angles", () => {
    // Measured on Hera, 17 of 68 segments were a step of 14px or less between
    // two right angles, which reads as a slip. At that width the two chamfers
    // meet in the middle and the whole turn becomes a single dogleg — one
    // segment, because a corner drawn where the line does not turn is a corner
    // that will one day be drawn with a join on it.
    expect(wire(place(100, 0), place(114, 400), 200)).toBe(
      "M 100 60 L 100 193 L 114 207 L 114 400",
    );
  });

  it("goes around an icon in the way rather than through it", () => {
    // The wrapped-band case, and the only crossing Hera had: a source on the
    // first row of a band falls straight through the second. The detour starts
    // halfway to the row below, so the corner that begins it is not a stub.
    const blocker = place(100, 120);
    expect(wire(place(100, 0), place(300, 400), 380, [blocker])).toBe(
      "M 100 60 L 100 75 L 115 90 L 284 90 L 300 106 L 300 400",
    );
  });

  it("passes an icon on its near side, which is the shortest detour", () => {
    // Both ends sit inside the blocker's column, so neither the drop out of the
    // source nor a drop straight to the target is clear. 141 is the blocker's
    // right edge plus the 10px that reads as clear of it, and it is nearer than
    // the left edge at 59.
    const blocker = place(100, 120);
    const path = wire(place(100, 0), place(120, 400), 380, [blocker]);
    expect(path).toContain("L 141 ");
    expect(path.endsWith("L 120 400")).toBe(true);
  });

  it("takes the corners over a lean where the lean would cross an icon", () => {
    // Rule against rule: 20px over a 340px fall is well inside "nearly
    // aligned", and going straight there would draw through the blocker.
    const blocker = place(100, 120);
    const path = wire(place(100, 0), place(120, 400), 380, [blocker]);
    expect(path.split(" L ").length).toBeGreaterThan(2);
  });

  it("keeps clear of a boon's name, not only its icon", () => {
    // Nine segments on Hera were drawn across a name. The column here is 45px
    // off the blocker's centre: outside its 62px icon and inside its 120px
    // name, so only a guard that counts the text sees it at all.
    const named = place(300, 120, 60, 62, 40, 120);
    const bare = place(300, 120, 60, 62, 0, 62);
    const from = place(345, 0);
    const to = place(345, 400);

    expect(wire(from, to, 380, [bare])).toBe("M 345 60 L 345 400");
    expect(wire(from, to, 380, [named])).not.toBe("M 345 60 L 345 400");
  });

  it("does not treat its own two ends as things to avoid", () => {
    // A wire leaves through the underside of its source's icon and therefore
    // across that source's own name. That is the anchor doing what it was
    // chosen to do, and reading it as a crossing would send every wire on a
    // detour around itself.
    const from = place(100, 0, 60, 62, 40);
    const to = place(100, 300, 60, 62, 40);
    expect(wire(from, to, 250, [from, to])).toBe("M 100 60 L 100 300");
  });

  it("draws only right angles and 45s, and nothing between", () => {
    // The whole angle vocabulary of the page. Every segment runs vertically,
    // horizontally, or at exactly 45 degrees; anything else is a lean, which
    // reads as a mistake beside a page of square corners.
    const paths = [
      wire(place(100, 0), place(200, 200), 150),
      wire(place(100, 0), place(114, 400), 200),
      wire(place(100, 0), place(300, 400), 380, [place(100, 120)]),
    ];
    for (const path of paths) {
      const pts = path.split(/[ML] /).filter(Boolean).map((s) => s.trim().split(" ").map(Number));
      for (let i = 1; i < pts.length; i += 1) {
        const dx = Math.abs(pts[i]![0]! - pts[i - 1]![0]!);
        const dy = Math.abs(pts[i]![1]! - pts[i - 1]![1]!);
        const ok = dx < 0.01 || dy < 0.01 || Math.abs(dx - dy) < 0.01;
        expect(ok, `${path} has a segment of ${dx} by ${dy}`).toBe(true);
      }
    }
  });
});
