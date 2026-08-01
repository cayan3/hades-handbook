import type {
  CatalogLookups,
  Element,
  GameRules,
  GodId,
  HeldTrait,
  Reason,
  Requirement,
  RunFacts,
  TraitId,
} from "./index.js";

/**
 * Builders shared by the evaluation matrix, the display-state tests, and the
 * property suite. Kept out of the published surface (i.e. nothing in `index.ts`
 * re-exports it); reasons for this include: 1) `Acquisition isn't a domain
 * concept & if exported, would prob read as the way things reach Facts (and it
 * yk is erm not that lol), 2) `stubRules` is purposefully wrong (it returns
 * feasibility that never yk actually reads the facts lol) & publishing it would
 * mean having a `GameRules` that models erm basically nothing o_0, 3) test
 * files are imported by relative path & exporting doesn't really have any pros.
 */

export function makeFacts(over: Partial<RunFacts> = {}): RunFacts {
  return {
    game: "hades2",
    dataVersion: "test",
    held: new Map(),
    godPool: new Set(),
    elements: new Map(),
    slots: new Map(),
    equipped: {},
    resources: new Map(),
    bans: new Set(),
    ...over,
  };
}

/** Has two input forms: `"A"` holds A at level 1, `["A", 3]` holds it at level 3. */
export function held(...traits: ReadonlyArray<TraitId | readonly [TraitId, number]>) {
  const map = new Map<TraitId, HeldTrait>();
  for (const entry of traits) {
    const [trait, level] = typeof entry === "string" ? ([entry, 1] as const) : entry;
    map.set(trait, { rarity: "Common", level });
  }
  return map;
}

export interface StubRules {
  blocked?: ReadonlyMap<TraitId, Reason>;
  unreachableGods?: ReadonlySet<GodId>;
  capacity?: number;
}

/**
 * A game-rules stub whose verdicts depend on the trait, god, or element asked
 * about and never on the facts.
 *
 * That is... literally the point bro (this is not a shortcut -_-). Feasibility
 * that varies w/ what the player holds is exactly what makes acquisition able
 * to actually *lower* a status (e.g. taking the blocker means the blocked trait
 * becomes impossible) so the monotonicity property has to hold feasibility
 * fixed in order to like literally say anything at all.
 *
 * The cases this rules out are instead covered by worked examples that build
 * their own facts-dependent rules. The three cases are the scenarios where
 * acquisition actually lowers a Status: a one-directional block, a mutually
 * exclusive group, and a pool that closes as it's being filled. Since these
 * rely on a status *decreasing*, they have to be explicitly written that way
 * bc this lil stub guy literally can't produce them itself (pat pat pat).
 */
export function stubRules(cfg: StubRules = {}): GameRules {
  return {
    poolCapacity: () => cfg.capacity ?? 4,
    canGodEnterPool: (g) => !(cfg.unreachableGods?.has(g) ?? false),
    isBlocked: (t) => cfg.blocked?.get(t) ?? null,
  };
}

export function stubLookups(
  gods: Readonly<Record<string, readonly TraitId[]>> = {},
): CatalogLookups {
  return {
    boonsOfGod: (g) => gods[g] ?? [],
  };
}

/**
 * What a run has acquired, as something that can be added to facts.
 *
 * Levels are absolute instead of incremental (e.g. "hold A at level 3", not
 * "gain two levels of A"). Element counts are the opposite; i.e. they add,
 * which mirrors how the residuals themselves are shaped.
 */
export interface Acquisition {
  held: Map<TraitId, number>;
  godPool: Set<GodId>;
  elements: Map<Element, number>;
}

export function emptyAcquisition(): Acquisition {
  return { held: new Map(), godPool: new Set(), elements: new Map() };
}

/**
 * The same run w/ nothing acquired yet: `held`, `godPool`, & `elements` are
 * emptied/cleared, while everything else (e.g. the equipped kit, progress, &
 * every rules verdict that doesn't derive from those three) is left alone.
 *
 * This is the very baseline a residual is a statement about. A residual says
 * what still needs to be acquired, so re-feeding it to the facts it literally
 * came from would double-count the already-held part.
 */
export function zeroBaseline(facts: RunFacts): RunFacts {
  return { ...facts, held: new Map(), godPool: new Set(), elements: new Map() };
}

