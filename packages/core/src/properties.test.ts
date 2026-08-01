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
 * A failing property here is a design error until proven otherwise; i.e. the
 * fix is to correct the model, not to like cheat it by loosening the assertion.
 *
 * Everything is generated from one small pool of ids so requirements and facts
 * actually overlap. Using like free-form strings or something would make almost
 * every requirement reference something the run has erm never heard of (lol),
 * which means the suite would pass... but only bc it erm never actually tested
 * anything interesting o_0.
 */

const TRAITS = ["t1", "t2", "t3", "t4", "t5"] as const;
const GODS = ["g1", "g2", "g3"] as const;
const KEEPSAKES = ["k1", "k2"] as const;
const ASPECTS = ["a1", "a2"] as const;
const TALENTS = ["m1", "m2"] as const;
const ELEMENTS = ["Fire", "Water"] as const satisfies readonly Element[];

/**
 * `hasElement` is the only leaf left that carries one, so this no longer
 * spreads across three atoms the way it did when `hasSet` and `hasBoonFrom`
 * counted members too. That matters for P2: the "a pending residual only
 * shrinks" clause is interesting exactly where a count falls w/o the shape
 * changing, and this is now the sole source of those.
 */
const count = fc.integer({ min: 1, max: 3 });

const leafArb: fc.Arbitrary<Requirement> = fc.oneof(
  fc
    .tuple(fc.constantFrom(...TRAITS), fc.option(fc.integer({ min: 1, max: 3 }), { nil: undefined }))
    .map(([trait, minLevel]) =>
      minLevel === undefined
        ? ({ kind: "hasTrait", trait } as const)
        : ({ kind: "hasTrait", trait, minLevel } as const),
    ),
  fc.record({ kind: fc.constant("hasBoonFrom" as const), god: fc.constantFrom(...GODS) }),
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
    kind: fc.constant("hasAspect" as const),
    aspects: fc.uniqueArray(fc.constantFrom(...ASPECTS), { minLength: 1 }),
  }),
  fc.record({ kind: fc.constant("hasTalent" as const), talent: fc.constantFrom(...TALENTS) }),
);

/**
 * An any-of asks for no more branches than it has (he does not in fact need two apples ^.^).
 *
 * Drawing `min` independently of the branch list made roughly half of every run
 * a requirement no run could ever meet (`min: 3` over an empty `of` & its
 * neighbours o_0) and an unsatisfiable world is one the residual properties
 * like just skip entirely, which meant the suite was spending most of its
 * time proving.. literally nothing (:smile: :smile:). It's also not a shape
 * the data can take since an arity past the branch count is erm an authoring
 * error (:no_mouth: :no_mouth:) that the catalog build rejects, so a generator
 * that produces it by accident is uhhh doing (unpaid) overtime (rip) by testing
 * input the engine will never actually be handed (:skull: :skull:).
 *
 * `evaluate` must still answer for it, which is a claim about totality instead
 * of about residuals (P1 makes it separately against `malformedArb`).
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
 * over them: an any-of wanting more branches than exist (greedy!), including
 * literally none at all.
 */
const malformedArb: fc.Arbitrary<Requirement> = fc
  .tuple(fc.array(leafArb, { maxLength: 2 }), fc.integer({ min: 1, max: 4 }))
  .map(([of, extra]) => ({ kind: "anyOf", min: of.length + extra, of }) as const);

const lookupsArb: fc.Arbitrary<CatalogLookups> = fc
  .tuple(fc.subarray([...TRAITS]), fc.subarray([...TRAITS]), fc.subarray([...TRAITS]))
  .map(([g1, g2, g3]) => stubLookups({ g1, g2, g3 }));

/** What the feasibility layer refuses, drawn before anything that must yk respect it. */
interface Feasibility {
  blocked: readonly string[];
  unreachable: readonly string[];
}

const feasibilityArb: fc.Arbitrary<Feasibility> = fc
  .tuple(fc.subarray([...TRAITS]), fc.subarray([...GODS]))
  .map(([blocked, unreachable]) => ({ blocked, unreachable }));

function rulesFor(feasibility: Feasibility): GameRules {
  return stubRules({
    blocked: new Map<string, Reason>(
      feasibility.blocked.map((trait) => [trait, { kind: "banned", trait }] as const),
    ),
    unreachableGods: new Set(feasibility.unreachable),
  });
}

