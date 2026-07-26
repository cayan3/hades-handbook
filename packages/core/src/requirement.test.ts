import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Element, Requirement } from "./index.js";

/**
 * Shape-level guards over the requirement union, independent of evaluation.
 *
 * A less fancy-pants way to say that is: This file tests the type, not the
 * behavior. It never calls evaluate; it asks only whether every shape in
 * Requirement exists and is recognized as a genuinely valid shape.
 *
 * **Totality of the union** is the precondition the evaluator's own totality
 * rests on, and it's worth asserting separately from the evaluator. (i.e. P1
 * says evaluate handles every shape & never throws :triumph: :triumph:, which
 * is only a valuable claim if we know what "every shape" is; this file does
 * that by fixing nine kinds of shapes hehe so P1 has something to actually be
 * total over :triumph: :triumph:.) Also, `kindOf`declares a return type and
 * switches over all nine kinds of shapes w/o any default case, so removing a
 * member of `Requirement` or adding one w/o actually handling it means `kindOf`
 * stops returning its declared type, which would fail `npm run typecheck`.
 * The test doesn't fail by asserting, it fails by ermmm.. not compiling at
 * all.. :grimacing: :grimacing: which is still better than not failing at all.
 *
 * The generator below draws free-form ids deliberately (insert Hades' line in
 * Hades II abt how the last time he drew lots was (surprise!) also how he ended
 * up being in charge of all the dead people :skull: :skull: (update: I found it
 * (i'm brainrotted): "Drawing lots is how I wound up in this realm, and is not
 * something I have done again." :pensive: :pensive: poor guy) (as a bonus,
 * Zag in Hades I says "I'm not the one who drew the short lot w/ your brothers
 * & got stuck here forever!" :no_mouth: :no_mouth: I mean he's not yk wrong??))
 * This is fine here bc the generator's job is to reach every shape at every
 * nesting depth (what a chad), and it doesn't really care what anything is
 * called (i.e. ids are never actuallly looked up). The property/invariant suite
 * deliberately doesn't reuse it bc P1-P9 need the requirement & the facts to yk
 * refer to the same things (& w/ free-form ids there would basically be a
 * bajillion generated hasTrait's w/ names the run has literally never heard of
 * (cue "I'm sorry do I know you" meme), so the entire suite would pass w/o
 * actually erm testing anything rip). Instead, properties.test.ts defines its
 * own generator over a small fixed pool of ids (yippee).
 */

const KINDS = [
  "all",
  "anyOf",
  "hasTrait",
  "hasSet",
  "hasBoonFrom",
  "hasElement",
  "godInPool",
  "hasKeepsake",
  "hasAspect",
] as const;

type Kind = (typeof KINDS)[number];

/** This is exhaustive by construction, so there's no "default" case. */
function kindOf(req: Requirement): Kind {
  switch (req.kind) {
    case "all":
      return "all";
    case "anyOf":
      return "anyOf";
    case "hasTrait":
      return "hasTrait";
    case "hasSet":
      return "hasSet";
    case "hasBoonFrom":
      return "hasBoonFrom";
    case "hasElement":
      return "hasElement";
    case "godInPool":
      return "godInPool";
    case "hasKeepsake":
      return "hasKeepsake";
    case "hasAspect":
      return "hasAspect";
  }
}

const SAMPLES: ReadonlyArray<readonly [Kind, Requirement]> = [
  ["all", { kind: "all", of: [{ kind: "godInPool", god: "ZeusUpgrade" }] }],
  ["anyOf", { kind: "anyOf", min: 1, of: [{ kind: "hasTrait", trait: "ZeusShoutTrait" }] }],
  ["hasTrait", { kind: "hasTrait", trait: "ZeusBonusBounceTrait", minLevel: 2 }],
  ["hasSet", { kind: "hasSet", set: "HestiaCoreTraits", count: 2 }],
  ["hasBoonFrom", { kind: "hasBoonFrom", god: "HeraUpgrade", count: 1 }],
  ["hasElement", { kind: "hasElement", element: "Fire", count: 3 }],
  ["godInPool", { kind: "godInPool", god: "PoseidonUpgrade" }],
  ["hasKeepsake", { kind: "hasKeepsake", keepsake: "ZeusKeepsake" }],
  ["hasAspect", { kind: "hasAspect", aspects: ["AspectOfSelene"] }],
];

const identifier = fc.string({ minLength: 1 });
const count = fc.integer({ min: 1, max: 4 });
const element: fc.Arbitrary<Element> = fc.constantFrom("Air", "Water", "Earth", "Fire", "Aether");

/** `minLevel` is built by hand, so the key is like genuinely absent (not just `undefined`). */
const hasTrait: fc.Arbitrary<Requirement> = fc
  .tuple(identifier, fc.option(fc.integer({ min: 1, max: 3 }), { nil: undefined }))
  .map(([trait, minLevel]) =>
    minLevel === undefined
      ? { kind: "hasTrait", trait }
      : { kind: "hasTrait", trait, minLevel },
  );

const leaf: fc.Arbitrary<Requirement> = fc.oneof(
  hasTrait,
  fc.record({ kind: fc.constant("hasSet" as const), set: identifier, count }),
  fc.record({ kind: fc.constant("hasBoonFrom" as const), god: identifier, count }),
  fc.record({ kind: fc.constant("hasElement" as const), element, count }),
  fc.record({ kind: fc.constant("godInPool" as const), god: identifier }),
  fc.record({ kind: fc.constant("hasKeepsake" as const), keepsake: identifier }),
  fc.record({
    kind: fc.constant("hasAspect" as const),
    aspects: fc.array(identifier, { minLength: 1, maxLength: 3 }),
  }),
);

const requirementArb: fc.Arbitrary<Requirement> = fc.letrec<{ requirement: Requirement }>(
  (tie) => ({
    requirement: fc.oneof(
      { maxDepth: 3 },
      leaf,
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
  }),
).requirement;

describe("Requirement", () => {
  it.each(SAMPLES)("handles the %s shape", (expected, req) => {
    expect(kindOf(req)).toBe(expected);
  });

  it("covers every kind in the union", () => {
    expect(SAMPLES.map(([kind]) => kind).sort()).toEqual([...KINDS].sort());
  });

  it("handles empty combinators", () => {
    // Degenerate but representable anyway. What these evaluate to is the
    // evaluator's problem (*pat pat*); the type must not just exclude them.
    expect(kindOf({ kind: "all", of: [] })).toBe("all");
    expect(kindOf({ kind: "anyOf", min: 1, of: [] })).toBe("anyOf");
  });

  it("accounts for every generated shape, at every nesting depth", () => {
    fc.assert(
      fc.property(requirementArb, (req) => {
        expect([...KINDS]).toContain(kindOf(req));
      }),
    );
  });
});
