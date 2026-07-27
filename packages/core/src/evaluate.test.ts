import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate.js";
import type { GameRules, Reason, Requirement, RunFacts } from "./index.js";
import { held, makeFacts, stubLookups, stubRules } from "./test-support.js";

/**
 * The worked examples: one scenario per branch of the evaluation contract
 * (yippee), plus any cases where two decisions interact w/ each other. The
 * property suite goes right alongside this as it covers the actual invariants
 * while this test suite covers the "answers" (i.e. the property suite asserts
 * P1–P9 over *generated* worlds as relationships that hold no matter what
 * player draws instead of a specific answer). Both are needed bc the property
 * suite can still pass while evaluate returns ermmm
 * "systematically-wrong-but-internally-consistent" answers (so worked examples
 * are needed to catch those), and the example suite alone can't cover the yk
 * entire input space lol (so property suite is needed to cover that).
 */

const NO_LOOKUPS = stubLookups();

/** Feasibility that depends on the run: the case that releases when a boon is purged. */
const blockerRules: GameRules = {
  ...stubRules(),
  isBlocked: (trait, facts) =>
    trait === "A" && facts.held.has("B")
      ? { kind: "blockedByTrait", trait: "A", blockedBy: "B" }
      : null,
};

/**
 * Feasibility that depends on the run: the mutual-exclusion case (i.e. holding
 * any member of the group blocks every other group member)
 */
const exclusiveRules: GameRules = {
  ...stubRules(),
  isBlocked: (trait, facts) => {
    const group = ["A", "C"];
    if (!group.includes(trait)) return null;
    const sibling = group.find((member) => member !== trait && facts.held.has(member));
    return sibling === undefined
      ? null
      : { kind: "slotConflict", trait, conflictsWith: sibling, group: "CastModifiers" };
  },
};

/** Feasibility that depends on the run: the (natural) pool closes once it's full. */
const poolRules: GameRules = {
  ...stubRules(),
  canGodEnterPool: (_god, facts) => facts.godPool.size < 4,
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
    // The ban is on the facts too (to show that evaluation actually "believes"
    // what the rules say instead of likeee just ignoring the rules & directly
    // consulting the set (we're not gonna ask Parental Unit #2 the same
    // question that Parental Unit #1 already said no to -_-)).
    // The way it does this can be bit unintuitive: the test puts the ban in
    // both stubRules and makeFacts, then asserts the reason comes back.
    // Having the ban in both means a passing result is consistent w/ evaluate
    // reading the rules *or* reading facts.bans (can't tell which produced it),
    // so it doesn't "directly" show that evaluation "believes the rules";
    // instead, the discriminating test is the disagreement case (i.e. ban in
    // facts.bans, rules return null, expect pending), which fails if evaluate
    // ever "just takes a lil peek" at the set.
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
    // The group member/sibling has to actually be held for this to be the real
    // scenario, since taking one member of a mutually exclusive group is what
    // makes the others impossible & the same run before that pick just reports
    // them as pending. If this was asserted against a fixed verdict instead,
    // it would only prove that a reason can travel.
    const facts = makeFacts({ held: held("C") });
    expect(reasonOf(needsA, facts, exclusiveRules)).toEqual({
      kind: "slotConflict",
      trait: "A",
      conflictsWith: "C",
      group: "CastModifiers",
    });
  });

  it("is pending until an exclusive-group sibling is taken", () => {
    // The other half of the above case; i.e. the "decrease" case where
    // acquiring C moves A from pending to impossible. Covered here bc
    // it's deliberately not covered under monotonicity (since the generated
    // feasibility layer never actually varies w/ the run).
    expect(residualOf(needsA, makeFacts(), exclusiveRules)).toEqual(needsA);
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
    // Satisfaction is read before feasibility (this applies everywhere),
    // i.e. a boon "in hand" is considered genuinely "in hand" regardless of
    // what the feasibility layer now says about acquiring it. This is what
    // stops a requirement from basically "sliding back out" of satisfied, &
    // why only a boon purge can take it back.
    const facts = makeFacts({ held: held("A", "B") });
    expect(evaluate(needsA, facts, blockerRules, NO_LOOKUPS)).toEqual({ kind: "satisfied" });
  });

  it("becomes pending again once the blocking trait is purged", () => {
    // Feasibility is recomputed from current facts, so losing a blocker
    // releases the actual block. Also, taking the two in the other order should
    // never block anything since the check only ever looks at what's held "now".
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

  it("closes as the pool fills, which is a status going down under acquisition", () => {
    // E.g. situation: three gods are pooled and Zeus is still reachable.
    // A fourth god arrives (henlo!) and Zeus is no longer reachable (womp womp).
    // Taking a reward is considered an acquisition, so this is one of the three
    // places where acquiring something actually *lowers* a status (on purpose ofc).
    // Monotonicity holds the feasibility layer fixed specifically so it can
    // exclude them, so this is the only place the behavior is actually checked.
    const room = makeFacts({ godPool: new Set(["g1", "g2", "g3"]), progress: lateRun });
    expect(residualOf(needsZeus, room, poolRules)).toEqual(needsZeus);

    const full = makeFacts({ godPool: new Set(["g1", "g2", "g3", "g4"]), progress: lateRun });
    expect(reasonOf(needsZeus, full, poolRules)).toEqual({ kind: "godPoolFull", god: "Zeus" });
  });

  it("stays pending with no run progress, even when the rules say the pool is closed", () => {
    // Since players can still "force" gods not already in their pool even after
    // they already have four gods in the pool (& thus in most circumstances
    // won't be offered new gods via normal in-game room rewards), counting the
    // remaining regions/keepsake-equipping opportunities is the only way to
    // know if a god is genuinely unreachable. Obviously, that means we need to
    // keep track of some sort of run progress in order to actually count them.
    // Also, the UI guessing "impossible" when a god can still be "forced" is
    // likee the damaging mistake possible here (lol!), so the absence of
    // run progress outranks the answer "technically" given by the rules.
    const rules = stubRules({ unreachableGods: new Set(["Zeus"]) });
    expect(residualOf(needsZeus, makeFacts(), rules)).toEqual(needsZeus);
  });
});