/**
 * A run and a further acquisition.
 *
 * **The acquisition is drawn so the feasibility layer permits it**: nothing
 * banned is acquired, and no god that can't enter the pool is added to it.
 * Without that, the property is simply well false. A generator free to
 * "acquire" a banned trait describes a step the rules say literally can't be
 * taken, and after such a step an impossible branch erm well climbs back to
 * pending (the dead branch rejoins an any-of residual & the residual ermmm
 * grows o_0). Elements need no such guard anymore: they have no feasibility
 * verdict left to respect, so any gain is a step the rules permit.
 *
 * **What the run already holds is deliberately not constrained that way.** Run
 * may hold a trait the feasibility layer now blocks, or have a god pooled that
 * couldn't currently enter the pool. Those states are in fact reachable in prod
 * (evaluation runs on effective facts, & the override layer can set one w/o the
 * other) and they're the only states that distinguish "satisfaction is checked
 * before feasibility" from the reverse ordering. Ruling them out costs the
 * suite precisely that distinction, and also gets literally nothing back since
 * what an impossible answer "turns on" never depends on the holding, so
 * monotonicity, the residual fixpoint, residual soundness, &
 * satisfied-stability were each measured to hold w/o it.
 *
 * (Monotonicity is still a claim about evaluation under acquisition, never like
 * a promise about the sequence of states a player sees.)
 */
