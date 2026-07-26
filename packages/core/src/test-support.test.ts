import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate.js";
import type { Requirement } from "./index.js";
import {
  acquisitionFor,
  applyAcquisition,
  held,
  makeFacts,
  residualCost,
  stubLookups,
  stubRules,
  zeroBaseline,
} from "./test-support.js";

/**
 * What the property suite measures against.
 *
 * Has its own tests here since measuring the property suite against untested
 * standards would be yk bad (like "moving goalposts" but instead of good
 * goalposts "simply moving", they're literally just bad goalposts in the first
 * place rip).
 *
 * A residual is judged by two things the suite supplies instead of derives: the
 * acquisition that should satisfy it, and the size it should shrink. An
 * error in either of these doesn't fail loudly, instead just quietly weakening
 * anything that consumes it. The cases below are the ones where each
 * previously disagreed w/ what evaluation actually does.
 */

const rules = stubRules();

describe("acquisitionFor", () => {
  it("keeps a failed branch out of the list", () => {
    const req: Requirement = {
      kind: "anyOf",
      min: 1,
      of: [
        {
          kind: "all",
          of: [
            { kind: "hasTrait", trait: "t1" },
            { kind: "hasKeepsake", keepsake: "k1" },
          ],
        },
        { kind: "hasTrait", trait: "t2" },
      ],
    };
    const delta = acquisitionFor(req, makeFacts(), rules, stubLookups());
    expect([...(delta?.held.keys() ?? [])]).toEqual(["t2"]);
  });

  it("closes two sets that share a member by acquiring it once", () => {
    const shared = stubLookups({ s1: ["m1"], s2: ["m1"] });
    const req: Requirement = {
      kind: "all",
      of: [
        { kind: "hasSet", set: "s1", count: 1 },
        { kind: "hasSet", set: "s2", count: 1 },
      ],
    };
    const facts = makeFacts();
    const delta = acquisitionFor(req, facts, rules, shared);
    expect(delta).not.toBeNull();
    if (delta === null) return;
    expect([...delta.held.keys()]).toEqual(["m1"]);
    expect(evaluate(req, applyAcquisition(facts, delta), rules, shared).kind).toBe("satisfied");
  });

  it("expresses a level upgrade rather than refusing it", () => {
    const facts = makeFacts({ held: held(["t1", 1]) });
    const req: Requirement = { kind: "hasTrait", trait: "t1", minLevel: 3 };
    const status = evaluate(req, facts, rules, stubLookups());
    expect(status.kind).toBe("pending");
    if (status.kind !== "pending") return;

    const delta = acquisitionFor(status.residual, facts, rules, stubLookups());
    expect(delta).not.toBeNull();
    if (delta === null) return;

    expect(
      evaluate(status.residual, applyAcquisition(zeroBaseline(facts), delta), rules, stubLookups())
        .kind,
    ).toBe("satisfied");
    expect(evaluate(req, applyAcquisition(facts, delta), rules, stubLookups()).kind).toBe(
      "satisfied",
    );
  });

  it("still refuses what the feasibility layer refuses", () => {
    const banned = stubRules({ blocked: new Map([["t1", { kind: "banned", trait: "t1" }]]) });
    expect(
      acquisitionFor({ kind: "hasTrait", trait: "t1" }, makeFacts(), banned, stubLookups()),
    ).toBeNull();
  });

  it("does not under-acquire a set whose members are partly held", () => {
    const lookups = stubLookups({ s1: ["m1", "m2", "m3"] });
    const facts = makeFacts({ held: held("m1") });
    const req: Requirement = { kind: "hasSet", set: "s1", count: 2 };
    const status = evaluate(req, facts, rules, lookups);
    if (status.kind !== "pending") throw new Error("setup");
    const delta = acquisitionFor(status.residual, facts, rules, lookups);
    expect(delta).not.toBeNull();
    if (delta === null) return;
    // must acquire a genuinely new member, not just count the one already held
    expect(delta.held.size).toBe(1);
    expect(
      evaluate(status.residual, applyAcquisition(zeroBaseline(facts), delta), rules, lookups).kind,
    ).toBe("satisfied");
    expect(evaluate(req, applyAcquisition(facts, delta), rules, lookups).kind).toBe("satisfied");
  });
});

describe("residualCost", () => {
  const lookups = stubLookups({ s1: ["m1", "m2", "m3"] });
  const req: Requirement = {
    kind: "anyOf",
    min: 1,
    of: [
      { kind: "hasTrait", trait: "t1" },
      { kind: "hasSet", set: "s1", count: 3 },
    ],
  };

  /**
   * Situation: one branch of two dies. In this case, the residual keeps
   * the same `min` and loses the cheap branch, so the run is strictly worse
   * off (rip). The measure itself has to literally say so; otherwise, a
   * widened/strengthened monotonicity claim would just pass straight through this.
  */
  it("does not read a branch going impossible as progress", () => {
    const open = evaluate(req, makeFacts(), rules, lookups);
    const narrowed = evaluate(
      req,
      makeFacts(),
      stubRules({ blocked: new Map([["t1", { kind: "banned", trait: "t1" }]]) }),
      lookups,
    );
    if (open.kind !== "pending" || narrowed.kind !== "pending") throw new Error("setup");

    expect(residualCost(open.residual)).toBe(1);
    expect(residualCost(narrowed.residual)).toBe(3);
  });

  it("falls as a count is paid down", () => {
    const facts = makeFacts({ held: held("m1") });
    const status = evaluate({ kind: "hasSet", set: "s1", count: 3 }, facts, rules, lookups);
    if (status.kind !== "pending") throw new Error("setup");
    expect(residualCost(status.residual)).toBe(2);
  });
});
