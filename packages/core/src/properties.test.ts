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
  residualCost,
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

/**
 * An any-of asks for no more branches than it has.
 *
 * Drawing `min` independently of the branch list made roughly half of every run
 * a requirement no run could ever meet — `min: 3` over an empty `of` and its
 * neighbours — and an unsatisfiable world is one the residual properties skip
 * entirely, so the suite was spending most of its budget proving nothing. It is
 * also not a shape the data can take: an arity past the branch count is an
 * authoring error the catalog build rejects, so a generator that produces it by
 * accident is testing input the engine will never be handed.
 *
 * `evaluate` must still answer for it, which is a claim about totality rather
 * than about residuals — P1 makes it separately against `malformedArb`.
 */
const anyOfArb = (branch: fc.Arbitrary<Requirement>): fc.Arbitrary<Requirement> =>
  fc
    .array(branch, { minLength: 1, maxLength: 3 })
    .chain((of) =>
      fc
        .integer({ min: 1, max: of.length })
        .map((min) => ({ kind: "anyOf", min, of }) as const satisfies Requirement),
    );

const requirementArb: fc.Arbitrary<Requirement> = fc.letrec<{ requirement: Requirement }>((tie) => ({
  requirement: fc.oneof(
    { maxDepth: 3 },
    leafArb,
    fc.record({
      kind: fc.constant("all" as const),
      of: fc.array(tie("requirement"), { maxLength: 3 }),
    }),
    anyOfArb(tie("requirement")),
  ),
})).requirement;

/**
 * The shapes the catalog build rejects, kept only so totality is still asserted
 * over them: an any-of wanting more branches than exist, including none at all.
 */
const malformedArb: fc.Arbitrary<Requirement> = fc
  .tuple(fc.array(leafArb, { maxLength: 2 }), fc.integer({ min: 1, max: 4 }))
  .map(([of, extra]) => ({ kind: "anyOf", min: of.length + extra, of }) as const);

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

        // Soundness needs a delta that acquires only what the run does not
        // already hold. Re-acquiring a held trait is a level upgrade, and the
        // two set-shaped atoms count *members*: such an upgrade closes one of
        // the residual's counts against a baseline holding nothing, while
        // adding no new member to the facts the residual came from. Every other
        // property is indifferent to the overlap and keeps the free `delta`.
        const strictDelta: Acquisition = {
          held: new Map([...delta.held].filter(([trait]) => !base.held.has(trait))),
          godPool: delta.godPool,
          elements: delta.elements,
        };

        return {
          req,
          facts: progress === undefined ? base : { ...base, progress },
          rules: rulesFor(feasibility),
          lookups,
          delta,
          strictDelta,
        };
      },
    );
});

/**
 * Ten times the default, because the interesting cases are a minority of what
 * gets generated. Measured over 20000 scenarios: 27% come out pending, and of
 * those about half describe an acquisition that can actually be made — so the
 * properties that only bite on a pending status would otherwise see a couple of
 * dozen real cases per run.
 */
const RUNS = { numRuns: 1000 };

/**
 * For the two properties whose precondition is selective enough that `RUNS`
 * leaves them thin. Both bite only on a world that is pending *and* whose
 * generated acquisition happens to answer it, which measurement puts at ~7% of
 * worlds — about seventy real samples per thousand runs.
 *
 * That is too few for what these two carry. P9's first clause is the only thing
 * in the suite bounding `unsatisfiable` from above, which is the axis a previous
 * round of mutations survived on, and P4's universal form is the half that does
 * not build its own witness. Raising the count rather than steering the
 * generator towards the requirement's own ids is deliberate: the independence of
 * the witness is exactly what gives both their power.
 */
const DEEP_RUNS = { numRuns: 6000 };

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

  it("still answers for an any-of asking for more branches than it has", () => {
    // Totality is a contract about any input, not only well-formed input. The
    // catalog build rejects this shape, so the other properties no longer draw
    // it; the engine must nonetheless answer rather than throw.
    fc.assert(
      fc.property(worldArb, malformedArb, ({ facts, rules, lookups }, req) => {
        expect(["satisfied", "pending", "unsatisfiable"]).toContain(
          evaluate(req, facts, rules, lookups).kind,
        );
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
          expect(residualCost(after.residual)).toBeLessThanOrEqual(residualCost(before.residual));
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

        // Skipped where no acquisition can satisfy the residual: equipping a
        // keepsake or an aspect, neither of which is a gain the run can simply
        // add, and a set with too few unheld members left to close its gap.
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

  it("holds for any strict growth that answers it, not only the derived one", () => {
    // The clause above builds its own witness, and the builder reads the same
    // rules `evaluate` does — held before feasibility, nothing banned acquired —
    // so a shared misreading would pass both. This states the invariant as a
    // universal instead: whatever the generator hands over, if it answers the
    // residual then it answers the requirement. That is where the property's
    // power to catch an under-stated residual actually lives.
    //
    // The growth is strict: a delta re-naming a held trait falsifies the claim
    // for the set-shaped atoms without either side being wrong.
    fc.assert(
      fc.property(worldArb, ({ req, facts, rules, lookups, strictDelta }) => {
        const status = evaluate(req, facts, rules, lookups);
        fc.pre(status.kind === "pending");
        if (status.kind !== "pending") return;

        fc.pre(
          evaluate(status.residual, applyAcquisition(zeroBaseline(facts), strictDelta), rules, lookups)
            .kind === "satisfied",
        );

        expect(evaluate(req, applyAcquisition(facts, strictDelta), rules, lookups).kind).toBe(
          "satisfied",
        );
      }),
      DEEP_RUNS,
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

describe("P9 — an acquisition that lands proves the requirement was reachable", () => {
  it("was never impossible, and its residual asked for no more than landed", () => {
    fc.assert(
      fc.property(worldArb, ({ req, facts, rules, lookups, delta }) => {
        fc.pre(evaluate(req, applyAcquisition(facts, delta), rules, lookups).kind === "satisfied");
        const before = evaluate(req, facts, rules, lookups);

        // Nothing an acquisition can satisfy was ever impossible. This is the
        // direction the engine must not get wrong: a false "unreachable" writes
        // off a run that was still winnable, where a false "not yet" costs only
        // a hint. Every other invariant here bounds impossible from below.
        expect(before.kind).not.toBe("unsatisfiable");

        // And the residual asked for no MORE than this acquisition supplied.
        // The acquisition is drawn by the generator rather than derived from the
        // residual, so it is an independent witness: a residual inflated past
        // the shortfall fails here while still passing soundness, which only
        // ever asks whether the residual is enough.
        if (before.kind === "pending") {
          expect(
            evaluate(before.residual, applyAcquisition(zeroBaseline(facts), delta), rules, lookups)
              .kind,
          ).toBe("satisfied");
        }
      }),
      DEEP_RUNS,
    );
  });
});
