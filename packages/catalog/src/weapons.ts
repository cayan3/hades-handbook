import type { WeaponId } from "@repo/core";
import { type GameKey, dataFor } from "./data.js";
import { perGame } from "./per-game.js";
import type { WeaponRecord } from "./schema.js";

/**
 * The six weapons of a game, in the order the game shows them.
 *
 * Built once and handed back by identity, like the god sets beside it: the
 * table cannot change while a snapshot is loaded, and the caller is a tab bar
 * that re-renders constantly. No overlay layer, since both games state the set
 * outright and there is nothing to correct.
 */
function build(game: GameKey): readonly WeaponRecord[] {
  const table = dataFor(game).weapons as Record<WeaponId, WeaponRecord>;
  const records = Object.values(table)
    .map((record) => Object.freeze({ ...record, aspects: Object.freeze([...record.aspects]) }))
    .sort((a, b) => a.order - b.order);
  return Object.freeze(records);
}

const weapons = perGame(build);

/** Every weapon of a game, for the bar that draws one tab each. */
export function weaponsFor(game: GameKey): readonly WeaponRecord[] {
  return weapons(game);
}

/**
 * One weapon, or undefined for a name that is not one. Undefined rather than a
 * throw: the caller is a route or a stored selection, and a weapon that went
 * away between snapshots is a stale bookmark rather than a defect.
 */
export function weaponFor(game: GameKey, weapon: WeaponId): WeaponRecord | undefined {
  return weapons(game).find((record) => record.id === weapon);
}

/**
 * Whether a name is a weapon of this game, which is what a write-side guard
 * asks. `equipped.weapon` had no table to check against and so had no guard.
 */
export function isWeapon(game: GameKey, weapon: string): boolean {
  return weapons(game).some((record) => record.id === weapon);
}
