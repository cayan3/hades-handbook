import type { CatalogLookups } from "./catalog-lookups.js";
import type { GameRules } from "./game-rules.js";
import type { TraitId } from "./ids.js";
import type { Requirement } from "./requirement.js";
import type { RunFacts } from "./run-state.js";
import type { Reason, Status } from "./status.js";

/**
 * Given everything true about a run and a requirement, return what's still
 * needed, that it's already been met, or that it's impossible to meet this run.
 *
 * This is pure, total, and deterministic: every requirement shape is handled,
 * no branch throws any errors, and nothing outside `facts`, `rules`, &
 * `lookups` is read. The user's plans aren't an input, since what someone
 * "intends to pick" can't change what's legitimately satisfiable; that stays
 * true by construction bc this function is given facts and never the entire run state.
 *
 * Two conventions hold across every rule below:
 *
 * Convention 1: **Satisfaction is checked before feasibility, always.**
 * A trait a user already holds is read as satisfied even if the feasibility
 * layer would now refuse to hand it to them. This is what makes "once
 * satisfied, acquiring more keeps it satisfied" true, and it's also why
 * purging is the only thing that can take a requirement back to being unmet.
 *
 * Convention 2: **Feasibility for a trait comes only from `rules.isBlocked`.**
 * Bans, weapon aspect conflicts, slot & exclusive-group collisions, and
 * one-directional blocks all arrive through that one call, so this function
 * never directly inspects `facts.bans` itself. Element counts (for Hades II)
 * are read from `facts.elements` as the run's running total; the non-boon
 * element sources on the rules interface are what influence the ceiling
 * calculation, and adding them here would double-count.
 *
 * The status a requirement gets is a *residual*: the part still missing/needed,
 * expressed as another requirement. (E.g. "two more Water", not just "false").
 * Everything the UI displays (e.g. per-goal progress, an any-of collapsing
 * once a branch is taken, "impossible tonight" indicators) is a view over that.
 */
export function evaluate(
  req: Requirement,
  facts: RunFacts,
  rules: GameRules,
  lookups: CatalogLookups,
): Status {
  switch (req.kind) {
    case "hasTrait": {
      const held = facts.held.get(req.trait);
      if (held !== undefined && held.level >= (req.minLevel ?? 1)) return SATISFIED;
      const blocked = rules.isBlocked(req.trait, facts);
      return blocked === null ? pending(req) : unsatisfiable(blocked);
    }

    case "godInPool": {
      if (facts.godPool.has(req.god)) return SATISFIED;
      // The god pool cap is soft, i.e. even if the player already has four
      // distinct gods in their pool, equipping a fifth god's keepsake "forces"
      // that god into the god pool. Since keepsakes are swappable each region,
      // the number of remaining keepsake-equipping opportunities determines
      // whether or not a god is genuinely unreachable. If run progress isn't
      // tracked, the default is to treat a god as still reachable (bc it's more
      // damaging to mistakenly display a reachable god (even if they're only
      // reachable-via-keepsake) as unreachable; also, "this god is technically
      // reachable but you'll need to equip their keepsake to get them in your
      // god pool" is actually yk actionable whereas the dead end of
      // "unreachable." is.. much less so (not to mention maybe a bit ermmm idk
      // ouch-ful ig :pensive: :pensive:)).
      if (facts.progress === undefined) return pending(req);
      if (rules.canGodEnterPool(req.god, facts)) return pending(req);
      // This function always reports godPoolFull bc canGodEnterPool(g, f)
      // returns a boolean, so false means "god can't enter" but there are two
      // distinct possibilities for why that's the case: either the pool is full
      // (which is a run state), or the god is permanently excluded (which is a
      // catalog fact, e.g. GodKind being NPC/Ally). Since canGodEnterPool(g, f)
      // returns false in both cases (so can't tell the two apart), godPoolFull
      // supplies the additional info needed to distinguish between the two.
      // Also, godInPool never handles god exclusion from the pool. Instead,
      // exclusion reaches evaluation through `isBlocked` on a trait (e.g.
      // asking abt a trait of an excluded god can make rules.isBlocked return
      // {kind:"godExcluded"}). Any gods that can never enter the pool at all
      // (e.g. Hermes in both games) is a catalog fact, so there shouldn't be
      // any requirements naming them in the first place.
      return unsatisfiable({ kind: "godPoolFull", god: req.god });
    }

    case "hasKeepsake":
      // Never impossible: keepsakes are swapped freely between regions.
      return facts.equipped.keepsake === req.keepsake ? SATISFIED : pending(req);

    case "hasElement": {
      const have = facts.elements.get(req.element) ?? 0;
      if (have >= req.count) return SATISFIED;
      const max = rules.maxAttainableElement(req.element, facts);
      // Here, `needed` is yk the whole requirement instead of the shortfall, so it
      // can just be read against the ceiling directly.
      if (max < req.count) {
        return unsatisfiable({
          kind: "elementCeiling",
          element: req.element,
          needed: req.count,
          max,
        });
      }
      return pending({ kind: "hasElement", element: req.element, count: req.count - have });
    }

    case "hasSet": {
      const tally = tallyMembers(lookups.setMembers(req.set), facts, rules);
      return fromMembers(tally, req.count, (count) => ({ kind: "hasSet", set: req.set, count }));
    }

    case "hasBoonFrom": {
      const tally = tallyMembers(lookups.boonsOfGod(req.god), facts, rules);
      return fromMembers(tally, req.count, (count) => ({
        kind: "hasBoonFrom",
        god: req.god,
        count,
      }));
    }

    case "hasAspect": {
      const aspect = facts.equipped.aspect;
      if (aspect === undefined) return pending(req);
      if (req.aspects.includes(aspect)) return SATISFIED;
      // Since weapon aspect is chosen before the run starts & can't be swapped
      // mid-run, this is literally structurally impossible & should display as
      // such instead of likee always showing as "not yet" (rip).
      return unsatisfiable({ kind: "aspectConflict", aspect });
    }

    case "all": {
      const residuals: Requirement[] = [];
      const reasons: Reason[] = [];
      for (const child of req.of) {
        const status = evaluate(child, facts, rules, lookups);
        if (status.kind === "pending") residuals.push(status.residual);
        else if (status.kind === "unsatisfiable") reasons.push(status.reason);
      }
      // There's purposefully no shortfall context here bc an `all` whose
      // children failed for unrelated reasons has no "how many more" to report.
      // Those two fields exist for groups that were a pick short, which this
      // never is.
      if (reasons.length > 0) return unsatisfiable({ kind: "composite", reasons });
      if (residuals.length === 0) return SATISFIED;
      return pending({ kind: "all", of: residuals });
    }

    case "anyOf": {
      let satisfiedCount = 0;
      const residuals: Requirement[] = [];
      const reasons: Reason[] = [];
      for (const child of req.of) {
        const status = evaluate(child, facts, rules, lookups);
        if (status.kind === "satisfied") satisfiedCount += 1;
        else if (status.kind === "pending") residuals.push(status.residual);
        else reasons.push(status.reason);
      }
      if (satisfiedCount >= req.min) return SATISFIED;
      const needed = req.min - satisfiedCount;
      // A single bare list of reasons can't express "two were needed and one
      // alternative was merely pending", which is yk exactly the group the UI
      // must not display as just a flat impossible. Carrying both numbers is
      // what lets it correctly indicate "one (pick) short" instead.
      if (residuals.length < needed) {
        return unsatisfiable({
          kind: "composite",
          reasons,
          needed,
          pendingAlternatives: residuals.length,
        });
      }
      // The satisfied branches drop out of the residual (you're making progress
      // woohoo :starstruck: :starstruck:), which is what makes an any-of
      // collapse to nothing once enough of it is taken (gj you did it yay
      // yippee :partying_face: :partying_face:).
      return pending({ kind: "anyOf", min: needed, of: residuals });
    }
  }
}

