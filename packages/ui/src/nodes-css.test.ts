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

  /**
   * The dialog outranks the page, and an inner layer cannot reach past its own
   * component.
   *
   * Found by using it: the god page gave its bands a `z-index` so the connector
   * layer could sit behind them, and the scrim had none at all -- so the graph
   * painted over the open sheet and went on taking clicks through it. The toast
   * and the Goals panel had outranked it the same way for longer.
   *
   * Checked here rather than in a component test because it is a fact about
   * painting, and the runner does not paint.
   */
  it("puts the modal above everything and keeps inner layers inside", () => {
    const layers = [...CSS.matchAll(/([^{}]*)\{([^}]*z-index:\s*(\d+)[^}]*)\}/g)].map((m) => ({
      selector: m[1]!.trim(),
      order: Number(m[3]),
    }));
    const scrim = layers.find((layer) => layer.selector.includes(".sheet-scrim"));
    expect(scrim).toBeDefined();
    for (const layer of layers) {
      if (layer.selector.includes(".sheet-scrim")) continue;
      expect(layer.order, `${layer.selector} is not below the scrim`).toBeLessThan(scrim!.order);
    }

    // Every rule that orders something against a sibling has to sit in a
    // stacking context of its own, or the number leaks to the whole document.
    for (const owner of [".godpage", ".loadout__tile"]) {
      const rule = CSS.match(new RegExp(`\\${owner}\\s*\\{([^}]*)\\}`));
      expect(rule?.[1], `${owner} does not isolate`).toMatch(/isolation:\s*isolate/);
    }
  });

  it("takes its shape from the game and from nothing else", () => {
    // Shape follows the artwork: Hades I draws boons as diamonds and Hades II
    // as rounded squares, and one silhouette for both crops 44% off every
    // Hades II icon. What shape still never says is what kind of boon this is --
    // a Duo and a Legendary look alike inside one game. So the two shapes are
    // allowed, and the thing worth guarding is what may choose between them.
    const shapes = new Set([...CSS.matchAll(/clip-path:\s*([^;]+);/g)].map((m) => m[1]!.trim()));
    expect(shapes).toEqual(new Set(["var(--node-clip)"]));

    // Comments first: this file explains itself at length, and a prose block
    // mentioning a property reads as a rule setting one.
    const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const choosers = [...rules.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter(([, , body]) => /--node-(clip|radius)\s*:/.test(body!))
      .map(([, selector]) => selector!.trim().replace(/\s+/g, " "));
    // A base for the node and a base for the loadout tile, which is not inside
    // one, then a single override naming the game. Anything keyed on state or
    // rarity would be shape-as-type coming back in through the stylesheet.
    expect(choosers).toEqual([
      ".node",
      '.node[data-game="hades2"], .loadout__tile[data-game="hades2"]',
      ".loadout__tile",
    ]);
  });
});
