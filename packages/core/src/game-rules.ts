import type { Element, GodId, TraitId } from "./ids.js";
import type { RunFacts } from "./run-state.js";
import type { Reason } from "./status.js";

/**
 * The only game-aware seam.
 *
 * This holds **fact-dependent logic only**. Pure catalog reads (e.g. set membership,
 * a god's boons, whether a trait is a core boon, a trait's prerequisite) have
 * no dependence on run facts and live in the catalog package instead, which
 * keeps the static/dynamic seam clean and this package's dependencies at zero.
 * Layout and coordinate data also never appear here bc they're UI concerns.
 *
 * The Hades I implementation is mostly degenerate/redundant (e.g. no elements,
 * `maxAttainableElement` is always 0, etc).
 *
 * God pool mechanics are shared between the games (and confirmed identical by the actual data extractions).
 */
export interface GameRules {
  /**
   * The run's natural cap on randomly-selected gods: four for both games.
   * This is a soft cap (not a hard ceiling) since keepsakes can "force"
   * additional gods into the god pool.
   */
  poolCapacity(f: RunFacts): number;

  /**
   * Whether a god `g` can still enter the pool this run. This is true whenever
   * it's still possible to "force" a god into the pool by equipping their keepsake,
   * which is calculated based on how far the run has progressed so far.
   *
   * When run progress is unknown, an implementation is never actually asked this.
   * A wrongly displayed "unreachable" is like most damaging answer this engine
   * can give, which is too important to depend on each implementation always
   * remembering the same guard(s). To help prevent this from happening,
   * evaluation checks run progress first & if it's unknown, reports "not yet"
   * w/o consulting the rules at all. This allows the conservative answer of
   * "not yet" to be guaranteed/the default instead of being left to ermmmm
   * well whichever silly lil guy wrote the implementation ig (0_0).
   */
  canGodEnterPool(g: GodId, f: RunFacts): boolean;

  /** Non-boon element contributions for Hades II (e.g. Gathering Tools II). Empty for hades1. */
  elementSources(f: RunFacts): Map<Element, number>;

  /** The ceiling that separates "not reached yet" from "this run literally can't reach it". */
  maxAttainableElement(el: Element, f: RunFacts): number;

  /**
   * Feasibility for one trait: bans, weapon aspect conflicts, slot &
   * mutual-exclusion conflicts, and one-directional blocks. `null` means "not
   * structurally impossible", which isn't the same as "obtainable right now".
   */
  isBlocked(t: TraitId, f: RunFacts): Reason | null;
}
