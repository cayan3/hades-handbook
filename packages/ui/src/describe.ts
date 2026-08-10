import type { BoonState, KeepsakeId, Reason, Requirement, RunFacts } from "@repo/core";
import type { Naming } from "./naming.js";

/**
 * Every sentence this package puts on screen about a node, kept apart from the
 * components that draw them.
 *
 * The accessible path promises that anything the graph says, the text says too.
 * So the text is the load-bearing half and the diamond renders it, not the other
 * way round. Splitting them means these can be read and tested without a
 * document anywhere near them, and no component can invent a sentence.
 *
 * All strings, handed to the renderer as text, which escapes them.
 */

/**
 * The one piece of copy here that is required rather than chosen, split where it
 * is emphasised and rejoined for anything wanting the plain sentence.
 *
 * The engine reports a hard verdict for a cap the games treat as soft: four gods
 * fill the pool, but an absent god's keepsake still pulls them in past it, at any
 * point, and that supply cannot run out. Nothing collects the count that would
 * tell a closed door from an open one, and under manual entry nothing will — so
 * the verdict is harder than the game and these words are the whole mitigation.
 *
 * "For now" is what makes the two halves one statement rather than a
 * contradiction, and the second sentence is the thing to go and do. So it is not
 * to be reworded, shortened or dropped when space is tight. The keepsake's name
 * sits beside it rather than inside it, so naming it can't rewrite it.
 */
export const POOL_FULL_LEAD = "Impossible for now.";
export const POOL_FULL_BODY =
  "Equip this god's keepsake next region to invite them to your pool.";
export const POOL_FULL_COPY = `${POOL_FULL_LEAD} ${POOL_FULL_BODY}`;

/** What a node says when it cannot be had this run. */
export interface ImpossibleNotice {
  /** An emphasised opening, where the verdict has one. */
  readonly lead: string | null;
  /** The sentence a player can act on. */
  readonly body: string;
  /**
   * The keepsake that would still force this god in, named separately so the
   * required copy stays word for word what it is.
   */
  readonly keepsake: string | null;
}

/**
 * Why a boon cannot be had. One verdict carries required copy; the rest are ours
 * to word, and they follow its rule: say what closed the door, and where it can
 * be reopened, say how. A bare "impossible" is what this product exists not to
 * say.
 *
 * `forcingKeepsake` is a function rather than the map itself because the map is
 * keyed by keepsake and this asks by god.
 */
export function impossibleNotice(
  reason: Reason,
  naming: Naming,
  forcingKeepsake: (god: string) => KeepsakeId | null,
): ImpossibleNotice {
  if (reason.kind === "godPoolFull") {
    const keepsake = forcingKeepsake(reason.god);
    return {
      lead: POOL_FULL_LEAD,
      body: POOL_FULL_BODY,
      keepsake: keepsake === null ? null : naming.keepsake(keepsake),
    };
  }
  return { lead: null, body: reasonSentence(reason, naming), keepsake: null };
}

/**
 * Exhaustive with no default case, so a new reason in the engine fails the
 * typecheck here rather than rendering a node that says nothing.
 */
export function reasonSentence(reason: Reason, naming: Naming): string {
  switch (reason.kind) {
    case "godPoolFull":
      return POOL_FULL_COPY;
    case "godExcluded":
      return `${naming.god(reason.god)} is not part of this run.`;
    case "banned":
      return `${naming.trait(reason.trait)} is banned this run.`;
    case "aspectConflict":
      return `Never offered while ${naming.aspect(reason.aspect)} is equipped.`;
    case "slotConflict":
      // The id in the way is more use than the group's name, which the games
      // don't give anyway.
      return `You hold ${naming.trait(reason.conflictsWith)}, and only one of the two can be held.`;
    case "blockedByTrait":
      // One-directional: the other order would have left both held, which is
      // the difference between bad luck and something avoidable next run.
      return `Taking ${naming.trait(reason.blockedBy)} put this out of reach for the rest of the run.`;
    case "talentNotSelected":
      // A Mirror row is fixed before the run starts, which is why this is a
      // verdict rather than a "not yet".
      return `This run took the other side of the Mirror row that ${naming.talent(reason.talent)} sits on.`;
    case "composite":
      return compositeSentence(reason, naming);
  }
}

/**
 * A group one pick short with three live alternatives reads very differently
 * from one where nothing is open, and both arrive as the same kind of reason —
 * so where the engine gave that context, it leads. The children follow either
 * way: "this group failed" without saying which member is another bare
 * impossible.
 */
function compositeSentence(
  reason: Reason & { kind: "composite" },
  naming: Naming,
): string {
  const parts = reason.reasons.map((child) => reasonSentence(child, naming));
  const needed = reason.needed;
  if (needed === undefined) return parts.join(" ");

  const open = reason.pendingAlternatives ?? 0;
  const head =
    open === 0
      ? `Needs ${needed} more of these and none is still open.`
      : `Needs ${needed} more of these, with ${open} still open.`;
  return [head, ...parts].join(" ");
}

