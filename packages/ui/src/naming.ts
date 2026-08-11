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
 * Names come back through the catalog's resolvers, so withdrawing the shipped
 * text is one edit there rather than a sweep through everything that draws a
 * name.
 *
 * Traits and keepsakes need separate resolvers: in Hades II every keepsake is
 * also a trait record under the same id, so one function searching both spaces
 * works there and finds nothing in Hades I, where they share none.
 *
 * A weapon form is an ordinary trait record in both games, so an aspect goes
 * through the trait resolver — `ShieldLoadAmmoTrait` is Aspect of Beowulf,
 * `AxeRecoveryAspect` is Aspect of Melinoë. Gods are already the word a player
 * uses. Talents are the one id with nothing behind it: the extractor emits no
 * talent records.
 */
export function catalogNaming(game: GameKey): Naming {
  return {
    trait: (id) => nameFor(game, id),
    god: (id) => id,
    keepsake: (id) => keepsakeNameFor(game, id),
    talent: (id) => id,
    aspect: (id) => nameFor(game, id),
  };
}