export function applyAcquisition(facts: RunFacts, delta: Acquisition): RunFacts {
  const nextHeld = new Map(facts.held);
  for (const [trait, level] of delta.held) {
    const existing = nextHeld.get(trait);
    nextHeld.set(trait, {
      rarity: existing?.rarity ?? "Common",
      level: Math.max(existing?.level ?? 0, level),
    });
  }
  const nextElements = new Map(facts.elements);
  for (const [element, count] of delta.elements) {
    nextElements.set(element, (nextElements.get(element) ?? 0) + count);
  }
  return {
    ...facts,
    held: nextHeld,
    godPool: new Set([...facts.godPool, ...delta.godPool]),
    elements: nextElements,
  };
}

/**
 * The "shopping list" a residual describes, i.e. what to go acquire in order
 * fully satisfy the original requirement.
 *
 * Returns null when no such acquisition exists; callers treat that as a
 * precondition failure and discard the world (erm rip). There are two cases
 * where that can happen. Case 1: a keepsake, an aspect, or a Mirror talent,
 * since equipping a keepsake is a swap (not a gain) so is outside what
 * "acquire this" can even mean, while a weapon aspect and a talent selection
 * yk can't be changed mid-run at all. Case 2: a god w/ too few unheld boons
 * left to actually achieve, which a real residual wouldn't contain but a
 * generated one could (lol).
 *
 * A trait held below the level asked for is deliberately not one of those
 * cases. Since its residual is a threshold instead of a count of steps (and
 * merging an acquisition just takes the higher of the two levels), "hold it at
 * three" is expressible regardless of if it's already "held at one". Treating
 * it as unacquirable doesn't work bc it drops literally every level upgrade
 * out of the properties that consume this (this happened bc the oracle builds
 * the acquisition a residual asks for, so for something like `hasTrait{A,
 * minLevel:3}` w/ A held at 1, an earlier version of this returned `null`
 * (reasoning that there's nothing left to acquire bc A is already yk held),
 * which made the caller discard.. the entire.. world... soo every generated
 * world that had a level upgrade was just erm yk thrown away before ever being
 * tested :smile: :smile: To make things worse, this was all done silently bc
 * discarded worlds aren't seen as "failures" (they're literally just not
 * considered at all). :sobbing: :sobbing: Fun fact: this is also why the
 * oracle now has its own tests :pensive: :pensive: i.e. that lil bug is
 * why we can't have nice things :pensive: :pensive:.)
 *
 * Nothing the feasibility layer refuses is ever put in the list (a run can't
 * acquire a trait that's been banned, or pool a god that can't enter the pool)
 * (lol).
 *
 * Each requirement 1) is threaded through the list built so far, and 2) hands
 * back a new one, so a branch that turns out not to work ends up contributing
 * nothing. (An earlier version accumulated in place instead, which left the
 * successful half of a failed branch behind & ermmm quietly made the list
 * larger than the residual actually asked for oops.)
 */
export function acquisitionFor(
  req: Requirement,
  facts: RunFacts,
  rules: GameRules,
  lookups: CatalogLookups,
): Acquisition | null {
  return collect(req, facts, rules, lookups, emptyAcquisition());
}

function clone(acquisition: Acquisition): Acquisition {
  return {
    held: new Map(acquisition.held),
    godPool: new Set(acquisition.godPool),
    elements: new Map(acquisition.elements),
  };
}

