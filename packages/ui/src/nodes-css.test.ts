import { describe, expect, it } from "vitest";
// The stylesheet as text rather than as a stylesheet. Read through the bundler
// so this file needs no filesystem, which the browser half of the workspace
// deliberately has no types for.
import CSS from "./nodes.css?raw";

/**
 * The rule the stylesheet exists to keep, checked by reading the stylesheet.
 *
 * State is structural and never hue: the moment a state step sets a colour, state
 * and god identity are sharing one channel and a colourblind reader has lost
 * both. That rule is a sentence in a design doc and a comment at the top of a
 * stylesheet, which between them have stopped nobody from adding a red border to
 * an impossible node at half past one in the morning.
 *
 * Blunt on purpose: it reads the declarations in every state-keyed rule and fails
 * on any property that paints. A false positive is a conversation; a false
 * negative is the ladder quietly becoming a colour code. It also holds the
 * no-hatching rule, which is easier — a repeating gradient over boon artwork
 * reads as texture rather than rank at the size these are drawn.
 */

/** Rules keyed on a state, which are the ladder's steps and nothing else. */
function stateRules(): ReadonlyArray<[string, string]> {
  const found: Array<[string, string]> = [];
  const pattern = /([^{}]*\[data-state=[^{}]*)\{([^}]*)\}/g;
  for (const match of CSS.matchAll(pattern)) {
    found.push([match[1]!.trim(), match[2]!]);
  }
  return found;
}

/**
 * `filter` and `box-shadow` are absent on purpose — they are what the ladder
 * rides on. A filter changes the brightness and saturation of whatever is there
 * already, and the frame takes its colour from a per-node custom property rather
 * than from a state.
 */
const PAINTS = /(^|[\s;])(color|background|background-color|border-color|fill|stroke|outline-color)\s*:/;

describe("the node stylesheet", () => {
  it("has the ladder in it at all", () => {
    // Guards the test rather than the stylesheet: a regex that matched nothing
    // would pass every assertion below and prove nothing at all.
    const rules = stateRules();
    expect(rules.length).toBeGreaterThanOrEqual(5);
    for (const state of ["Obtained", "Available", "Pending", "Locked", "Impossible"]) {
      expect(rules.some(([selector]) => selector.includes(state))).toBe(true);
    }
  });

  it("carries no state step as a colour", () => {
    for (const [selector, body] of stateRules()) {
      // The god colour is the exception that proves the rule: a node may take
      // a hue, and it takes it from which god granted the boon, never from
      // which rung of the ladder it is on.
      const paints = body
        .split("\n")
        .filter((line) => PAINTS.test(line) && !line.includes("--god"));
      expect(paints, `${selector} paints: ${paints.join(" ")}`).toEqual([]);
    }
  });

  it("hatches nothing", () => {
    expect(CSS).not.toMatch(/repeating-linear-gradient|repeating-conic-gradient/);
    expect(CSS).not.toMatch(/background-image\s*:/);
  });

  it("draws every node as the same diamond", () => {
    // Shape says nothing here. A Duo and a Legendary are told apart by what is
    // inside the frame, never by its silhouette, so there is exactly one shape
    // in the file. (A junction is drawn rather than clipped, and is smaller
    // than a node because it is not one -- that is the only other shape in the
    // package, and it is in the component rather than here.)
    const shapes = new Set([...CSS.matchAll(/clip-path:\s*([^;]+);/g)].map((m) => m[1]!.trim()));
    expect(shapes).toEqual(new Set(["polygon(50% 0, 100% 50%, 50% 100%, 0 50%)"]));
  });
});
