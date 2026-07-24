import type { AspectId, Element, GodId, GroupId, TraitId } from "./ids.js";
import type { Requirement } from "./requirement.js";

/**
 * The answer this package exists to give.
 *
 * Evaluation returns a **residual**, not a boolean: the part of the requirement
 * still outstanding. Per-goal progress tracking, "an any-of collapses once one
 * branch is taken", and "impossible tonight" all fall out of that for free.
 *
 * `pending` and `unsatisfiable` are separate branches on purpose. "Not yet met"
 * and "structurally impossible this run" are independent reasons a requirement
 * is unmet, and collapsing them would lose the most valuable verdict the tool
 * can give.
 */
export type Status =
  | { kind: "satisfied" }
  | { kind: "pending"; residual: Requirement }
  | { kind: "unsatisfiable"; reason: Reason };

/**
 * Why something is impossible this run. This layer describes; it never forbids a
 * user action — reassigning a slot is always allowed, and the engine simply
 * reports the consequence.
 */
export type Reason =
  | { kind: "godPoolFull"; god: GodId }
  | { kind: "godExcluded"; god: GodId }
  | { kind: "banned"; trait: TraitId }
  | { kind: "aspectConflict"; aspect: AspectId; trait: TraitId }
  /** Slot occupied by an incompatible trait, or a mutually exclusive one held. */
  | { kind: "slotConflict"; trait: TraitId; conflictsWith: TraitId; group?: GroupId }
  /**
   * A one-directional block: holding `blockedBy` makes `trait` unobtainable for
   * the rest of the run. Unlike `slotConflict` this is asymmetric, so taking
   * them in the other order leaves both held. Computed against current facts, so
   * the block releases if the blocking trait is purged.
   */
  | { kind: "blockedByTrait"; trait: TraitId; blockedBy: TraitId }
  | { kind: "elementCeiling"; element: Element; needed: number; max: number }
  | {
      kind: "composite";
      reasons: Reason[];
      /**
       * How many more children a group still needed, and how many of its
       * alternatives were merely pending rather than impossible. Without these
       * the UI renders a bare "impossible" for a group that was one pick short.
       * Absent for composites with no shortfall — an `all` whose children failed
       * for unrelated reasons.
       */
      needed?: number;
      pendingAlternatives?: number;
    };
