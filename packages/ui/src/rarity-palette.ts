import type { Rarity } from "@repo/core";

/**
 * The rarity colours, verbatim from both games, which agree on every tier they
 * share.
 *
 * Not one of the ladder's channels and never to become one: state is structural
 * and hue means which god granted a boon, so a rarity swatch is a third thing
 * and only earns its place where it sits beside a name rather than on a 40px
 * diamond.
 *
 * **Colour is never the only carrier.** Everywhere this is used puts the name in
 * text a reader can reach, because `Duo` and `Perfect` are the same hex and
 * because a swatch says nothing to somebody who cannot see it.
 */
const RARITY_COLOURS: Readonly<Record<string, string>> = {
  Common: "#FFFFFF",
  Rare: "#008AFF",
  Epic: "#9D12FF",
  Duo: "#D2FF61",
  Heroic: "#F86059",
  Legendary: "#FF9000",
  Elemental: "#FF4BFF",
  Perfect: "#D2FF61",
  Legacy: "#51DBDB",
};

/** Falls back to the ink colour, so an unknown rarity is plain rather than invisible. */
export function rarityColour(rarity: Rarity): string {
  return RARITY_COLOURS[rarity] ?? "currentColor";
}