const SATISFIED: Status = { kind: "satisfied" };

function pending(residual: Requirement): Status {
  return { kind: "pending", residual };
}

function unsatisfiable(reason: Reason): Status {
  return { kind: "unsatisfiable", reason };
}

interface MemberTally {
  held: number;
  /** Not held and not blocked; the members that could still close the gap (:triumph: :triumph:). */
  gettable: number;
  /** Why the rest of the members are out of reach; needed for the composite
   * reason, i.e. this collects individual reasons for why each member is
   * unreachable (instead of just collapsing all reasons into one single
   * "impossible"/"unreachable"), which then become the `composite` reason's
   * `reasons`.
  */
  blocked: Reason[];
}

function tallyMembers(
  members: readonly TraitId[],
  facts: RunFacts,
  rules: GameRules,
): MemberTally {
  const tally: MemberTally = { held: 0, gettable: 0, blocked: [] };
  for (const member of members) {
    if (facts.held.has(member)) {
      tally.held += 1;
      continue;
    }
    // Deliberately not recursive: a member counts as gettable on its own
    // feasibility, w/o evaluating its prerequisites in turn. Recursing would
    // 1) not terminate on a set whose member requires the set, and 2) trade
    // "not yet" for "impossible" (which is like the exact wrong direction to
    // be wrong in).
    const blocked = rules.isBlocked(member, facts);
    if (blocked === null) tally.gettable += 1;
    else tally.blocked.push(blocked);
  }
  return tally;
}

/** Shared by the two set-shaped atoms, which differ only in where members come from. */
function fromMembers(
  tally: MemberTally,
  count: number,
  residualWith: (count: number) => Requirement,
): Status {
  if (tally.held >= count) return SATISFIED;
  const needed = count - tally.held;
  if (tally.gettable < needed) {
    return unsatisfiable({
      kind: "composite",
      reasons: tally.blocked,
      needed,
      pendingAlternatives: tally.gettable,
    });
  }
  return pending(residualWith(needed));
}
