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
 * `lookups` is read. The user's plans aren't an input (since what someone
 * "intends to pick" can't change what's legitimately satisfiable); that stays
 * true by construction bc this fn is given facts and never the entire run state.
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
 * are read from `facts.elements` as the run's running total.
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
      if (!rules.isGodPoolFull(facts)) return pending(req);
      // Reported as full even though the cap is soft: equipping an absent god's
      // keepsake still forces them in past it. Saying so would need to know
      // whether an opportunity to swap one in remains, which is a count of the
      // regions left in the run, & nothing supplies that number -- a phone-first
      // player would be keeping it by hand for the length of every run, w/ no
      // other surface reading it and no way to notice when it drifts.
      //
      // So the honest shape of the answer is "impossible *for now*", and the
      // "for now" lives in the copy the UI puts on this verdict: equip this
      // god's keepsake next region and they can still turn up. Splitting that
      // sentence across two states (one that says impossible & one that says
      // not-yet) is what needs the counter; keeping it as one sentence doesn't.
      //
      // The reason is always godPoolFull, never godExcluded. A god who can
      // never enter the pool at all (e.g. Hermes in both games) is a catalog
      // fact rather than a run state, so a requirement naming one shouldn't be
      // authored in the first place, and exclusion that does matter arrives
      // through `isBlocked` on a *trait* instead.
      return unsatisfiable({ kind: "godPoolFull", god: req.god });
    }

    case "hasKeepsake":
      // Never says "impossible"; deliberately vague-posting here instead of just
      // yk showing "true" since a god's keepsake can only "activate"/do the yk
      // actual boon-summoning thing once per run, so "unequipped & already spent"
      // really is impossible & this returns pending for it anyway o_0.
      // Actually saying that would mean having like a "facts" field for spent
      // keepsakes, a rules method (isBlocked is built for boons rn so can't
      // just be "reused" for keepsakes), a Reason variant, which is a whole
      // lotta effort just to include this like weird lil niche case (esp in a
      // direction that's technically already safe even if a bit imprecise).
      return facts.equipped.keepsake === req.keepsake ? SATISFIED : pending(req);

    case "hasElement": {
      const have = facts.elements.get(req.element) ?? 0;
      if (have >= req.count) return SATISFIED;
      // Never impossible: element counts only grow, and no Infusion gates an
      // element its granting god can't reach, so there's nothing to be short of
      // except time.
      return pending({ kind: "hasElement", element: req.element, count: req.count - have });
    }

    case "hasBoonFrom": {
      const tally = tallyMembers(lookups.boonsOfGod(req.god), facts, rules);
      if (tally.held > 0) return SATISFIED;
      if (tally.gettable === 0) {
        // The shortfall numbers are always 1 and 0 here, which looks like
        // padding & isn't: an `all` reports a composite w/o them to mean "no
        // shortfall to report", so omitting them would say the opposite of
        // what's true (there IS one boon missing, w/ no way left to get it).
        return unsatisfiable({
          kind: "composite",
          reasons: tally.blocked,
          needed: 1,
          pendingAlternatives: 0,
        });
      }
      return pending(req);
    }

    case "hasTalent": {
      const selection = facts.equipped.talents?.get(req.talent);
      // Nothing known abt this talent, so "not yet". The lookup is per talent
      // on purpose: a source that collected the Cast row & not the others must
      // not have its silence about the others read as a definite no, since a
      // definite no here is permanent for the run. An absent fact must never
      // manufacture an impossible -- the one direction this really can't get
      // wrong.
      if (selection === undefined) return pending(req);
      if (selection === "selected") return SATISFIED;
      // Talents are picked at the Mirror before the run & can't change during
      // it, so the other side of the row being selected is settled for the
      // whole run rather than merely not-done-yet. Same argument as hasAspect.
      return unsatisfiable({ kind: "talentNotSelected", talent: req.talent });
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

/**
 * Counts a god's boons by what the run holds and what it can still get.
 *
 * The second half is the whole reason this reads the god's boon list rather
 * than reading the run's holdings backwards through a `godOf(trait)` lookup:
 * a reverse lookup sees what's held and can't see what's still *available*,
 * which is exactly the difference between "not yet" and "impossible".
 */
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