describe("hasKeepsake", () => {
  const needsKeepsake: Requirement = { kind: "hasKeepsake", keepsake: "Skull" };

  it("is satisfied when equipped", () => {
    const facts = makeFacts({ equipped: { keepsake: "Skull" } });
    expect(evaluate(needsKeepsake, facts, stubRules(), NO_LOOKUPS)).toEqual({ kind: "satisfied" });
  });

  it("is pending, never impossible, when something else is equipped", () => {
    const facts = makeFacts({ equipped: { keepsake: "Shell" } });
    expect(residualOf(needsKeepsake, facts)).toEqual(needsKeepsake);
  });
});

describe("hasAspect", () => {
  const needsSelene: Requirement = { kind: "hasAspect", aspects: ["AspectOfSelene"] };

  it("is satisfied when the equipped aspect is one of them", () => {
    const facts = makeFacts({ equipped: { aspect: "AspectOfSelene" } });
    expect(evaluate(needsSelene, facts, stubRules(), NO_LOOKUPS)).toEqual({ kind: "satisfied" });
  });

  it("is impossible when another aspect is equipped", () => {
    // Since weapon aspect is chosen before the run starts & can't be swapped
    // mid-run, this is literally structurally impossible instead of always
    // showing as "not yet". The reason doesn't carry a trait bc a requirement
    // only knows the equipped aspect is wrong, not which specific boon wanted it.
    const facts = makeFacts({ equipped: { aspect: "AspectOfZagreus" } });
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
    // Here, `needed` is yk the whole requirement instead of the shortfall, so it
    // can just be read against the ceiling directly.
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
    // w/o the two counts, the UI can only say "impossible" for a group that
    // in actuality may have just been a single pick short.
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
    // more" to report (those two fields belong to groups that were a pick short).
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

  it("is still pending when exactly as many branches remain as are needed", () => {
    // This is the boundary the likee "shortfall check" sits on,
    // i.e. two are needed & two are still open (so there's no real slack at all).
    // A group isn't actually impossible until it is genuinely a branch short of
    // what's needed, and mistakenly reporting a group as impossible when in
    // actuality it's just tight/has v little leeway would misreport/write off a
    // run that can still be completed by taking all remaining branches.
    const rules = stubRules({ blocked: new Map([["C", { kind: "banned", trait: "C" }]]) });
    expect(residualOf(twoOfThree, makeFacts(), rules)).toEqual({
      kind: "anyOf",
      min: 2,
      of: [a, b],
    });
  });

  it("keeps the shortfall context when too few branches remain", () => {
    const rules = stubRules({
      blocked: new Map<string, Reason>([
        ["B", { kind: "banned", trait: "B" }],
        ["C", { kind: "banned", trait: "C" }],
      ]),
    });
    const facts = makeFacts();
    // One alternative is still pending, so this group was one pick short of
    // possible (ope); the UI shouldn't render this as just a flat impossible.
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
