import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate.js";
import type { Requirement } from "./index.js";
import {
  acquisitionFor,
  applyAcquisition,
  held,
  makeFacts,
  stubLookups,
  stubRules,
  zeroBaseline,
} from "./test-support.js";

/**
 * The acquisition oracle, under test in its own right.
 *
 * `acquisitionFor` is what the residual properties measure a residual against,
 * so an error in it does not fail loudly — it quietly weakens whatever consumes
 * it. The cases below are the ones where it previously disagreed with what
 * evaluation actually does.
 */

const rules = stubRules();

describe("acquisitionFor", () => {
  it("L1: a failed branch contributes nothing", () => {
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

  it("L2: two sets sharing a member are closed by acquiring it once", () => {
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

  it("M2: a level upgrade is expressible, and satisfies both P4 halves", () => {
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
    // must acquire a NEW member, not count the held one
    expect(delta.held.size).toBe(1);
    expect(
      evaluate(status.residual, applyAcquisition(zeroBaseline(facts), delta), rules, lookups).kind,
    ).toBe("satisfied");
    expect(evaluate(req, applyAcquisition(facts, delta), rules, lookups).kind).toBe("satisfied");
  });
});
