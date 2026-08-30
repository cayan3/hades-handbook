import type { Element } from "@repo/core";

/**
 * The order the game's own tray draws them in, so a row does not rearrange as a
 * run picks elements up — a `Map` hands them back in arrival order.
 *
 * Taken from a capture of that tray rather than from a declared list: the game
 * builds the row by iterating a hash table, so its data has no order to read.
 * Shared by the Loadout's row and the Run Overview's.
 */
export const ELEMENTS: readonly Element[] = ["Earth", "Water", "Air", "Fire", "Aether"];
