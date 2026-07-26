import type {
  AspectId,
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
 * Builders shared by the evaluation matrix, the display-state tests and the
 * property suite. Kept out of the published surface: nothing in `index.ts`
 * re-exports it.
 */

export function makeFacts(over: Partial<RunFacts> = {}): RunFacts {
  return {
    game: "hades2",
    dataVersion: "test",
    held: new Map(),
    godPool: new Set(),
    elements: new Map(),
    slots: new Map(),
    loadout: {},
    resources: new Map(),
    bans: new Set(),
    ...over,
  };
}

/** `"A"` holds A at level 1; `["A", 3]` holds it at level 3. */
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
  ceilings?: ReadonlyMap<Element, number>;
  capacity?: number;
}

/**
 * A game-rules stub whose verdicts depend on the trait, god or element asked
 * about and never on the facts.
 *
 * That is the point, not a shortcut. Feasibility that varies with what you hold
 * is exactly what makes acquisition able to *lower* a status — take the blocker
 * and the blocked trait becomes impossible — so the monotonicity property has to
 * hold feasibility fixed to say anything at all. Those facts-driven cases are
 * asserted directly in the matrix instead.
 */
export function stubRules(cfg: StubRules = {}): GameRules {
  const ceilings = cfg.ceilings ?? new Map<Element, number>();
  return {
    poolCapacity: () => cfg.capacity ?? 4,
    canGodEnterPool: (g) => !(cfg.unreachableGods?.has(g) ?? false),
    elementSources: () => new Map(),
    // Generous by default: a ceiling below the requirement is the interesting
    // case and every test that wants it says so.
    maxAttainableElement: (el) => ceilings.get(el) ?? 99,
    isBlocked: (t) => cfg.blocked?.get(t) ?? null,
  };
}

export function stubLookups(
  sets: Readonly<Record<string, readonly TraitId[]>> = {},
  gods: Readonly<Record<string, readonly TraitId[]>> = {},
): CatalogLookups {
  return {
    setMembers: (s) => sets[s] ?? [],
    boonsOfGod: (g) => gods[g] ?? [],
  };
}

/**
 * What a run has acquired, as a thing that can be added to facts.
 *
 * Levels are absolute rather than incremental: "hold A at level 3", not "gain
 * two levels of A". Element counts are the opposite — they add — which mirrors
 * how the residuals themselves are shaped.
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
 * The same run with nothing acquired yet: `held`, `godPool` and `elements`
 * emptied, everything else — loadout, progress, and every rules verdict that
 * does not derive from those three — left alone.
 *
 * This is the baseline a residual is a statement about. A residual says what
 * must still be *acquired*, so re-feeding it to the facts it came from would
 * count the already-held part twice.
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
 * The shopping list a residual describes: what to go and acquire so that the
 * original requirement comes out satisfied.
 *
 * Returns null where no such acquisition exists, and the caller skips the case:
 *
 *  - **A keepsake or an aspect.** Equipping is a swap, not a gain, so it is
 *    outside what "acquire this" can mean; an aspect cannot even be changed
 *    mid-run.
 *  - **A set with too few unheld members to close the gap**, which a real
 *    residual will not contain but a generated one can.
 *
 * A trait held below the level asked for is deliberately *not* one of those
 * cases. Its residual is a threshold rather than a count of steps, and merging
 * an acquisition takes the higher of the two levels, so "hold it at three" is
 * expressible whether or not it is already held at one. Treating it as
 * unacquirable dropped every level upgrade out of the properties that consume
 * this.
 *
 * Nothing the feasibility layer refuses is ever put in the list: a run cannot
 * acquire a banned trait or pool a god that cannot enter it.
 *
 * Each requirement is threaded through the list built so far and hands back a
 * new one, so a branch that turns out not to work contributes nothing. An
 * earlier version accumulated in place, which left the successful half of a
 * failed branch behind and quietly made the list larger than the residual
 * actually asked for.
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
      // Held high enough already, so there is nothing to go and get. Read before
      // feasibility, exactly as evaluation reads it.
      if ((facts.held.get(req.trait)?.level ?? 0) >= wanted) return sofar;
      if (rules.isBlocked(req.trait, facts) !== null) return null;
      const next = clone(sofar);
      next.held.set(req.trait, Math.max(next.held.get(req.trait) ?? 0, wanted));
      return next;
    }
    case "hasSet":
      return takeMembers(lookups.setMembers(req.set), req.count, facts, rules, sofar);
    case "hasBoonFrom":
      return takeMembers(lookups.boonsOfGod(req.god), req.count, facts, rules, sofar);
    case "hasElement": {
      // The maximum, not the sum: two thresholds on one element are satisfied by
      // meeting the larger, and the count adds to whatever the run already has.
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
    case "aspectIn":
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
        // A branch that fails simply does not advance the list, which is what
        // keeps its half-finished work out of the result.
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
    // A member the run already holds is not counted: the residual's count is
    // what remains after those, so counting them again would under-acquire.
    if (facts.held.has(member)) continue;
    // One the list already asks for is different — it will be held once this is
    // applied, so it counts towards this set without being asked for twice.
    // Two sets sharing a member are closed by acquiring it once.
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
 * A size for "a pending residual only shrinks".
 *
 * Counts what is outstanding rather than nodes: how many more of a set, how many
 * more of an element, how many branches of an any-of still have to land. A
 * requirement that keeps its shape but drops a count has genuinely got smaller.
 */
export function residualSize(req: Requirement): number {
  switch (req.kind) {
    case "hasTrait":
    case "godInPool":
    case "hasKeepsake":
    case "aspectIn":
      return 1;
    case "hasSet":
    case "hasBoonFrom":
    case "hasElement":
      return req.count;
    case "all":
      return req.of.reduce((total, child) => total + residualSize(child), 0);
    case "anyOf":
      return req.min + req.of.reduce((total, child) => total + residualSize(child), 0);
  }
}

/** unsatisfiable < pending < satisfied, for the monotonicity comparison. */
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

export const ASPECTS: readonly AspectId[] = ["AspectOfZagreus", "AspectOfSelene"];
