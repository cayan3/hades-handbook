import type { Rarity } from "@repo/core";

/**
 * The rarity colours, verbatim from both games, which agree on every tier they
 * share.
 *
 * This is not one of the ladder's channels and must never become one. State is
 * structural and hue means which god granted a boon; a rarity swatch is a third
 * thing and it earns its place only where it sits beside a name rather than on
 * a 40px diamond, where a third channel is where legibility goes.
 *
 * **Colour is never the only carrier.** Every place this is used puts the
 * rarity's name in text a reader can reach — a title for a pointer, a
 * visually-hidden span for a screen reader — because two of these values are
 * identical (`Duo` and `Perfect`), and because a swatch says nothing to
 * somebody who cannot see it.
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
