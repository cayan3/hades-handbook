import type { AspectId, Element, GodId, KeepsakeId, SetId, TraitId } from "./ids.js";

/**
 * A predicate over run facts.
 *
 * The naive `AllOf | OneOf | HasTrait` doesn't work (i.e. some boons'
 * requirements are more complicated than just "which boons do I have :O"), so
 * the atoms cover the element, pool, keepsake, and aspect dimensions directly.
 * Requirements are created from extracted game data, not transcribed by hand.
 *
 * There's deliberately no `not`. The game data does contain some negations, but
 * none of them actually needs a `not`. (That was the tldr; this next part is
 * just details for hashtag nerds lol (:heart_hands: :heart_hands:).) Extraction findings were sorted three
 * ways: 1) symmetric trait-vs-trait (i.e. both traits name each other which is
 * just yk mutual exclusion, covered in his project by "Exclusive Group");
 * 2) one-way trait-vs-trait (i.e. just ermm a permanent block lol, covered in this
 * project by "Blocked By"); 3) against room/reward state (e.g. "don't offer
 * this boon in a room that already rewarded X, silly goose"). The first two are
 * abt feasibility, which is handled separately/outside this type. The last one
 * describes when the game may *roll* a boon (like a cute lil offer-time gate),
 * not whether a build can reach it, so we do not really care (sorry mr. gate
 * :persevere: :persevere:) & thus just kinda yk discard it during extraction.
 */
export type Requirement =
  /**
   * Kept for semantic readability (it's a subset of `anyOf` lol; code treats
   * them differently (e.g. `all` unsatisfiable gives composite{reasons} w/ no
   * needed/pendingAlternatives & `anyOf` unsatisfiable gives
   * composite{reasons, needed, pendingAlternatives}; the "verdict" is the same
   * for both but the `reason` payload id different)).
   * */
  | { kind: "all"; of: Requirement[] }
  | { kind: "anyOf"; min: number; of: Requirement[] }
  | { kind: "hasTrait"; trait: TraitId; minLevel?: number }
  /**
   * Named sets come from the catalog. For Hades II, these are "real" sets from
   * the code (e.g. `LinkedTraitData.<God>CoreTraits` (core boons!) & narrower
   * subsets like `HestiaBurnTraits`)). For Hades I, these are synthesized bc
   * ermmmm might be a skill issue but I just couldn't find them in the game code
   * :pensive: :pensive: (game code seems to repeat the same boon-id list inline
   * at every requirement? which means there's no uh actual "name" to bind to o_0).
   */
  | { kind: "hasSet"; set: SetId; count: number }
  | { kind: "hasBoonFrom"; god: GodId; count: number }
  /** Element thresholds (e.g. for Infusions in Hades II). */
  | { kind: "hasElement"; element: Element; count: number }
  | { kind: "godInPool"; god: GodId }
  | { kind: "hasKeepsake"; keepsake: KeepsakeId }
  | { kind: "hasAspect"; aspects: AspectId[] };
