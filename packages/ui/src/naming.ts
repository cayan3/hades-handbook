import { type GameKey, type TraitRecord, keepsakesFor, traitsFor } from "@repo/catalog";
import type { AspectId, GodId, KeepsakeId, TalentId, TraitId } from "@repo/core";

/**
 * Turning an id into something a player recognises.
 *
 * Every id this product reasons about is the game's own internal string, which
 * is exactly what makes them safe to reason about and useless to read. A
 * sentence saying a boon needs `PoseidonWeaponBoon` has told a player nothing.
 *
 * Declared as an interface so the text that consumes it can be tested against
 * five made-up names instead of against six hundred shipped records, and
 * implemented once below over the real catalog. The interface is also where a
 * withdrawal path would attach if display names ever need one — see the note on
 * the implementation.
 */
export interface Naming {
  trait(id: TraitId): string;
  god(id: GodId): string;
  keepsake(id: KeepsakeId): string;
  talent(id: TalentId): string;
  aspect(id: AspectId): string;
}

/**
 * Falling back to the id, everywhere, on purpose.
 *
 * Roughly a fifth of the records in each game ship with no name at all — debug
 * entries, cut content, inheritance templates — and the ids are stable, plainly
 * not prose, and safe to put on screen. A blank label is the worse answer: it
 * gives a player nothing to search for and nothing to tell us about.
 */
function orId(name: string | null | undefined, id: string): string {
  return name == null || name === "" ? id : name;
}

/**
 * The catalog-backed naming.
 *
 * **Display names have no withdrawal path and icons and Codex descriptions do.**
 * Art goes through the icon resolver and description text through the text
 * resolver, each of which can be swapped or emptied in one edit if the shipped
 * content ever has to come down. A display name is redistributed game text on
 * the same footing, and it is read straight off the record — here, which is the
 * one place in this package that does it, so adopting a resolver later is a
 * change to this file and nothing else. Whether names want one is a decision
 * nobody has taken, and taking it quietly by building a third resolver seemed
 * worse than leaving the asymmetry where it can be seen.
 *
 * Keepsakes are looked up in the keepsake space rather than among traits. In
 * Hades II every keepsake is *also* a trait record under the same id, so a
 * lookup that searched traits first would work in that game and silently fail
 * in Hades I, where the two spaces share nothing.
 *
 * Talents and aspects resolve to their ids. Neither has a name in the catalog:
 * the extractor emits no Mirror rows at all, and an aspect is a trait record in
 * the first game and not in the second, so a lookup that worked in one would be
 * a lie in the other. An id is the honest answer until the data carries a name.
 *
 * The records are a parameter and default to the shipped ones, for the reason
 * everything else that reads them takes them that way: naming that went to the
 * shipped catalog while the derivation beside it read a supplied one would put
 * a raw id under a boon that has a perfectly good name — which is precisely
 * what it did, until the gallery showed it.
 */
export function catalogNaming(
  game: GameKey,
  records: Readonly<Record<TraitId, TraitRecord>> = traitsFor(game),
): Naming {
  const traits = records;
  const keepsakes = keepsakesFor(game);

  return {
    trait: (id) => orId(traits[id]?.name, id),
    // A god is addressed by the bare name that keys the god table, which is
    // already the word a player uses.
    god: (id) => id,
    keepsake: (id) => orId(keepsakes[id]?.name, id),
    talent: (id) => id,
    aspect: (id) => id,
  };
}
