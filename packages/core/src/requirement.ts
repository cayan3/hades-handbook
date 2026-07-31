import type { AspectId, Element, GodId, KeepsakeId, SetId, TraitId } from "./ids.js";

/**
 * A predicate over run facts.
 *
 * The naive `AllOf | OneOf | HasTrait` doesn't work (i.e. some boons'
 * requirements are more complicated than just "which boons do I have :O"), so
 * the atoms cover the element, pool, keepsake, and aspect dimensions directly.
 * Requirements are created from extracted game data, not transcribed by hand.
 *
 * There's deliberately no `not` since game data does contain some negations, but
 * none of them actually needs a `not`. (That was the tldr; this next part is
 * just details for hashtag nerds lol (:heart_hands: :heart_hands:).) Game
 * extraction findings were sorted four ways:
 *  1) symmetric trait-vs-trait (i.e. both traits name each other which is just
 *     yk mutual exclusion, covered in this project by "Exclusive Group");
 *  2) one-way trait-vs-trait, where the blocker can never actually be unblocked
 *     (e.g. weapon aspect);
 *  3) one-way trait-vs-trait, where the blocker can actually leave/be unblocked
 *     (e.g. a benefit given by a keepsake since keepsakes can yk be swapped
 *     between regions)
 *  4) against room/reward state (e.g. "don't offer this boon in a room that
 *     already rewarded something, silly goose").
 *
 * (1) and (2) are abt feasibility, which is handled separately/outside this
 * type. (3) and (4) describe when the game can *roll* a boon (like a cute lil
 * offer-time gate), not whether a build can "reach" it, so we ermm do not
 * really care (sorry mr. gate :persevere: :persevere:) & thus just kinda yk
 * discard them during extraction. (In particular, (3) is discarded bc
 * permanence is the whole reason (2) is allowed to just say "impossible",
 * since w/o that concept we'd be telling someone their run is cooked just bc
 * they're erm wearing the wrong keepsake right now o_0.)
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
   * (ermmmm might be a skill issue but) I just couldn't find them in the game code
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
