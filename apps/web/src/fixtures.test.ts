import { evaluate } from "@repo/core";
import { deriveNodeView } from "@repo/ui";
import { describe, expect, it } from "vitest";
import {
  ACTIVE,
  DORMANT,
  FULL_POOL,
  LADDER,
  LIGHTNING_ROD,
  POOL_DEMO,
  SELF_HEALING,
  hades1,
  hades2,
} from "./fixtures.js";

/**
 * Five hand-written runs are a demonstration of five states only if the engine
 * agrees they are five states; without this they are five labels somebody typed
 * next to five pictures. Node environment, no document needed.
 */

describe("the fixture ladder", () => {
  it.each(LADDER)("puts Lightning Rod in $state", ({ state, facts }) => {
    expect(deriveNodeView(hades1, LIGHTNING_ROD, facts).state).toBe(state);
  });

  it("covers all five and repeats none", () => {
    expect(new Set(LADDER.map((rung) => rung.state)).size).toBe(5);
  });
});

describe("the full-pool fixture", () => {
  it("is a pool the shipped rules actually call full", () => {
    // The record is written by hand and says so; the verdict is not. Four
    // slot-holding gods is the cap in both games, and this asserts the rules
    // agree rather than assuming it.
    expect(hades1.rules.isGodPoolFull(FULL_POOL)).toBe(true);
    expect(evaluate({ kind: "godInPool", god: "Poseidon" }, FULL_POOL, hades1.rules, hades1.lookups).kind).toBe(
      "unsatisfiable",
    );
  });

  it("reaches the required copy, and names the keepsake from the catalog", () => {
    const view = deriveNodeView(hades1, POOL_DEMO, FULL_POOL);
    expect(view.state).toBe("Impossible");
    expect(view.notice?.lead).toBe("Impossible for now.");
    expect(view.notice?.keepsake).toBe("Conch Shell");
  });
});

describe("the Infusion fixtures", () => {
  it("is owned and inert below the threshold, and owned and live above it", () => {
    expect(deriveNodeView(hades2, SELF_HEALING, DORMANT).dormant).toBe(true);
    expect(deriveNodeView(hades2, SELF_HEALING, ACTIVE).dormant).toBe(false);
    for (const facts of [DORMANT, ACTIVE]) {
      expect(deriveNodeView(hades2, SELF_HEALING, facts).state).toBe("Obtained");
    }
  });
});
