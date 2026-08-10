import type { GodId } from "@repo/core";

/**
 * One colour per god. Hue means god identity and never state, so that state
 * survives a colourblind reader and a greyscale screenshot.
 *
 * These do almost nothing on the default ladder: real boon art already carries
 * its god's colour, and every node on one god's page is that god anyway. They
 * earn their keep on cross-god chrome (god tabs, duo edges, requirement rows)
 * and on the fallback ladder, where colour is the only identity channel left.
 *
 * Values are each god's own loot colour, hue-spread where two collided. Demeter
 * is retuned to pale ice blue for the frost theme, which also separates her from
 * Poseidon in the first game; Selene is designed, her extracted value being a
 * placeholder shared with Chaos. A god in both games keeps the same hex in both.
 *
 * Hades grants boons in the second game and has no colour: no loot data entry to
 * take one from, and his scope is still unclear, so a hue would be invented.
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
  Selene: "#A46BFF",
});

/**
 * For every god with no entry — Hades, Chaos, NPCs, whatever a patch adds — and
 * for nodes belonging to no god, which is most Infusions. Neutral on purpose: an
 * invented colour would read as identity, and two gods sharing one would read as
 * a relationship.
 */
const UNASSIGNED = "#C9BFB2";

/**
 * Handed to a node as a custom property rather than as a class, since a class per
 * god means a stylesheet rule per god and a build that knows the roster. Custom
 * properties go through the object model, which the page's content policy does
 * not govern — it forbids a style *element*, and this is not one.
 */
export function godColour(god: GodId | null): string {
  if (god === null) return UNASSIGNED;
  return GOD_COLOURS[god] ?? UNASSIGNED;
}

/** Every god the palette assigns a colour to. Exported for the swatch tests. */
export function colouredGods(): readonly GodId[] {
  return Object.keys(GOD_COLOURS);
}
