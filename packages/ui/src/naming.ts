import { type GameKey, keepsakeNameFor, nameFor } from "@repo/catalog";
import type { AspectId, GodId, KeepsakeId, TalentId, TraitId } from "@repo/core";

/**
 * Turning an id into something a player recognises. Ids are the game's internal
 * strings, which is what makes them safe to reason about and useless to read: a
 * sentence saying a boon needs `PoseidonWeaponBoon` has said nothing.
 *
 * An interface so the sentences below can be tested against five made-up names
 * rather than six hundred shipped records.
 */
export interface Naming {
  trait(id: TraitId): string;
  god(id: GodId): string;
  keepsake(id: KeepsakeId): string;
  talent(id: TalentId): string;
  aspect(id: AspectId): string;
}

/**
 * Names come back through the catalog's resolvers, like artwork and description
 * text, so withdrawing them is one edit there rather than a sweep through
 * everything that renders one. Nothing here reads a name off a record.
 *
 * Traits and keepsakes use different resolvers: in Hades II every keepsake is
 * also a trait record under the same id, so one function searching both spaces
 * would look right there and find nothing in Hades I, where they share none.
 *
 * Gods are already the word a player uses. Talents and aspects resolve to their
 * ids because the data has no name to give — the extractor emits no Mirror rows,
 * and an aspect is a trait record in one game and not the other.
 */
export function catalogNaming(game: GameKey): Naming {
  return {
    trait: (id) => nameFor(game, id),
    god: (id) => id,
    keepsake: (id) => keepsakeNameFor(game, id),
    talent: (id) => id,
    aspect: (id) => id,
  };
}
