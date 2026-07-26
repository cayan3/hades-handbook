import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate.js";
import type {
  CatalogLookups,
  Element,
  GameRules,
  Reason,
  Requirement,
  RunFacts,
  RunIntent,
  RunState,
} from "./index.js";
import {
  type Acquisition,
  applyAcquisition,
  acquisitionFor,
  held,
  makeFacts,
  rank,
  residualSize,
  stubLookups,
  stubRules,
  zeroBaseline,
} from "./test-support.js";

/**
 * The invariants, over generated runs.
 *
 * A failing property here is a design error until proven otherwise: the fix is
 * to correct the model, not to loosen the assertion.
 *
 * Everything is generated from one small pool of ids so that requirements and
 * facts actually overlap. Drawing free-form strings would make almost every
 * requirement reference something the run has never heard of, and the suite
 * would pass by never testing anything interesting.
 */

const TRAITS = ["t1", "t2", "t3", "t4", "t5"] as const;
const GODS = ["g1", "g2", "g3"] as const;
const SETS = ["s1", "s2"] as const;
const KEEPSAKES = ["k1", "k2"] as const;
const ASPECTS = ["a1", "a2"] as const;
const ELEMENTS = ["Fire", "Water"] as const satisfies readonly Element[];

const count = fc.integer({ min: 1, max: 3 });

const leafArb: fc.Arbitrary<Requirement> = fc.oneof(
  fc
    .tuple(fc.constantFrom(...TRAITS), fc.option(fc.integer({ min: 1, max: 3 }), { nil: undefined }))
    .map(([trait, minLevel]) =>
      minLevel === undefined
        ? ({ kind: "hasTrait", trait } as const)
        : ({ kind: "hasTrait", trait, minLevel } as const),
    ),
  fc.record({ kind: fc.constant("hasSet" as const), set: fc.constantFrom(...SETS), count }),
  fc.record({ kind: fc.constant("hasBoonFrom" as const), god: fc.constantFrom(...GODS), count }),
  fc.record({
    kind: fc.constant("hasElement" as const),
    element: fc.constantFrom(...ELEMENTS),
    count,
  }),
  fc.record({ kind: fc.constant("godInPool" as const), god: fc.constantFrom(...GODS) }),
  fc.record({
    kind: fc.constant("hasKeepsake" as const),
    keepsake: fc.constantFrom(...KEEPSAKES),
  }),
  fc.record({
    kind: fc.constant("aspectIn" as const),
    aspects: fc.uniqueArray(fc.constantFrom(...ASPECTS), { minLength: 1 }),
  }),
);

const requirementArb: fc.Arbitrary<Requirement> = fc.letrec<{ requirement: Requirement }>((tie) => ({
  requirement: fc.oneof(
    { maxDepth: 3 },
    leafArb,
    fc.record({
      kind: fc.constant("all" as const),
      of: fc.array(tie("requirement"), { maxLength: 3 }),
    }),
    fc.record({
      kind: fc.constant("anyOf" as const),
      min: fc.integer({ min: 1, max: 3 }),
      of: fc.array(tie("requirement"), { maxLength: 3 }),
    }),
  ),
})).requirement;

const lookupsArb: fc.Arbitrary<CatalogLookups> = fc
  .tuple(
    fc.subarray([...TRAITS]),
    fc.subarray([...TRAITS]),
    fc.subarray([...TRAITS]),
    fc.subarray([...TRAITS]),
    fc.subarray([...TRAITS]),
  )
  .map(([s1, s2, g1, g2, g3]) => stubLookups({ s1, s2 }, { g1, g2, g3 }));

/** What the feasibility layer refuses, drawn before anything that must respect it. */
interface Feasibility {
  blocked: readonly string[];
  unreachable: readonly string[];
  ceilings: ReadonlyMap<Element, number>;
}

const feasibilityArb: fc.Arbitrary<Feasibility> = fc
  .tuple(
    fc.subarray([...TRAITS]),
    fc.subarray([...GODS]),
    fc.uniqueArray(fc.tuple(fc.constantFrom(...ELEMENTS), fc.integer({ min: 0, max: 4 })), {
      selector: ([element]) => element,
    }),
  )
  .map(([blocked, unreachable, ceilings]) => ({
    blocked,
    unreachable,
    ceilings: new Map(ceilings),
  }));

