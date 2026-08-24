import type { WeaponId } from "@repo/core";
import { type GameKey, dataFor } from "./data.js";
import type { WeaponRecord } from "./schema.js";

/**
 * The six weapons of a game, in the order the game itself presents them.
 *
 * Built once per game and handed back by identity, like the god sets and the
 * merged records beside them: a snapshot fixes this table, and a caller asking
 * for it is a surface rendering a tab bar on every keystroke.
 *
 * No overlay layer. Both games declare the set and its membership outright, so
 * there is nothing here for a hand-maintained correction to say — unlike
 * `traitsFor`, which exists because two Hades I records name the wrong god.
 */
function build(game: GameKey): readonly WeaponRecord[] {
  const table = dataFor(game).weapons as Record<WeaponId, WeaponRecord>;
  const records = Object.values(table)
    .map((record) => Object.freeze({ ...record, aspects: Object.freeze([...record.aspects]) }))
    .sort((a, b) => a.order - b.order);
  return Object.freeze(records);
}

const WEAPONS: Readonly<Record<GameKey, readonly WeaponRecord[]>> = Object.freeze({
  hades1: build("hades1"),
  hades2: build("hades2"),
});

/** Every weapon of a game, for the bar that draws one tab each. */
export function weaponsFor(game: GameKey): readonly WeaponRecord[] {
  return WEAPONS[game];
}

/**
 * One weapon, or undefined for a name that is not one.
 *
 * Undefined rather than a throw because the caller is usually a route or a
 * stored selection, and a weapon that has gone away between snapshots is a
 * stale bookmark rather than a defect.
 */
export function weaponFor(game: GameKey, weapon: WeaponId): WeaponRecord | undefined {
  return WEAPONS[game].find((record) => record.id === weapon);
}

/**
 * Whether a name is a weapon of this game, which is what a write-side guard
 * asks. `equipped.weapon` had no table to check against and so had no guard.
 */
export function isWeapon(game: GameKey, weapon: string): boolean {
  return WEAPONS[game].some((record) => record.id === weapon);
}
