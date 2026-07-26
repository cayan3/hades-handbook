import type { AspectId, Element, GodId, GroupId, TraitId } from "./ids.js";
import type { Requirement } from "./requirement.js";

/**
 * The answer this package literally exists to give (lol!).
 *
 * Evaluation returns a residual, not a boolean ("residual" being the part of
 * the requirement the player is currently missing i.e. still needs). This also
 * means that per-goal progress tracking, "an any-of collapses once one branch
 * is taken", & "impossible tonight" all fall out of that for free (yippee!).
 *
 * `pending` & `unsatisfiable` are separate branches on purpose. "Not yet met"
 * (i.e. pending) & "structurally impossible this run" (i.e. "unsatisfiable")
 * are independent reasons for why a requirement is unmet; collapsing them into
 * one term would lose the ability to give this v valuable verdict.
 */
export type Status =
  | { kind: "satisfied" }
  | { kind: "pending"; residual: Requirement }
  | { kind: "unsatisfiable"; reason: Reason };

/**
 * Why something is impossible this run. This layer just *describes*, i.e. never
 * actually forbids a user action. E.g. users are always allowed to reassign a slot;
 * the engine just reports the consequences of those actions.
 */
export type Reason =
  | { kind: "godPoolFull"; god: GodId }
  | { kind: "godExcluded"; god: GodId }
  | { kind: "banned"; trait: TraitId }
  /**
   * `trait` is absent when the mismatch comes from a requirement instead of
   * from a trait's own feasibility (e.g. a requirement naming the weapon
   * aspects it accepts knows if the equipped aspect is wrong, but not which
   * specific boon it's "wrong for"/incompatible w/).
   */
  | { kind: "aspectConflict"; aspect: AspectId; trait?: TraitId }
  /** Slot occupied by an incompatible trait, or a mutually exclusive one that's being held. */
  | { kind: "slotConflict"; trait: TraitId; conflictsWith: TraitId; group?: GroupId }
  /**
   * This is a one-directional block, where holding `blockedBy` makes `trait`
   * unobtainable for the rest of the run. Unlike `slotConflict`, this is
   * asymmetric, so taking the two in the opposite order leaves both held.
   * Also, the block is computed against current facts, so is released if the
   * blocking trait/boon is purged.
   */
  | { kind: "blockedByTrait"; trait: TraitId; blockedBy: TraitId }
  | { kind: "elementCeiling"; element: Element; needed: number; max: number }
  | {
      kind: "composite";
      reasons: Reason[];
      /**
       * How many more children a group still needs, & how many of its
       * alternatives are merely pending instead of impossible. w/o these,
       * the UI just displays "impossible" for a group that's just one pick
       * short. This is absent for composites w/ no shortfall (e.g. an `all`
       * whose children failed for unrelated reasons).
       */
      needed?: number;
      pendingAlternatives?: number;
    };
