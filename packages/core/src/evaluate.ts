import type { CatalogLookups } from "./catalog-lookups.js";
import type { GameRules } from "./game-rules.js";
import type { TraitId } from "./ids.js";
import type { Requirement } from "./requirement.js";
import type { RunFacts } from "./run-state.js";
import type { Reason, Status } from "./status.js";

/**
 * Given everything true about a run and a requirement, return what is still
 * needed, that it is met, or that it is impossible this run.
 *
 * Pure, total and deterministic: every requirement shape is handled, no branch
 * throws, and nothing outside `facts`, `rules` and `lookups` is read. The user's
 * plans are not an input — what someone intends to pick cannot change what is
 * satisfiable, and that stays true by construction because this function is
 * given facts and never the whole run state.
 *
 * Two conventions hold across every rule below.
 *
 * **Satisfaction is checked before feasibility, always.** A trait you already
 * hold reads satisfied even if the feasibility layer would now refuse to hand it
 * to you. This is what makes "once satisfied, acquiring more keeps it satisfied"
 * true, and it is why purging is the only thing that can take a requirement back
 * to unmet.
 *
 * **Feasibility for a trait comes only from `rules.isBlocked`.** Bans, aspect
 * conflicts, slot and exclusive-group collisions and one-directional blocks all
 * arrive through that one call, so this function never inspects `facts.bans`
 * itself. Element counts are read from `facts.elements` as the run's running
 * total; the non-boon element sources on the rules interface feed the ceiling
 * calculation, and adding them here would double-count.
 *
 * The status a requirement gets is a *residual*: the part still outstanding,
 * expressed as another requirement. "Two more Water", not "false". Everything
 * the product displays — per-goal progress, an any-of collapsing once a branch
 * is taken, "impossible tonight" — is a view over that.
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
      // The pool cap is soft: an absent god's keepsake pulls that god in past
      // it, and keepsakes are swappable each region, so how many keepsake
      // opportunities remain is what decides whether a god is genuinely
      // unreachable. Without run progress we cannot count them, so we report
      // "not yet" — wrongly declaring a god unreachable is the most damaging
      // answer this engine can give, and "you'll need a keepsake" is actionable
      // where a dead end is not.
      if (facts.progress === undefined) return pending(req);
      if (rules.canGodEnterPool(req.god, facts)) return pending(req);
      // Always a full pool, never an excluded god: the rules call answers with a
      // boolean and cannot tell the two apart. Exclusion reaches evaluation
      // through `isBlocked` on a trait instead, and a god who can never enter
      // the pool at all is a catalog fact, so a requirement naming one should
      // not exist in authored data.
      return unsatisfiable({ kind: "godPoolFull", god: req.god });
    }

    case "hasKeepsake":
      // Never impossible: keepsakes are swapped freely between regions.
      return facts.loadout.keepsake === req.keepsake ? SATISFIED : pending(req);

    case "hasElement": {
      const have = facts.elements.get(req.element) ?? 0;
      if (have >= req.count) return SATISFIED;
      const max = rules.maxAttainableElement(req.element, facts);
      // `needed` is the full requirement rather than the shortfall, so it
      // compares like with like against the ceiling.
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

    case "aspectIn": {
      const equipped = facts.loadout.aspect;
      if (equipped === undefined) return pending(req);
      if (req.aspects.includes(equipped)) return SATISFIED;
      // A weapon aspect is chosen when the run starts and cannot be changed
      // mid-run, so the wrong one equipped is structural, not "not yet".
      return unsatisfiable({ kind: "aspectConflict", aspect: equipped });
    }

    case "all": {
      const residuals: Requirement[] = [];
      const reasons: Reason[] = [];
      for (const child of req.of) {
        const status = evaluate(child, facts, rules, lookups);
        if (status.kind === "pending") residuals.push(status.residual);
        else if (status.kind === "unsatisfiable") reasons.push(status.reason);
      }
      // No shortfall context here on purpose: an `all` whose children failed for
      // unrelated reasons has no "how many more" to report. Those two fields
      // exist for groups that were a pick short, which this never is.
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
      // A bare list of reasons cannot express "two were needed and one
      // alternative was merely pending" — which is exactly the group the UI must
      // not render as a flat impossible. Carrying both numbers is what lets it
      // say "one short" instead.
      if (residuals.length < needed) {
        return unsatisfiable({
          kind: "composite",
          reasons,
          needed,
          pendingAlternatives: residuals.length,
        });
      }
      // The satisfied branches drop out of the residual, which is what makes an
      // any-of collapse to nothing once enough of it is taken.
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
  /** Not held and not blocked — the members that could still close the gap. */
  gettable: number;
  /** Why the rest are out of reach, for the composite reason. */
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
    // feasibility, without evaluating its prerequisites in turn. Recursing would
    // not terminate on a set whose member requires the set, and it would trade
    // "not yet" for "impossible", which is the wrong direction to be wrong in.
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
