import type { BoonState, Requirement, RunFacts, TraitId } from "@repo/core";
import type { NodeSource } from "./node-view.js";

/**
 * Which boon to take next, over every goal the player has pinned at once.
 *
 * Above `core` and consuming nothing from it but the derivation already done:
 * this is a preference over answers the engine gave, not a second opinion about
 * them. `core` stays the place that decides what a run still needs.
 *
 * The question is a set cover — one boon can be a step toward several goals, and
 * the one worth taking is the one covering the most of them. Greedy and one pick
 * deep, which is the whole of what the strip claims: it names a boon, not a
 * route, so there is no second round to be greedy about.
 */

export interface BestPick {
  readonly trait: TraitId;
  /** The goals this boon is a prerequisite of. Never empty. */
  readonly goals: readonly TraitId[];
}

/**
 * The boon advancing the most pinned goals, or null where no boon advances more
 * than one and there is nothing to prefer.
 *
 * **Boons the run could actually take next**, not every boon any goal names: a
 * prerequisite three rungs down is a true answer to "what does this need" and a
 * useless answer to "what now". So a candidate has to be un-held and have its
 * own gate satisfied, which is exactly the state the ladder calls Available.
 *
 * Ties break on the trait id. Any rule here is arbitrary — the strip names one
 * boon and two boons covering the same goals are the same advice — but an
 * arbitrary rule that is *stable* keeps the strip from flickering between them
 * as anything else on the page re-renders.
 */
export function bestNextPick(
  source: NodeSource,
  goals: readonly TraitId[],
  facts: RunFacts,
  stateOf: (trait: TraitId) => BoonState,
): BestPick | null {
  const covers = new Map<TraitId, TraitId[]>();
  for (const goal of goals) {
    const prereq = source.records[goal]?.prereq;
    if (prereq == null) continue;
    // Deduplicated per goal: a gate can name the same boon in two branches, and
    // 6 shipped ones do — counted twice, one goal outvotes two.
    for (const trait of new Set(traitsNamed(prereq))) {
      if (facts.held.has(trait) || stateOf(trait) !== "Available") continue;
      covers.set(trait, [...(covers.get(trait) ?? []), goal]);
    }
  }

  let best: BestPick | null = null;
  for (const [trait, wanted] of [...covers].sort(([a], [b]) => a.localeCompare(b))) {
    if (best === null || wanted.length > best.goals.length) best = { trait, goals: wanted };
  }
  // One goal's own prerequisite is what the goal card already says. The strip is
  // for the boon two goals share, so it stays silent until there is one.
  return best !== null && best.goals.length > 1 ? best : null;
}

/**
 * Every boon a gate names, at any depth and through both composites.
 *
 * `hasTrait` only. A `hasBoonFrom` names a god rather than a boon, so there is
 * no single thing to recommend, and a `hasElement` names no boon at all — both
 * are still what the goal card says in words.
 */
function traitsNamed(req: Requirement): readonly TraitId[] {
  switch (req.kind) {
    case "hasTrait":
      return [req.trait];
    case "all":
    case "anyOf":
      return req.of.flatMap(traitsNamed);
    case "hasBoonFrom":
    case "hasElement":
    case "godInPool":
    case "hasKeepsake":
    case "hasAspect":
    case "hasTalent":
      return [];
  }
}
