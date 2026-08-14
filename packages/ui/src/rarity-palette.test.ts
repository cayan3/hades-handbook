import { describe, expect, it } from "vitest";
import { kindColour, rarityColour } from "./rarity-palette.js";

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

  it("falls back to the ink for a rarity a patch adds", () => {
    expect(rarityColour("Mythic" as never)).toBe("currentColor");
  });
});

describe("the four kinds a god page colours", () => {
  it("hands a Duo back nothing, because its hue is the partner's", () => {
    // Only the page knows who the partner is, and the Duo colour would be the
    // same on every Duo in the game.
    expect(kindColour("duo")).toBeNull();
  });

  it("gives the other three a colour", () => {
    expect(kindColour("legendary")).toBe("#FF9000");
    expect(kindColour("infusion")).toBe("#FF4BFF");
    expect(kindColour("hex")).toBe("#FFFFFF");
  });

  it("does not hand a Godsent Hex Selene's own colour", () => {
    // Two roles, two values. A Hex rides somebody else's page; Selene's colour
    // is hers on the god tabs and the cross-god surfaces, and one value for
    // both would collide on her own tab.
    expect(kindColour("hex")).not.toBe("#7E90C4");
  });
});
