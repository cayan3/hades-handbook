import type { CatalogLookups, GodId, SetId, TraitId } from "@repo/core";
import { type GameKey, dataFor } from "./data.js";
import type { SetRecord, TraitRecord } from "./schema.js";

const EMPTY: readonly TraitId[] = Object.freeze([]);

/**
 * The member lists that the engine can't answer set-shaped requirements without.
 *
 * Both maps are built once (and are built here) and never rebuilt, which is
 * what separates these lookups from the game-rules seam in the first place.
 * Since members lists are always fixed for a data snapshot while the "verdicts"
 * of individual rules are dependent on the current run, the lifetimes they
 * cache for are different and mixing them would make the longer one match the
 * shorter one oops.
 *
 * All lists are frozen; also, the *same object* comes back for a given key. A
 * fresh array for every call would look harmless and would allocate once per
 * set-shaped requirement per evaluation, and the whole view would re-evaluate
 * upon every change to the run (:sobbing: :sobbing:).
 *
 * Nothing here reads anything about run state. If lookups changed based on the
 * run itself, they would instead be covered by the game-rules seam.
 */
export function createLookups(game: GameKey): CatalogLookups {
  const data = dataFor(game);

  const byGod = new Map<GodId, readonly TraitId[]>();
  const traits = Object.values(data.boons as Record<string, TraitRecord>);
  for (const trait of traits) {
    /**
     * A Duo is filed under both of its gods, which is what the game's own loot
     * tables do :sunglasses: :sunglasses: (technically, 35 of the 37 appear in
     * exactly two gods' trait lists; the exception is Zeus/Hera in Hades II
     * which yk makes sense lol).
     *
     * The game is a bit intuitively inconsistent with how that's read vs
     * written: the function it uses to name a held trait's god goes through the
     * loot tables and returns on the first match (so a Duo held in a run
     * contributes to only one of its two gods, and which one depends on like yk
     * table iteration order o_0). That is ermmm both not reproducible and also
     * just uh not worth reproducing at all for this project. A Duo belonging to
     * both gods is what the data says, and also what we as players expect hehe.
     *
     * (Plus the disagreement is pretty much always moot bc a Duo's own prereqs
     * require a boon from each of its two gods, so a player holding the Duo
     * would already satisfy both memberships through other traits.)
     */
    const gods = trait.god !== null ? [trait.god] : (trait.duoGods ?? []);
    for (const god of gods) {
      const existing = byGod.get(god);
      if (existing === undefined) byGod.set(god, [trait.id]);
      else (existing as TraitId[]).push(trait.id);
    }
  }
  for (const [god, members] of byGod) {
    byGod.set(god, Object.freeze([...members].sort()));
  }

  const bySet = new Map<SetId, readonly TraitId[]>();
  for (const [id, record] of Object.entries(data.namedSets as Record<string, SetRecord>)) {
    bySet.set(id, Object.freeze([...record.members].sort()));
  }

  return {
    /**
     * Named sets exist in Hades II's data and are absent from Hades I's, which
     * synthesizes nothing today -- so this answers honestly for one game and
     * empty for the other. It reads what is actually there rather than
     * pretending to a completeness the extraction does not have.
     */
    setMembers(s: SetId): readonly TraitId[] {
      return bySet.get(s) ?? EMPTY;
    },

    /**
     * Every trait the god grants (not the ones a run just happens to hold).
     * Duos are included under both corresponding gods.
     */
    boonsOfGod(g: GodId): readonly TraitId[] {
      return byGod.get(g) ?? EMPTY;
    },
  };
}
