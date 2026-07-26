import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate.js";
import type { GameRules, Reason, Requirement, RunFacts } from "./index.js";
import { held, makeFacts, stubLookups, stubRules } from "./test-support.js";

/**
 * The worked examples: one scenario per branch of the evaluation contract, plus
 * the cases where two decisions interact. The generated property suite lives
 * alongside this and covers the invariants; these cover the answers.
 */

const NO_LOOKUPS = stubLookups();

/** Feasibility that depends on the run — the case that releases when a boon is purged. */
const blockerRules: GameRules = {
  ...stubRules(),
  isBlocked: (trait, facts) =>
    trait === "A" && facts.held.has("B")
      ? { kind: "blockedByTrait", trait: "A", blockedBy: "B" }
      : null,
};

function reasonOf(req: Requirement, facts: RunFacts, rules = stubRules(), lookups = NO_LOOKUPS) {
  const status = evaluate(req, facts, rules, lookups);
  if (status.kind !== "unsatisfiable") throw new Error(`expected unsatisfiable, got ${status.kind}`);
  return status.reason;
}

function residualOf(req: Requirement, facts: RunFacts, rules = stubRules(), lookups = NO_LOOKUPS) {
  const status = evaluate(req, facts, rules, lookups);
  if (status.kind !== "pending") throw new Error(`expected pending, got ${status.kind}`);
  return status.residual;
}

describe("hasTrait", () => {
  const needsA: Requirement = { kind: "hasTrait", trait: "A" };
  const needsAAtThree: Requirement = { kind: "hasTrait", trait: "A", minLevel: 3 };

  it("is satisfied when the trait is held", () => {
    const facts = makeFacts({ held: held("A") });
    expect(evaluate(needsA, facts, stubRules(), NO_LOOKUPS)).toEqual({ kind: "satisfied" });
  });

  it("is satisfied when the trait is held above the level asked for", () => {
    const facts = makeFacts({ held: held(["A", 4]) });
    expect(evaluate(needsAAtThree, facts, stubRules(), NO_LOOKUPS)).toEqual({ kind: "satisfied" });
  });

  it("is pending when the trait is held below the level asked for", () => {
    const facts = makeFacts({ held: held(["A", 1]) });
    expect(residualOf(needsAAtThree, facts)).toEqual(needsAAtThree);
  });

  it("is pending when the trait is simply not held yet", () => {
    expect(residualOf(needsA, makeFacts())).toEqual(needsA);
  });

  it("reports a ban through the feasibility layer rather than reading bans itself", () => {
    const banned: Reason = { kind: "banned", trait: "A" };
    const rules = stubRules({ blocked: new Map([["A", banned]]) });
    // The ban is on the facts too, to show that evaluation takes the rules'
    // word for it rather than consulting the set directly.
    const facts = makeFacts({ bans: new Set(["A"]) });
    expect(reasonOf(needsA, facts, rules)).toEqual(banned);
  });

  it("reports a god that cannot reach the pool as the reason the trait cannot", () => {
    const excluded: Reason = { kind: "godExcluded", god: "Hades" };
    const rules = stubRules({ blocked: new Map([["A", excluded]]) });
    expect(reasonOf(needsA, makeFacts(), rules)).toEqual(excluded);
  });

  it("reports an occupied slot", () => {
    const conflict: Reason = { kind: "slotConflict", trait: "A", conflictsWith: "B" };
    const rules = stubRules({ blocked: new Map([["A", conflict]]) });
    expect(reasonOf(needsA, makeFacts(), rules)).toEqual(conflict);
  });

  it("reports a held member of the same exclusive group", () => {
    const conflict: Reason = {
      kind: "slotConflict",
      trait: "A",
      conflictsWith: "C",
      group: "CastModifiers",
    };
    const rules = stubRules({ blocked: new Map([["A", conflict]]) });
    expect(reasonOf(needsA, makeFacts(), rules)).toEqual(conflict);
  });

  it("is impossible while the blocking trait is held", () => {
    const facts = makeFacts({ held: held("B") });
    expect(reasonOf(needsA, facts, blockerRules)).toEqual({
      kind: "blockedByTrait",
      trait: "A",
      blockedBy: "B",
    });
  });

  it("stays satisfied when a trait already held becomes blocked", () => {
    // Satisfaction is read before feasibility, everywhere. A boon in hand is in
    // hand whatever the feasibility layer now says about acquiring it — which is
    // what stops a requirement sliding back out of satisfied, and is why only a
    // purge can take it back.
    const facts = makeFacts({ held: held("A", "B") });
    expect(evaluate(needsA, facts, blockerRules, NO_LOOKUPS)).toEqual({ kind: "satisfied" });
  });

  it("becomes pending again once the blocking trait is purged", () => {
    // Feasibility is recomputed from current facts, so losing the blocker
    // releases the block — and taking the two in the other order never blocks
    // anything, since the check only ever looks at what is held now.
    expect(residualOf(needsA, makeFacts(), blockerRules)).toEqual(needsA);
  });
});

