import type { CatalogLookups } from "./catalog-lookups.js";
import { evaluate } from "./evaluate.js";
import type { GameRules } from "./game-rules.js";
import type { TraitId } from "./ids.js";
import type { Requirement } from "./requirement.js";
import type { RunFacts } from "./run-state.js";

/**
 * The five buckets a boon can render as. These are always derived, not stored:
 * to be clear, the model still has only three answers to "can this boon be obtained this run",
 * these are an additional view over those three answers.
 */
export type BoonState = "Obtained" | "Available" | "Pending" | "Locked" | "Impossible";

/**
 * Which of the five states a boon is currently in.
 *
 * The split that the model's three-way status can't make on its own is Pending
 * vs Locked: both are "not yet" w/ the difference being whether or not the
 * player has made a start on the boon prerequisite(s). So an unmet prerequisite
 * is asked the additional question of "is any of its leaves satisfied?"
 *
 * The prerequisite is passed in instead of looked up. It's catalog data & this
 * package doesn't import any catalog (the caller rendering a boon literally has
 * it to hand anyway). The lookups seam is still needed bc a prerequisite may
 * contain set-shaped atoms.
 *
 * "Held" takes priority over everything else, including impossible: a boon
 * obtained before a blocker appeared is still obtained & the UI should say so.
 */
export function boonState(
  trait: TraitId,
  prereq: Requirement,
  facts: RunFacts,
  rules: GameRules,
  lookups: CatalogLookups,
): BoonState {
  if (facts.held.has(trait)) return "Obtained";

  const status = evaluate(prereq, facts, rules, lookups);
  switch (status.kind) {
    case "unsatisfiable":
      return "Impossible";
    case "satisfied":
      return "Available";
    case "pending":
      return anyLeafStarted(prereq, facts, rules, lookups) ? "Pending" : "Locked";
  }
}

/**
 * Whether the player has made a start on any leaf of a requirement (the entire
 * point of the Pending vs Locked distinction).
 *
 * This cares abt **started, not satisfied**. `hasElement` is the one leaf left
 * carrying a count, & a count can ofc be partially met: having one Water out of
 * the three an Infusion needs is clearly a start even if the leaf isn't
 * actually satisfied. Testing for satisfaction would show the same "nothing
 * done yet" indicator for both a player who's halfway to a boon and a player
 * who hasn't even started. The remaining leaves are all-or-nothing, and for
 * those started & satisfied are the same question.
 *
 * A trait held below the level asked for counts as started for the same reason.
 *
 * This is asked of the original requirement instead of the residual (the
 * residual has already dropped exactly the parts that are already met, so it
 * can no longer say whether there were any to begin w/ :shrug: :shrug:).
 */
export function anyLeafStarted(
  req: Requirement,
  facts: RunFacts,
  rules: GameRules,
  lookups: CatalogLookups,
): boolean {
  switch (req.kind) {
    case "all":
    case "anyOf":
      return req.of.some((child) => anyLeafStarted(child, facts, rules, lookups));
    case "hasTrait":
      return facts.held.has(req.trait);
    case "hasBoonFrom":
      // All-or-nothing since it lost its count: holding any of the god's boons
      // is exactly what satisfies it. Answered directly instead of through
      // `evaluate` bc evaluation asks the feasibility layer abt every un-held
      // boon of the god, & this runs per boon per render.
      return lookups.boonsOfGod(req.god).some((member) => facts.held.has(member));
    case "hasElement":
      return (facts.elements.get(req.element) ?? 0) > 0;
    case "godInPool":
    case "hasKeepsake":
    case "hasAspect":
    case "hasTalent":
      return evaluate(req, facts, rules, lookups).kind === "satisfied";
  }
}
