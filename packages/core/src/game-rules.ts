import type { Element, GodId, TraitId } from "./ids.js";
import type { RunFacts } from "./run-state.js";
import type { Reason } from "./status.js";

/**
 * The only game-aware seam.
 *
 * It holds **fact-dependent logic only**. Pure catalog reads — set membership,
 * a god's boons, whether a trait is a core boon, a trait's prerequisite — have
 * no dependence on run facts and live in the catalog package instead, which
 * keeps the static/dynamic seam clean and this package's dependencies at zero.
 * Layout and coordinate data are UI concerns and never appear here.
 *
 * The Hades I implementation is largely degenerate: no elements, and
 * `maxAttainableElement` is always 0. Pool mechanics are shared between the
 * games and confirmed identical.
 */
export interface GameRules {
  /**
   * The run's **actual** cap on randomly-selected gods, not a constant: Hades I
   * hardcodes four, Hades II reads a per-run value that some Bounties lower to
   * 1–3. This is not a ceiling on gods held — keepsakes force gods in past it.
   */
  poolCapacity(f: RunFacts): number;

  /**
   * Whether `g` can still enter the pool this run: true whenever a keepsake path
   * plausibly remains, judged from how far the run has progressed. When progress
   * is unknown, return true, so evaluation reports "not yet" rather than
   * "impossible" — the conservative direction, since a wrong "unreachable" is
   * the most damaging answer this engine can give.
   */
  canGodEnterPool(g: GodId, f: RunFacts): boolean;

  /** Non-boon element contributions (tools, Arcana, …). Empty for hades1. */
  elementSources(f: RunFacts): Map<Element, number>;

  /** The ceiling that separates "not yet" from "this run cannot reach it". */
  maxAttainableElement(el: Element, f: RunFacts): number;

  /**
   * Feasibility for one trait: bans, aspect conflicts, slot and mutual-exclusion
   * conflicts, and one-directional blocks. `null` means "not structurally
   * impossible", which is not the same as "obtainable right now".
   */
  isBlocked(t: TraitId, f: RunFacts): Reason | null;
}
