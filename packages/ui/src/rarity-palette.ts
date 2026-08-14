import type { Rarity } from "@repo/core";
import type { NodeKind } from "./god-graph.js";

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
 *
 * **Common is deliberately absent.** It has no treatment anywhere — that is the
 * game's own rule and it is what makes a treated tile mean something — so
 * giving it a value here is inviting somebody to draw one. The *word* still
 * renders wherever a rarity is named, and falls through to the ink below.
 * White also belongs to something else now, which is the other half of why.
 */
const RARITY_COLOURS: Readonly<Record<string, string>> = {
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

/**
 * The colour a god page's outline takes for the four kinds of boon that are not
 * an ordinary offer from that god, `null` for a Duo and for everything else.
 *
 * A Duo is `null` because its hue is not fixed: it takes its *partner's*, which
 * only the page knows, and which is the one colour on a single-god page that
 * discriminates anything.
 *
 * Three of the four values are the game's own and are the same hexes as above.
 * The Godsent Hex is ours: the game declares no rarity for one, and white is
 * free now that Common has none — moonlight, which is what a Hex is. It is
 * **not** Selene's `#7E90C4`, which is her god colour on cross-god surfaces; a
 * Hex rides somebody else's page, so the two are different roles and would
 * collide on Selene's own tab if they were one value.
 *
 * An Infusion takes the colour the games name **Elemental**, and is found by
 * its gate rather than by that name: measured, not one record in either game
 * declares an Elemental rarity, so the palette entry has never had a record to
 * come from.
 */
const KIND_COLOURS: Readonly<Record<NodeKind, string | null>> = {
  duo: null,
  legendary: RARITY_COLOURS["Legendary"]!,
  hex: "#FFFFFF",
  infusion: RARITY_COLOURS["Elemental"]!,
};

export function kindColour(kind: NodeKind): string | null {
  return KIND_COLOURS[kind];
}