function collect(
  req: Requirement,
  facts: RunFacts,
  rules: GameRules,
  lookups: CatalogLookups,
  sofar: Acquisition,
): Acquisition | null {
  switch (req.kind) {
    case "hasTrait": {
      const wanted = req.minLevel ?? 1;
      // Held high enough already, so there's nothing to actually go get (yay?).
      // Read before feasibility (exactly as evaluation reads it).
      if ((facts.held.get(req.trait)?.level ?? 0) >= wanted) return sofar;
      if (rules.isBlocked(req.trait, facts) !== null) return null;
      const next = clone(sofar);
      next.held.set(req.trait, Math.max(next.held.get(req.trait) ?? 0, wanted));
      return next;
    }
    case "hasBoonFrom": {
      const members = lookups.boonsOfGod(req.god);
      // Already satisfied, so there's nothing to go get -- same short-circuit
      // hasTrait and godInPool make, & it matters now that the atom is
      // all-or-nothing: w/o it this would ask for a second boon of a god the
      // run already has one from.
      if (members.some((member) => facts.held.has(member))) return sofar;
      return takeMembers(members, 1, facts, rules, sofar);
    }
    case "hasElement": {
      // The max, not the sum (bc two thresholds on one element are both
      // satisfied by just yk meeting the higher one, & the count just adds to
      // whatever the run already has).
      const next = clone(sofar);
      next.elements.set(req.element, Math.max(next.elements.get(req.element) ?? 0, req.count));
      return next;
    }
    case "godInPool": {
      if (facts.godPool.has(req.god)) return sofar;
      if (!rules.canGodEnterPool(req.god, facts)) return null;
      const next = clone(sofar);
      next.godPool.add(req.god);
      return next;
    }
    case "hasKeepsake":
    case "hasAspect":
    case "hasTalent":
      return null;
    case "all": {
      let acc = sofar;
      for (const child of req.of) {
        const next = collect(child, facts, rules, lookups, acc);
        if (next === null) return null;
        acc = next;
      }
      return acc;
    }
    case "anyOf": {
      let acc = sofar;
      let taken = 0;
      for (const child of req.of) {
        if (taken >= req.min) break;
        const next = collect(child, facts, rules, lookups, acc);
        // A branch that fails simply doesn't advance the list (which is what
        // keeps its half-finished work out of the result yay).
        if (next !== null) {
          acc = next;
          taken += 1;
        }
      }
      return taken >= req.min ? acc : null;
    }
  }
}

function takeMembers(
  members: readonly TraitId[],
  count: number,
  facts: RunFacts,
  rules: GameRules,
  sofar: Acquisition,
): Acquisition | null {
  const next = clone(sofar);
  let taken = 0;
  for (const member of members) {
    if (taken >= count) break;
    // A member the run already holds isn't counted (the residual's count is
    // erm literally what remains after those, so counting them again would
    // result in under-acquiring rip).
    if (facts.held.has(member)) continue;
    // A member the list already asks for is different: it'll be held once this
    // is applied, so it counts towards this set w/o being asked for twice.
    // Two sets sharing a member are both closed by acquiring it once.
    if (next.held.has(member)) {
      taken += 1;
      continue;
    }
    if (rules.isBlocked(member, facts) !== null) continue;
    next.held.set(member, 1);
    taken += 1;
  }
  return taken >= count ? next : null;
}

/**
 * A size for "a pending residual only shrinks": what the cheapest way of
 * satisfying it still costs.
 *
 * This counts what's outstanding/still missing instead of counting nodes,
 * i.e. it counts how many more of an element, how many branches of an any-of,
 * etc the user still has to get. A requirement that keeps its shape but drops a
 * count should genuinely get smaller. (`hasElement` is the only leaf left
 * carrying a count, so it's the only one that can shrink w/o changing shape.)
 *
 * An any-of is charged for only the `min` cheapest of its branches (bc only
 * that many ever have to be taken lol; we're not trying to default
 * over-achieve here :no_mouth: :no_mouth:). Charging for ermmm all of them
 * would read a branch turning impossible as "progress" (the dead branch leaves
 * the residual while `min` stays exactly where it was, so the total would fall
 * at erm the exact moment the requirement got harder :sobbing: :sobbing:).
 * That transition needs feasibility to actually move, so nothing here can
 * currently produce it, but the measure itself is what a widened/strengthened
 * monotonicity claim would rest on so it shouldn't be the thing that fails/gives.
 */
export function residualCost(req: Requirement): number {
  switch (req.kind) {
    case "hasTrait":
    case "godInPool":
    case "hasKeepsake":
    case "hasAspect":
    case "hasTalent":
    case "hasBoonFrom":
      return 1;
    case "hasElement":
      return req.count;
    case "all":
      return req.of.reduce((total, child) => total + residualCost(child), 0);
    case "anyOf": {
      const costs = req.of.map(residualCost).sort((a, b) => a - b);
      return costs.slice(0, req.min).reduce((total, cost) => total + cost, 0);
    }
  }
}

/** unsatisfiable < pending < satisfied (for the monotonicity comparison). */
export function rank(kind: "satisfied" | "pending" | "unsatisfiable"): number {
  switch (kind) {
    case "unsatisfiable":
      return 0;
    case "pending":
      return 1;
    case "satisfied":
      return 2;
  }
}
