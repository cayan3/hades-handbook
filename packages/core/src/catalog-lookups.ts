import type { GodId, SetId, TraitId } from "./ids.js";

/**
 * The catalog seam: member lists. (yep, nothing else!)
 *
 * Two of the requirement atoms are set-shaped (e.g. "hold 2 of Zeus's core
 * boons", "hold a boon of Hera"), and neither can be answered w/o yk knowing
 * who the members are, which is static catalog data and thus must not be
 * imported by this package (i.e. `core`) at all. Therefore, this package
 * is what *declares* the port while `catalog` itself is what implements it
 * This is the same dependency inversion/structure that lets this package
 * declare the game-rules interface for the two game-specific packages to
 * implement separately, i.e. `GameRules` and `rules-hades*`. In both cases,
 * the dependency runs "inward".
 *
 * This is deliberately kept to two methods instead of four: `isCoreBoon`
 * doesn't have any callers in `core`, while `prereqOf` is already passed to
 * `boonState` as data (since a caller rendering a trait already knows that
 * trait's prerequisite(s)).
 *
 * Implementations must be pure and stable for a given data snapshot (i.e.
 * within a snapshot, implementations must be pure and return the same members
 * for the same id) bc evaluation is memoized upstream on this very assumption
 * (i.e. that the same set id yields the same members every time).
 */
export interface CatalogLookups {
  /**
   * Members of a named set. For Hades II, these are "real" set ids from
   * the code (e.g. `LinkedTraitData.<God>CoreTraits` (core boons!) & narrower
   * subsets like `HestiaBurnTraits`). For Hades I, these are synthesized bc
   * (ermmmm might be a skill issue but) I just couldn't find them in the game
   * code :pensive: :pensive: (game code seems to repeat the same boon-id list
   * inline at every requirement? which means there's no uh actual "name" to
   * bind to o_0).
   */
  setMembers(s: SetId): readonly TraitId[];

  /** Every boon a god grants. Not the same as the god's *held* boons. */
  boonsOfGod(g: GodId): readonly TraitId[];
}