/**
 * What a requirement still asks for, one line per thing to go and get.
 *
 * Written for a residual, which is already a statement about what to acquire
 * rather than what has piled up: "two more Water", never "three Water, of which
 * you have one". So nothing here subtracts anything — doing the arithmetic twice
 * is how a progress readout ends up counting a boon nobody has.
 *
 * A group collapses to one line rather than a nested list. The branch point is a
 * junction on screen already, and a player reading a goal wants "any one of these
 * five", not five lines that each look like a task.
 */
export function neededLines(req: Requirement, naming: Naming): readonly string[] {
  switch (req.kind) {
    case "all":
      return req.of.flatMap((child) => neededLines(child, naming));
    case "anyOf": {
      const branches = req.of.map((child) => branchPhrase(child, naming)).join(", ");
      return [`any ${req.min} of: ${branches}`];
    }
    default:
      return [branchPhrase(req, naming)];
  }
}

/**
 * One requirement as a noun phrase. A group inside a group becomes a
 * parenthesised phrase rather than expanding, for the reason above.
 */
function branchPhrase(req: Requirement, naming: Naming): string {
  switch (req.kind) {
    case "hasTrait":
      return req.minLevel !== undefined && req.minLevel > 1
        ? `${naming.trait(req.trait)} at level ${req.minLevel}`
        : naming.trait(req.trait);
    case "hasBoonFrom":
      return `any boon from ${naming.god(req.god)}`;
    case "hasElement":
      return `${req.count} more ${req.element}`;
    case "godInPool":
      return `${naming.god(req.god)} in your god pool`;
    case "hasKeepsake":
      return `the ${naming.keepsake(req.keepsake)} keepsake`;
    case "hasAspect": {
      const forms = req.aspects.map((aspect) => naming.aspect(aspect));
      return forms.length === 1
        ? `${forms[0]} equipped`
        : `one of ${forms.join(" or ")} equipped`;
    }
    case "hasTalent":
      return `the ${naming.talent(req.talent)} Mirror talent`;
    case "all":
      return req.of.map((child) => branchPhrase(child, naming)).join(" and ");
    case "anyOf": {
      const branches = req.of.map((child) => branchPhrase(child, naming)).join(", ");
      return `any ${req.min} of (${branches})`;
    }
  }
}

/**
 * What an owned but inert boon is waiting for, as have against need. The one
 * place a residual is the wrong shape: "one more Fire" is true and unhelpful
 * when the question is why a boon you own is doing nothing. The player wants the
 * threshold and their own count side by side, which is what the game's popup
 * says once and never again.
 *
 * Every shipped activation gate is an element count, alone or joined. The other
 * shapes are handled anyway so a patch adding one doesn't fall through to an
 * empty list, which would render as a badge with no explanation.
 */
export function activationLines(
  req: Requirement,
  facts: RunFacts,
  naming: Naming,
): readonly string[] {
  switch (req.kind) {
    case "hasElement": {
      const have = facts.elements.get(req.element) ?? 0;
      return [`needs ${req.count} ${req.element} — you have ${have}`];
    }
    case "all":
      return req.of.flatMap((child) => activationLines(child, facts, naming));
    case "anyOf": {
      const branches = req.of.flatMap((child) => activationLines(child, facts, naming));
      return [`needs any ${req.min} of these:`, ...branches];
    }
    default:
      return [`needs ${branchPhrase(req, naming)}`];
  }
}

/**
 * Short, because they sit under a name that is already on screen, and because
 * each has to be true of any boon in that state rather than of this one.
 */
export function stateSentence(state: BoonState): string {
  switch (state) {
    case "Obtained":
      return "Held.";
    case "Available":
      return "Takeable now.";
    case "Pending":
      return "On the way.";
    case "Locked":
      return "Not started, reachable.";
    case "Impossible":
      return "Can't happen this run.";
  }
}

/**
 * What a screen reader announces. The state is in the name and not only in the
 * frame, which is what makes the ladder readable without seeing it. God and tier
 * follow, since a node in a graph means little without knowing whose ladder it
 * is on and how deep — and both are dropped rather than filled in where the
 * record has neither, which is most Infusions and every Duo.
 */
export function accessibleName(
  name: string,
  state: BoonState,
  god: string | null,
  tier: number | null,
): string {
  const parts = [name, state];
  if (god !== null && tier !== null) parts.push(`${god}, tier ${tier}`);
  else if (god !== null) parts.push(god);
  else if (tier !== null) parts.push(`tier ${tier}`);
  return parts.join(" — ");
}