const worldArb = feasibilityArb.chain((feasibility) => {
  const obtainable = TRAITS.filter((trait) => !feasibility.blocked.includes(trait));
  const reachable = GODS.filter((god) => !feasibility.unreachable.includes(god));

  const levelled = (traits: readonly string[]) =>
    fc
      .tuple(...traits.map(() => fc.integer({ min: 1, max: 3 })))
      .map((levels) => traits.map((trait, i) => [trait, levels[i] ?? 1] as const));

  // Both halves are drawn freely now. The gain used to be clamped to what the
  // run could still reach, & w/ the ceiling gone there's nothing left to clamp
  // against: an element count only ever grows, so every gain is a step the
  // rules permit.
  const elementPlan = fc.tuple(
    ...ELEMENTS.map((element) =>
      fc
        .tuple(fc.nat({ max: 3 }), fc.nat({ max: 3 }))
        .map(([have, gain]) => [element, have, gain] as const),
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
      // Absent as well as present, bc the two cases answer differently: an
      // unselected talent is impossible for the whole run, but a source that
      // never collected the selections must read as "not yet" instead.
      fc.option(fc.subarray([...TALENTS]), { nil: undefined }),
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
        talents,
      ]) => {
        const equipped: RunFacts["equipped"] = {};
        if (keepsake !== undefined) equipped.keepsake = keepsake;
        if (aspect !== undefined) equipped.aspect = aspect;
        if (talents !== undefined) equipped.talents = new Set(talents);

        const base = makeFacts({
          held: held(...heldEntries),
          godPool: new Set(pool),
          elements: new Map<Element, number>(elements.map(([element, have]) => [element, have])),
          equipped,
        });

        const delta: Acquisition = {
          held: new Map(gainedTraits),
          godPool: new Set(gainedGods),
          elements: new Map<Element, number>(elements.map(([element, , gain]) => [element, gain])),
        };

        // Soundness needs a delta that acquires only what the run doesn't
        // already hold. Re-acquiring a held trait is a level upgrade, and back
        // when `hasBoonFrom` counted *members* that upgrade closed one of the
        // residual's counts against a baseline holding literally nothing while
        // adding no new member to the facts the residual came from. No leaf
        // counts members anymore, so the restriction may well have nothing left
        // to exclude; it's kept bc it's still a true precondition & narrowing a
        // property to prove it's now redundant is a separate job from this one.
        // Every other property is indifferent to the overlap (lol) and just
        // well keeps the free `delta` ig.
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
 * Set to be ten times the default (:cowboy: :cowboy:), mostly bc the
 * interesting cases are yk a minority of what actually gets generated (lol).
 * When measuring over 20000 scenarios, 27% came out pending, and about half of
 * that 27% described an acquisition that can actually be made (so the
 * properties that may seem angelic bc they cause problems on a pending status
 * would otherwise see a couple dozen "real" cases per run :no_mouth: :no_mouth:).
 */
const RUNS = { numRuns: 1000 };

/**
 * For the two properties whose precondition is selective enough that `RUNS`
 * still leaves them thin (:pensive: :pensive:). Both of those properties "bite"
 * only on a world that's both pending and whose generated acquisition just
 * happens to answer it (which measurement puts at roughly 7% of worlds, i.e.
 * about seventy "real" samples for every thousand runs :skull: :skull:).
 *
 * That is.. unfortunately too few for the value these two lil guys carry
 * (:pensive: :pensive:). In particular, P9's first clause is the only thing
 * in the suite bounding `unsatisfiable` from above, which is ermmm the very
 * axis a previous round of mutations survived on (oops), and P4's universal
 * form is the half that does *not* build its own witness. Raising the count
 * instead of like steering the generator towards the requirement's own ids is
 * deliberate bc the independence of the witness itself is exactly what gives
 * both their power/credibility.
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
    // Totality is a contract about any input, not only well-formed inputs. The
    // catalog build rejects this shape, so the other properties no longer draw
    // it at all; still, the engine needs to answer instead of just like throw (..lol).
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
   * The generated rules answer from the trait, god, or element asked about, and
   * never from the facts, which is what "feasibility held fixed" means (yay).
   * With facts-driven feasibility, the claim is just well false; this is
   * deliberate bc taking a blocker makes a trait impossible, taking an
   * exclusive-group member makes its siblings impossible, and filling the pool
   * can close it.
   *
   * Each of those three is asserted as a worked example whose rules *do*
   * actually read the facts; otherwise, excluding them here would mean nothing
   * checks them at all (:sparkles: :sparkles:).
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

        // Against the facts it came from it would double-count what's already
        // held (e.g. "two more Water" re-read as "two Water" when one is
        // literally in hand). (The baseline here is the run w/ nothing acquired.)
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

        // Skipped where no acquisition can actually satisfy the residual:
        // equipping a keepsake or weapon aspect (neither of which is a gain
        // the run can just yk add), and a set with too few unheld members left
        // to actually close its gap (:pensive: :pensive:).
        const delta = acquisitionFor(status.residual, facts, rules, lookups);
        fc.pre(delta !== null);
        if (delta === null) return;

        // Both halves matter here: the first proves the list really does answer
        // the residual, so the second can't just pass by asking for nothing.
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
    // rules `evaluate` does (i.e. held before feasibility, nothing banned
    // acquired) so any shared misreading would pass both (:pensive: :pensive:).
    // This states the invariant as a universal instead; whatever the
    // generator hands over, if it answers the residual then it answers the
    // requirement. This is where the property's ability to catch an
    // under-stated residual actually shows itself (:triumph: :triumph:).
    //
    // The growth is strict bc a delta re-naming a held trait falsifies the
    // claim for the set-shaped atoms w/o either side being wrong.
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
    // t2 leaves the any-of, which is satisfied by t1, but is still included in
    // the residual bc the second node separately asks for it in its own right.
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
      planned: new Set(planned),
      notes: note === undefined ? new Map() : new Map(planned.map((trait) => [trait, note])),
    }));

  it("evaluates two runs differing only in intent identically", () => {
    fc.assert(
      fc.property(worldArb, intentArb, intentArb, ({ req, facts, rules, lookups }, one, two) => {
        // The guarantee here is structural: evaluation is given facts and
        // never the whole run state, so intent isn't even in scope to be read.
        // This asserts the seam hasn't been widened/strengthened.
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
        // requirement is *met* is a question about literally just the facts.
        // A run that holds a trait the layer now blocks or has a god pooled
        // that couldn't enter the pool today still meets a requirement
        // naming them. Also, it's only in that kind of run where the two
        // orderings give different answers (which is why the generator is yk
        // free to produce one).
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
        // off a run that was still winnable, whereas a false "not yet" costs
        // only a lil hint. Every other invariant here bounds impossible from below.
        expect(before.kind).not.toBe("unsatisfiable");

        // Also, the residual asked for no *more* than this acquisition supplied.
        // Since the acquisition is drawn by the generator instead of derived
        // from the residual, it's an independent witness. This means a residual
        // inflated past the shortfall still passes soundness (which only ever
        // asks whether the residual is enough) but actually fails here.
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