function rulesFor(feasibility: Feasibility): GameRules {
  return stubRules({
    blocked: new Map<string, Reason>(
      feasibility.blocked.map((trait) => [trait, { kind: "banned", trait }] as const),
    ),
    unreachableGods: new Set(feasibility.unreachable),
    ceilings: feasibility.ceilings,
  });
}

/**
 * A run and a further acquisition.
 *
 * **The acquisition is drawn so the feasibility layer permits it**: nothing
 * banned is acquired, no god that cannot enter the pool is added to it, and no
 * element is gained past its ceiling. That much is load-bearing rather than
 * tidiness. A generator free to "acquire" a banned trait, or to gain a second
 * Water in a run whose Water ceiling is one, describes a step the rules say
 * cannot be taken, and after such a step an impossible branch climbs back to
 * pending: the dead branch rejoins an any-of residual and the residual *grows*.
 * The very first version of this suite failed on exactly that, roughly one run
 * in three. The evaluator was right and the scenario was nonsense.
 *
 * **What the run already holds is deliberately not constrained that way.** It
 * may hold a trait the feasibility layer now blocks, have a god pooled that
 * could not enter the pool today, or hold more of an element than its ceiling
 * would now allow. Those states are reachable in production — evaluation runs on
 * effective facts, and the override layer can set one without the other — and
 * they are the only states that tell "satisfaction is checked before
 * feasibility" apart from the reverse ordering. Ruling them out costs the suite
 * precisely that distinction and buys nothing back: what an impossible answer
 * turns on never depends on the holding, only on the ceiling, so monotonicity,
 * the residual fixpoint, residual soundness and satisfied-stability were each
 * measured to hold without it.
 *
 * (Monotonicity remains a claim about evaluation under acquisition, never a
 * promise about the sequence of states a player sees.)
 */
const worldArb = feasibilityArb.chain((feasibility) => {
  const obtainable = TRAITS.filter((trait) => !feasibility.blocked.includes(trait));
  const reachable = GODS.filter((god) => !feasibility.unreachable.includes(god));
  const ceiling = (element: Element) => Math.min(3, feasibility.ceilings.get(element) ?? 99);

  const levelled = (traits: readonly string[]) =>
    fc
      .tuple(...traits.map(() => fc.integer({ min: 1, max: 3 })))
      .map((levels) => traits.map((trait, i) => [trait, levels[i] ?? 1] as const));

  // What the run already holds is drawn freely, including above the ceiling;
  // what it can still gain is not. The gain is clamped into [0, ceiling - have],
  // which is empty once the run is at or above the ceiling — a run cannot
  // acquire past what it can reach, and clamping at zero keeps an acquisition
  // from quietly becoming a loss.
  const elementPlan = fc.tuple(
    ...ELEMENTS.map((element) =>
      fc
        .tuple(fc.nat({ max: 3 }), fc.nat({ max: 3 }))
        .map(
          ([have, gain]) =>
            [element, have, Math.max(0, Math.min(gain, ceiling(element) - have))] as const,
        ),
    ),
  );

  return fc
    .tuple(
      requirementArb,
      lookupsArb,
      fc.subarray([...TRAITS]).chain(levelled),
      fc.subarray([...GODS]),
      elementPlan,
      fc.option(fc.constantFrom(...KEEPSAKES), { nil: undefined }),
      fc.option(fc.constantFrom(...ASPECTS), { nil: undefined }),
      fc.option(
        fc.record({
          region: fc.integer({ min: 1, max: 4 }),
          chamber: fc.integer({ min: 1, max: 40 }),
        }),
        { nil: undefined },
      ),
      fc.subarray(obtainable).chain(levelled),
      fc.subarray(reachable),
    )
    .map(
      ([
        req,
        lookups,
        heldEntries,
        pool,
        elements,
        keepsake,
        aspect,
        progress,
        gainedTraits,
        gainedGods,
      ]) => {
        const loadout: RunFacts["loadout"] = {};
        if (keepsake !== undefined) loadout.keepsake = keepsake;
        if (aspect !== undefined) loadout.aspect = aspect;

        const base = makeFacts({
          held: held(...heldEntries),
          godPool: new Set(pool),
          elements: new Map<Element, number>(elements.map(([element, have]) => [element, have])),
          loadout,
        });

        const delta: Acquisition = {
          held: new Map(gainedTraits),
          godPool: new Set(gainedGods),
          elements: new Map<Element, number>(elements.map(([element, , gain]) => [element, gain])),
        };

        return {
          req,
          facts: progress === undefined ? base : { ...base, progress },
          rules: rulesFor(feasibility),
          lookups,
          delta,
        };
      },
    );
});

