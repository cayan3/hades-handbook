import type { Rarity } from "@repo/core";
import type { NodeKind, NodeView } from "./node-view.js";

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
 * The word a surface shows about a boon, and the colour to draw it in.
 *
 * One function because it is one rule: a boon with a **kind** shows that kind's
 * name and no rarity, and a kindless boon is the only thing that shows one.
 *
 * A null colour is not "no word" — Common has no treatment anywhere and still
 * writes its name, in ink. Ask about the colour to paint something, about the
 * word to write it.
 */
export interface RarityTreatment {
  readonly word: string;
  /** `null` where nothing is painted, which is Common and a rarity we don't know. */
  readonly colour: string | null;
}

export function treatmentOf(view: NodeView): RarityTreatment | null {
  if (view.kind !== null) return { word: kindWord(view.kind), colour: kindWordColour(view.kind) };
  if (view.rarity === null) return null;
  return { word: view.rarity, colour: RARITY_COLOURS[view.rarity] ?? null };
}

/** What each kind is called wherever one is named. */
const KIND_WORDS: Readonly<Record<NodeKind, string>> = {
  duo: "Duo",
  hex: "Godsent Hex",
  infusion: "Infusion",
  legendary: "Legendary",
};

export function kindWord(kind: NodeKind): string {
  return KIND_WORDS[kind];
}

/**
 * The colour a **god page's outline** takes for the four kinds of boon that are
 * not an ordinary offer from that god, `null` for a Duo.
 *
 * A Duo is `null` because on that surface its hue is not fixed: it takes its
 * *partner's*, which only the page knows, and which is the one colour on a
 * single-god page that discriminates anything.
 *
 * Three of the four values are the game's own and are the same hexes as above.
 * The Godsent Hex is ours: the game declares no rarity for one, and near-white
 * is free now that Common has none — moonlight, which is what a Hex is. It is
 * **not** Selene's `#7E90C4`, which is her god colour on cross-god surfaces; a
 * Hex rides somebody else's page, so the two are different roles and would
 * collide on Selene's own tab if they were one value.
 *
 * It was `#FFFFFF` for a round and read too bright, which the measurement had
 * predicted: 19:1 on the page's ground made it the brightest thing on any page.
 * This is 12.8:1, and every distance that chose it is wider than white's — 21.5
 * to Demeter against the 13.2 that ruled out the first candidate, 14.8 to the
 * no-god outline against the 7.9 that ruled out silver. Its nearest neighbour
 * is the ink at 13.0, which is body text and never an outline.
 *
 * An Infusion takes the colour the games name **Elemental**, and is found by
 * its gate rather than by that name: measured, not one record in either game
 * declares an Elemental rarity, so the palette entry has never had a record to
 * come from.
 */
const KIND_COLOURS: Readonly<Record<Exclude<NodeKind, "duo">, string>> = {
  legendary: RARITY_COLOURS["Legendary"]!,
  hex: "#D2D4DE",
  infusion: RARITY_COLOURS["Elemental"]!,
};

export function kindOutlineColour(kind: NodeKind): string | null {
  return kind === "duo" ? null : KIND_COLOURS[kind];
}

/**
 * The colour a kind's **word** is written in, wherever one is written.
 *
 * One entry apart from the outline above, and the difference is the surface
 * rather than the boon: a god page has a partner to hand a Duo, and a Loadout
 * tile has no page god at all, so there it takes the games' own Duo colour.
 */
export function kindWordColour(kind: NodeKind): string {
  return kind === "duo" ? RARITY_COLOURS["Duo"]! : KIND_COLOURS[kind];
}