describe("godInPool", () => {
  const needsZeus: Requirement = { kind: "godInPool", god: "Zeus" };
  const lateRun = { region: 4, chamber: 30 };

  it("is satisfied when the god is in the pool", () => {
    const facts = makeFacts({ godPool: new Set(["Zeus"]), progress: lateRun });
    expect(evaluate(needsZeus, facts, stubRules(), NO_LOOKUPS)).toEqual({ kind: "satisfied" });
  });

  it("is pending while the god can still be pulled in", () => {
    const facts = makeFacts({ progress: lateRun });
    expect(residualOf(needsZeus, facts)).toEqual(needsZeus);
  });

  it("is impossible once no keepsake opportunity remains", () => {
    const facts = makeFacts({ progress: lateRun });
    const rules = stubRules({ unreachableGods: new Set(["Zeus"]) });
    expect(reasonOf(needsZeus, facts, rules)).toEqual({ kind: "godPoolFull", god: "Zeus" });
  });

  it("stays pending with no run progress, even when the rules say the pool is closed", () => {
    // Counting the remaining keepsake opportunities is the only way to know a
    // god is genuinely unreachable, and without progress we cannot count them.
    // Guessing "impossible" is the most damaging mistake available here, so the
    // absence of progress outranks the rules' answer.
    const rules = stubRules({ unreachableGods: new Set(["Zeus"]) });
    expect(residualOf(needsZeus, makeFacts(), rules)).toEqual(needsZeus);
  });
});

describe("hasKeepsake", () => {
  const needsKeepsake: Requirement = { kind: "hasKeepsake", keepsake: "Skull" };

  it("is satisfied when equipped", () => {
    const facts = makeFacts({ loadout: { keepsake: "Skull" } });
    expect(evaluate(needsKeepsake, facts, stubRules(), NO_LOOKUPS)).toEqual({ kind: "satisfied" });
  });

  it("is pending, never impossible, when something else is equipped", () => {
    const facts = makeFacts({ loadout: { keepsake: "Shell" } });
    expect(residualOf(needsKeepsake, facts)).toEqual(needsKeepsake);
  });
});

describe("aspectIn", () => {
  const needsSelene: Requirement = { kind: "aspectIn", aspects: ["AspectOfSelene"] };

  it("is satisfied when the equipped aspect is one of them", () => {
    const facts = makeFacts({ loadout: { aspect: "AspectOfSelene" } });
    expect(evaluate(needsSelene, facts, stubRules(), NO_LOOKUPS)).toEqual({ kind: "satisfied" });
  });

  it("is impossible when another aspect is equipped", () => {
    // The aspect is chosen when the run starts and cannot be swapped, so this is
    // structural rather than "not yet". The reason carries no trait: a
    // requirement knows the equipped aspect is wrong, not which boon wanted it.
    const facts = makeFacts({ loadout: { aspect: "AspectOfZagreus" } });
    expect(reasonOf(needsSelene, facts)).toEqual({
      kind: "aspectConflict",
      aspect: "AspectOfZagreus",
    });
  });

  it("is pending when no aspect is known", () => {
    expect(residualOf(needsSelene, makeFacts())).toEqual(needsSelene);
  });
});

describe("hasElement", () => {
  const needsThreeWater: Requirement = { kind: "hasElement", element: "Water", count: 3 };

  it("is satisfied at the threshold", () => {
    const facts = makeFacts({ elements: new Map([["Water", 3] as const]) });
    expect(evaluate(needsThreeWater, facts, stubRules(), NO_LOOKUPS)).toEqual({ kind: "satisfied" });
  });

  it("asks only for the shortfall", () => {
    const facts = makeFacts({ elements: new Map([["Water", 1] as const]) });
    expect(residualOf(needsThreeWater, facts)).toEqual({
      kind: "hasElement",
      element: "Water",
      count: 2,
    });
  });

  it("is impossible when the run cannot reach the threshold", () => {
    const facts = makeFacts({ elements: new Map([["Water", 1] as const]) });
    const rules = stubRules({ ceilings: new Map([["Water", 2] as const]) });
    // `needed` is the whole requirement rather than the shortfall, so it can be
    // read against the ceiling directly.
    expect(reasonOf(needsThreeWater, facts, rules)).toEqual({
      kind: "elementCeiling",
      element: "Water",
      needed: 3,
      max: 2,
    });
  });
});

