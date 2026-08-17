import { describe, expect, it } from "vitest";
import type { NodeKind, NodeView } from "./node-view.js";
import {
  byLadder,
  kindOutlineColour,
  kindWordColour,
  rarityColour,
  treatmentOf,
} from "./rarity-palette.js";

/**
 * The colours that are not a god's, and the two rules about them that are easy
 * to break by adding a value to a table.
 */
describe("the rarity palette", () => {
  it("gives Common no colour of its own", () => {
    // Common has no treatment anywhere — that is the game's rule and it is what
    // makes a treated tile mean something. The *word* still renders, so this
    // falls through to the ink rather than to nothing.
    expect(rarityColour("Common")).toBe("currentColor");
  });

  it("keeps the colours the games declare", () => {
    expect(rarityColour("Legendary")).toBe("#FF9000");
    // Two of the game's own rarity colours are identical, which is why nothing
    // anywhere depends on telling two hues apart.
    expect(rarityColour("Duo")).toBe(rarityColour("Perfect"));
  });

  /**
   * The records declare rarities alphabetically — every one of the 784 that
   * declares any hands back `Common, Epic, Heroic, Rare` — so a list drawn in
   * record order reads as a jumble rather than as the ladder it is.
   */
  it("puts a list of rarities in the ladder's order", () => {
    expect(byLadder(["Common", "Epic", "Heroic", "Rare"])).toEqual([
      "Common",
      "Rare",
      "Epic",
      "Heroic",
    ]);
  });

  it("leaves a rarity a patch adds at the end rather than dropping it", () => {
    expect(byLadder(["Epic", "Mythic" as never, "Common"])).toEqual([
      "Common",
      "Epic",
      "Mythic",
    ]);
  });

  it("falls back to the ink for a rarity a patch adds", () => {
    expect(rarityColour("Mythic" as never)).toBe("currentColor");
  });
});

describe("the four kinds a god page colours", () => {
  it("hands a Duo back nothing, because its hue is the partner's", () => {
    // Only the page knows who the partner is, and the Duo colour would be the
    // same on every Duo in the game.
    expect(kindOutlineColour("duo")).toBeNull();
  });

  it("gives the other three a colour", () => {
    expect(kindOutlineColour("legendary")).toBe("#FF9000");
    expect(kindOutlineColour("infusion")).toBe("#FF4BFF");
    expect(kindOutlineColour("hex")).toBe("#D2D4DE");
  });

  it("does not hand a Godsent Hex Selene's own colour", () => {
    // Two roles, two values. A Hex rides somebody else's page; Selene's colour
    // is hers on the god tabs and the cross-god surfaces, and one value for
    // both would collide on her own tab.
    expect(kindOutlineColour("hex")).not.toBe("#7E90C4");
  });

  it("gives the Duo's word a colour where there is no page god to ask", () => {
    // The Loadout and the Action Sheet have no partner to take a hue from, so
    // the one entry the two tables differ in is the one that matters there.
    expect(kindWordColour("duo")).toBe("#D2FF61");
    expect(kindWordColour("hex")).toBe(kindOutlineColour("hex"));
  });
});

describe("the word a surface shows", () => {
  function view(over: Partial<NodeView>): NodeView {
    return { kind: null, rarity: null, ...over } as NodeView;
  }

  it("says the kind, not the rarity the record declares", () => {
    // The defect this rule exists for: a Hades I Duo declares Legendary and
    // nothing else, so it used to say "Legendary" and wear the Legendary
    // orange on four surfaces.
    for (const [kind, word] of [
      ["duo", "Duo"],
      ["hex", "Godsent Hex"],
      ["infusion", "Infusion"],
      ["legendary", "Legendary"],
    ] as const satisfies readonly (readonly [NodeKind, string])[]) {
      expect(treatmentOf(view({ kind }))?.word).toBe(word);
    }
  });

  it("writes Common's word and paints nothing behind it", () => {
    const treatment = treatmentOf(view({ rarity: "Common" }));
    expect(treatment?.word).toBe("Common");
    expect(treatment?.colour).toBeNull();
  });

  it("says nothing about a boon with neither", () => {
    expect(treatmentOf(view({}))).toBeNull();
  });
});
