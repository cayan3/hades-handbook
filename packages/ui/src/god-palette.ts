import type { GodId } from "@repo/core";

/**
 * One colour per god. Hue means identity and never state, which is what keeps
 * state legible to a colourblind reader and in a greyscale screenshot.
 *
 * These earn their keep on cross-god chrome — god tabs, duo edges, requirement
 * rows — and on the fallback ladder, where colour is the only identity channel
 * left. On the default ladder they do almost nothing, since real boon art
 * already carries its god's colour.
 *
 * Each god's own loot colour, hue-spread where two collided, and the same hex in
 * both games. Demeter is retuned to pale ice blue: frost theme, and it also
 * separates her from Poseidon in the first game. Hades grants boons in the
 * second game and gets no colour — no loot data entry to take one from, and his
 * scope is unclear, so any hue would be invented.
 *
 * Selene is designed twice over: her extracted value is a placeholder shared
 * with Chaos, and the violet that replaced it was never moonlight. This one is,
 * and it is darker than a moonlit blue wants to be for a reason — Demeter
 * already holds the pale ice-blue end of this hue, so the only axis left to
 * separate on is lightness. Measured, it clears her by 24 in CIE Lab, which is
 * the closest any candidate in this family gets without colliding outright.
 */
const GOD_COLOURS: Readonly<Record<GodId, string>> = Object.freeze({
  Zeus: "#FFE81F",
  Apollo: "#FFC24A",
  Hermes: "#FFA800",
  Hephaestus: "#FF8A1A",
  Hestia: "#FF5230",
  Ares: "#F00000",
  Aphrodite: "#FF32F0",
  Dionysus: "#C800FF",
  Athena: "#6040FF",
  Hera: "#2080FF",
  Poseidon: "#00C8FF",
  Demeter: "#ADD1FF",
  Artemis: "#6EFF00",
  Selene: "#7E90C4",
});

/**
 * For every god with no entry — Hades, Chaos, NPCs, whatever a patch adds — and
 * for a node belonging to no god. Neutral on purpose: an invented colour reads
 * as identity, and two gods sharing one reads as a relationship.
 */
const UNASSIGNED = "#C9BFB2";

/**
 * A custom property rather than a class, since a class per god means a rule per
 * god and a build that knows the roster. Custom properties go through the object
 * model, which the page's content policy does not govern: it forbids a style
 * *element*, and this is not one.
 */
export function godColour(god: GodId | null): string {
  if (god === null) return UNASSIGNED;
  return GOD_COLOURS[god] ?? UNASSIGNED;
}

/** Every god the palette assigns a colour to. Exported for the swatch tests. */
export function colouredGods(): readonly GodId[] {
  return Object.keys(GOD_COLOURS);
}