describe("hasSet", () => {
  const core = { CoreTraits: ["m1", "m2", "m3"] };
  const needsTwo: Requirement = { kind: "hasSet", set: "CoreTraits", count: 2 };
  const lookups = stubLookups(core);

  it("is satisfied once enough members are held", () => {
    const facts = makeFacts({ held: held("m1", "m2") });
    expect(evaluate(needsTwo, facts, stubRules(), lookups)).toEqual({ kind: "satisfied" });
  });

  it("asks only for the shortfall", () => {
    const facts = makeFacts({ held: held("m1") });
    expect(residualOf(needsTwo, facts, stubRules(), lookups)).toEqual({
      kind: "hasSet",
      set: "CoreTraits",
      count: 1,
    });
  });

  it("keeps the shortfall context when too few members are left", () => {
    const facts = makeFacts({ held: held("m1") });
    const rules = stubRules({
      blocked: new Map<string, Reason>([
        ["m2", { kind: "banned", trait: "m2" }],
        ["m3", { kind: "banned", trait: "m3" }],
      ]),
    });
    // Without the two counts the UI can only say "impossible" for a group that
    // may have been a single pick short.
    expect(reasonOf(needsTwo, facts, rules, lookups)).toEqual({
      kind: "composite",
      reasons: [
        { kind: "banned", trait: "m2" },
        { kind: "banned", trait: "m3" },
      ],
      needed: 1,
      pendingAlternatives: 0,
    });
  });

  it("counts a member that is merely unheld as still reachable", () => {
    const facts = makeFacts({ held: held("m1") });
    const rules = stubRules({ blocked: new Map([["m2", { kind: "banned", trait: "m2" }]]) });
    expect(residualOf(needsTwo, facts, rules, lookups)).toEqual({
      kind: "hasSet",
      set: "CoreTraits",
      count: 1,
    });
  });
});

describe("hasBoonFrom", () => {
  const lookups = stubLookups({}, { Hera: ["hera1", "hera2"] });
  const needsOne: Requirement = { kind: "hasBoonFrom", god: "Hera", count: 1 };

  it("is satisfied when one of the god's boons is held", () => {
    const facts = makeFacts({ held: held("hera2") });
    expect(evaluate(needsOne, facts, stubRules(), lookups)).toEqual({ kind: "satisfied" });
  });

  it("is pending while the god's boons are still reachable", () => {
    expect(residualOf(needsOne, makeFacts(), stubRules(), lookups)).toEqual(needsOne);
  });
});

describe("all", () => {
  const x: Requirement = { kind: "hasTrait", trait: "X" };
  const y: Requirement = { kind: "hasTrait", trait: "Y" };
  const both: Requirement = { kind: "all", of: [x, y] };

  it("is satisfied when every child is", () => {
    const facts = makeFacts({ held: held("X", "Y") });
    expect(evaluate(both, facts, stubRules(), NO_LOOKUPS)).toEqual({ kind: "satisfied" });
  });

  it("drops the satisfied children from the residual", () => {
    const facts = makeFacts({ held: held("X") });
    expect(residualOf(both, facts)).toEqual({ kind: "all", of: [y] });
  });

  it("is impossible when any child is, and reports no shortfall", () => {
    const rules = stubRules({ blocked: new Map([["Y", { kind: "banned", trait: "Y" }]]) });
    const facts = makeFacts({ held: held("X") });
    // An `all` whose children failed for unrelated reasons has no "how many
    // more" to report — those two fields belong to groups that were a pick short.
    expect(reasonOf(both, facts, rules)).toEqual({
      kind: "composite",
      reasons: [{ kind: "banned", trait: "Y" }],
    });
  });

  it("is satisfied when it asks for nothing", () => {
    expect(evaluate({ kind: "all", of: [] }, makeFacts(), stubRules(), NO_LOOKUPS)).toEqual({
      kind: "satisfied",
    });
  });
});

describe("anyOf", () => {
  const a: Requirement = { kind: "hasTrait", trait: "A" };
  const b: Requirement = { kind: "hasTrait", trait: "B" };
  const c: Requirement = { kind: "hasTrait", trait: "C" };
  const oneOfThree: Requirement = { kind: "anyOf", min: 1, of: [a, b, c] };
  const twoOfThree: Requirement = { kind: "anyOf", min: 2, of: [a, b, c] };

  it("is pending with every branch open", () => {
    expect(residualOf(oneOfThree, makeFacts())).toEqual(oneOfThree);
  });

  it("collapses to satisfied as soon as one branch lands", () => {
    const facts = makeFacts({ held: held("B") });
    expect(evaluate(oneOfThree, facts, stubRules(), NO_LOOKUPS)).toEqual({ kind: "satisfied" });
  });

  it("counts down the minimum and drops the branch that landed", () => {
    const facts = makeFacts({ held: held("A") });
    expect(residualOf(twoOfThree, facts)).toEqual({ kind: "anyOf", min: 1, of: [b, c] });
  });

  it("keeps the shortfall context when too few branches remain", () => {
    const rules = stubRules({
      blocked: new Map<string, Reason>([
        ["B", { kind: "banned", trait: "B" }],
        ["C", { kind: "banned", trait: "C" }],
      ]),
    });
    const facts = makeFacts();
    // One alternative is still merely pending, so this group was one pick short
    // of possible — the case the UI must never render as a flat impossible.
    expect(reasonOf(twoOfThree, facts, rules)).toEqual({
      kind: "composite",
      reasons: [
        { kind: "banned", trait: "B" },
        { kind: "banned", trait: "C" },
      ],
      needed: 2,
      pendingAlternatives: 1,
    });
  });
});
