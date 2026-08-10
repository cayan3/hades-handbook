import type { TraitId } from "./ids.js";
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
 * so no element atoms at all).
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
   * Whether the run has used up the cap above, counting only the gods that
   * actually take a pool slot. A run's god pool holds every god it took a reward
   * from, and some of them (Hermes and Chaos in both games, plus Selene and the
   * cameos in Hades II) hand out boons without ever claiming a slot, so this is
   * not just a size against a number.
   *
   * The question is deliberately about the *pool* & not about a particular god.
   * The cap is soft & a keepsake can still force a god in past it, but nothing
   * supplies the run progress that would say whether an opportunity to do that
   * remains, so there's no honest per-god answer to give: once the cap is met
   * every absent god is in the same position. The softness is carried in the
   * copy attached to the verdict instead, which tells the player the keepsake
   * route is still open.
   */
  isGodPoolFull(f: RunFacts): boolean;

  /**
   * Feasibility for one trait: bans, weapon aspect conflicts, slot &
   * mutual-exclusion conflicts, and one-directional blocks. `null` means "not
   * structurally impossible", which isn't the same as "obtainable right now".
   */
  isBlocked(t: TraitId, f: RunFacts): Reason | null;
}
