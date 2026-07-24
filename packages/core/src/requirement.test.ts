import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Element, Requirement } from "./index.js";

/**
 * The evaluator is not written yet, so there is no evaluation behaviour to
 * test. Two things already are testable, and both guard real regressions:
 *
 *  1. **Totality of the union** — the precondition the evaluator's own totality
 *     will rest on. `kindOf` declares a return type and has no default case, so
 *     removing a member of `Requirement`, or adding one without handling it,
 *     fails `npm run typecheck`. That compile failure *is* the failure path
 *     here.
 *  2. **The generator wiring** the property suite will be built on, including
 *     recursion through `all` and `anyOf`.
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
  "aspectIn",
] as const;

type Kind = (typeof KINDS)[number];

/** Exhaustive by construction: no default case. */
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
    case "aspectIn":
      return "aspectIn";
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
  ["aspectIn", { kind: "aspectIn", aspects: ["AspectOfSelene"] }],
];

const identifier = fc.string({ minLength: 1 });
const count = fc.integer({ min: 1, max: 4 });
const element: fc.Arbitrary<Element> = fc.constantFrom("Air", "Water", "Earth", "Fire", "Aether");

/** `minLevel` is built by hand so the key is genuinely absent, not `undefined`. */
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
    kind: fc.constant("aspectIn" as const),
    aspects: fc.array(identifier, { minLength: 1, maxLength: 3 }),
  }),
);

export const requirementArb: fc.Arbitrary<Requirement> = fc.letrec<{ requirement: Requirement }>(
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
    // Degenerate but representable. What they evaluate to is the evaluator's
    // problem; the type must not exclude them.
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