/**
 * Ten times the default, because the interesting cases are a minority of what
 * gets generated. Measured over 2000 scenarios: roughly a fifth come out
 * pending, and of those about half describe an acquisition that can actually be
 * made — so the properties that only bite on a pending status would otherwise
 * see a couple of dozen real cases per run. The whole suite still finishes in
 * well under a second.
 */
const RUNS = { numRuns: 1000 };

describe("P1 — determinism and totality", () => {
  it("never throws, always answers, and answers the same way twice", () => {
    fc.assert(
      fc.property(worldArb, ({ req, facts, rules, lookups }) => {
        const first = evaluate(req, facts, rules, lookups);
        const second = evaluate(req, facts, rules, lookups);
        expect(["satisfied", "pending", "unsatisfiable"]).toContain(first.kind);
        expect(second).toEqual(first);
      }),
      RUNS,
    );
  });
});

describe("P2 — monotonicity under acquisition, feasibility held fixed", () => {
  /**
   * The generated rules answer from the trait, god or element asked about and
   * never from the facts, which is what "feasibility held fixed" means. With
   * facts-driven feasibility the claim is simply false, and on purpose: taking a
   * blocker makes a trait impossible, taking an exclusive-group member makes its
   * siblings impossible, and filling the pool can close it. Those three are
   * asserted as worked examples instead.
   */
  it("never lowers a status, and only shrinks a residual", () => {
    fc.assert(
      fc.property(worldArb, ({ req, facts, rules, lookups, delta }) => {
        const before = evaluate(req, facts, rules, lookups);
        const after = evaluate(req, applyAcquisition(facts, delta), rules, lookups);

        expect(rank(after.kind)).toBeGreaterThanOrEqual(rank(before.kind));
        if (before.kind === "pending" && after.kind === "pending") {
          expect(residualSize(after.residual)).toBeLessThanOrEqual(residualSize(before.residual));
        }
      }),
      RUNS,
    );
  });
});

describe("P3 — a residual restates itself", () => {
  it("re-evaluates to itself against a run that has acquired nothing", () => {
    fc.assert(
      fc.property(worldArb, ({ req, facts, rules, lookups }) => {
        const status = evaluate(req, facts, rules, lookups);
        fc.pre(status.kind === "pending");
        if (status.kind !== "pending") return;

        // Against the facts it came from it would double-count what is already
        // held — "two more Water" re-read as "two Water" when one is in hand.
        // The baseline is the run with nothing acquired.
        expect(evaluate(status.residual, zeroBaseline(facts), rules, lookups)).toEqual(status);
      }),
      RUNS,
    );
  });
});

describe("P4 — a residual is a sound shopping list", () => {
  it("satisfies the original requirement once acquired", () => {
    fc.assert(
      fc.property(worldArb, ({ req, facts, rules, lookups }) => {
        const status = evaluate(req, facts, rules, lookups);
        fc.pre(status.kind === "pending");
        if (status.kind !== "pending") return;

        // Skipped where no acquisition can satisfy the residual: upgrading a
        // trait already held, or equipping a keepsake or aspect, none of which
        // is a gain the run can simply add.
        const delta = acquisitionFor(status.residual, facts, rules, lookups);
        fc.pre(delta !== null);
        if (delta === null) return;

        // Both halves matter. The first proves the list really does answer the
        // residual, so the second cannot pass by asking for nothing.
        expect(
          evaluate(status.residual, applyAcquisition(zeroBaseline(facts), delta), rules, lookups)
            .kind,
        ).toBe("satisfied");
        expect(evaluate(req, applyAcquisition(facts, delta), rules, lookups).kind).toBe("satisfied");
      }),
      RUNS,
    );
  });
});

