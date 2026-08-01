import type { CatalogLookups, GodId, SetId, TraitId } from "@repo/core";
import { type GameKey, dataFor } from "./data.js";
import type { SetRecord, TraitRecord } from "./schema.js";

const EMPTY: readonly TraitId[] = Object.freeze([]);

/**
 * The member lists the engine cannot answer set-shaped requirements without.
 *
 * Both maps are built once, here, and never rebuilt. That is not an
 * optimisation added on top -- it is the property that separates these lookups
 * from the game-rules seam in the first place. Member lists are fixed for a
 * data snapshot while rules verdicts change every time the run does, so the two
 * cache for different lifetimes, and mixing them would drag the longer one down
 * to the shorter.
 *
 * Every list is frozen and the *same object* comes back for a given key. A
 * fresh array per call would look harmless and would allocate once per
 * set-shaped requirement per evaluation, with the whole view re-evaluating on
 * every change to the run.
 *
 * Nothing here reads run state. A lookup that varied with the run would belong
 * behind the other seam entirely.
 */
export function createLookups(game: GameKey): CatalogLookups {
  const data = dataFor(game);

  const byGod = new Map<GodId, readonly TraitId[]>();
  const traits = Object.values(data.boons as Record<string, TraitRecord>);
  for (const trait of traits) {
    if (trait.god === null) continue;
    const existing = byGod.get(trait.god);
    if (existing === undefined) byGod.set(trait.god, [trait.id]);
    else (existing as TraitId[]).push(trait.id);
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
     * Every trait the god grants, not the ones a run happens to hold. Duos are
     * absent by construction: they carry no single god, so asking for a god's
     * boons never returns one.
     */
    boonsOfGod(g: GodId): readonly TraitId[] {
      return byGod.get(g) ?? EMPTY;
    },
  };
}