describe("P5 — satisfied stays satisfied", () => {
  it("survives any further acquisition", () => {
    fc.assert(
      fc.property(worldArb, ({ req, facts, rules, lookups, delta }) => {
        fc.pre(evaluate(req, facts, rules, lookups).kind === "satisfied");
        expect(evaluate(req, applyAcquisition(facts, delta), rules, lookups).kind).toBe("satisfied");
      }),
      RUNS,
    );
  });
});

describe("P6 — an any-of collapses", () => {
  const branches: Requirement[] = [
    { kind: "hasTrait", trait: "t1" },
    { kind: "hasTrait", trait: "t2" },
    { kind: "hasTrait", trait: "t3" },
  ];
  const anyOne: Requirement = { kind: "anyOf", min: 1, of: branches };

  it("is satisfied by whichever single branch lands", () => {
    fc.assert(
      fc.property(fc.constantFrom("t1", "t2", "t3"), (trait) => {
        const facts = makeFacts({ held: held(trait) });
        expect(evaluate(anyOne, facts, stubRules(), stubLookups()).kind).toBe("satisfied");
      }),
    );
  });

  it("drops the branches it no longer needs from a containing residual", () => {
    const facts = makeFacts({ held: held("t1") });
    const outer: Requirement = { kind: "all", of: [anyOne, { kind: "hasTrait", trait: "t4" }] };
    const status = evaluate(outer, facts, stubRules(), stubLookups());
    expect(status).toEqual({
      kind: "pending",
      residual: { kind: "all", of: [{ kind: "hasTrait", trait: "t4" }] },
    });
  });

  it("keeps a branch that another unmet node still needs", () => {
    // t2 leaves the any-of, which is satisfied by t1, but survives in the
    // residual because the second node asks for it in its own right.
    const facts = makeFacts({ held: held("t1") });
    const outer: Requirement = {
      kind: "all",
      of: [
        { kind: "anyOf", min: 1, of: [branches[0] as Requirement, branches[1] as Requirement] },
        { kind: "hasTrait", trait: "t2" },
      ],
    };
    expect(evaluate(outer, facts, stubRules(), stubLookups())).toEqual({
      kind: "pending",
      residual: { kind: "all", of: [{ kind: "hasTrait", trait: "t2" }] },
    });
  });
});

describe("P7 — what the player intends changes nothing", () => {
  const intentArb: fc.Arbitrary<RunIntent> = fc
    .tuple(
      fc.subarray([...TRAITS]),
      fc.subarray([...TRAITS]),
      fc.option(fc.string(), { nil: undefined }),
    )
    .map(([pins, planned, note]) => ({
      pins: new Set(pins),
      planned: new Map(planned.map((trait) => [trait, "planned" as const])),
      notes: note === undefined ? new Map() : new Map(planned.map((trait) => [trait, note])),
    }));

  it("evaluates two runs differing only in intent identically", () => {
    fc.assert(
      fc.property(worldArb, intentArb, intentArb, ({ req, facts, rules, lookups }, one, two) => {
        // The guarantee is structural — evaluation is handed facts and never the
        // whole run state, so intent is not in scope to be read. This asserts
        // the seam has not been widened.
        const a: RunState = { facts, intent: one };
        const b: RunState = { facts, intent: two };
        expect(evaluate(req, a.facts, rules, lookups)).toEqual(
          evaluate(req, b.facts, rules, lookups),
        );
      }),
      RUNS,
    );
  });
});

describe("P8 — whether a requirement is met does not depend on feasibility", () => {
  it("answers satisfied under any feasibility layer or none", () => {
    fc.assert(
      fc.property(worldArb, ({ req, facts, rules, lookups }) => {
        // Satisfaction is read before feasibility in every rule, so whether a
        // requirement is *met* is a question about the facts alone. A run that
        // holds a trait the layer now blocks, or has a god pooled that could not
        // enter the pool today, still meets a requirement naming them — and it
        // is only in such a run that the two orderings give different answers,
        // which is why the generator is free to produce one.
        const answered = evaluate(req, facts, rules, lookups).kind === "satisfied";
        const permissive = evaluate(req, facts, stubRules(), lookups).kind === "satisfied";
        expect(permissive).toBe(answered);
      }),
      RUNS,
    );
  });
});
