import { type TraitRecord, poolGods, traitsFor } from "@repo/catalog";
import type { HeldTrait, RunFacts, TraitId } from "@repo/core";
import { describe, expect, it } from "vitest";
import { type RulesCatalog, createRules, shippedCatalog } from "./index.js";

/**
 * Two halves, testing two different things.
 *
 * The synthetic half states one small world per rule, so a verdict can be read
 * straight off the test instead of looked up in six hundred records. The
 * shipped half asks whether the rules fire on the data the game really ships. A
 * synthetic world cannot answer that, and it is the question this seam kept
 * failing quietly: the aspect conflicts below sat for a whole session in a field
 * that could never match them, and nothing went red.
 */

function facts(over: Partial<RunFacts> = {}): RunFacts {
  return {
    game: "hades2",
    dataVersion: "test",
    held: new Map(),
    godPool: new Set(),
    elements: new Map(),
    slots: new Map(),
    equipped: {},
    resources: new Map(),
    bans: new Set(),
    ...over,
  };
}

function held(...traits: readonly TraitId[]): Map<TraitId, HeldTrait> {
  return new Map(traits.map((trait) => [trait, { rarity: "Common", level: 1 } as HeldTrait]));
}

function record(over: Partial<TraitRecord> & { id: TraitId }): TraitRecord {
  return {
    god: null,
    godKind: null,
    name: null,
    descriptionRef: null,
    icon: null,
    boonCategory: "StandardOlympian",
    slot: null,
    rarity: [],
    duoGods: null,
    exclusiveGroup: null,
    elementAffinity: null,
    prereq: null,
    prereqSource: null,
    tier: null,
    blockedBy: null,
    activation: null,
    aspectConflicts: null,
    source: "test",
    ...over,
  };
}

/**
 * Even in the synthetic world, the pool half of the catalog is the real one.
 * The gods named below are this game's gods, and which of them hold a pool slot
 * is the fact the cap is counted over — not something a test should be
 * inventing.
 */
function world(records: readonly TraitRecord[], forcing: Record<string, string> = {}): RulesCatalog {
  return {
    traits: Object.fromEntries(records.map((r) => [r.id, r])),
    forcingKeepsakes: new Map(Object.entries(forcing)),
    poolGods: poolGods("hades2"),
  };
}

describe("the pool cap", () => {
  const rules = createRules(world([], { ZeusKeepsake: "Zeus" }));

  it("is four", () => {
    expect(rules.poolCapacity(facts())).toBe(4);
  });

  it("lets a god in while the pool has room", () => {
    const f = facts({ godPool: new Set(["Hera", "Ares"]), progress: { region: 4, chamber: 30 } });
    expect(rules.canGodEnterPool("Zeus", f)).toBe(true);
  });

  it("lets a god in from a full pool while a region boundary remains", () => {
    const full = new Set(["Hera", "Ares", "Demeter", "Hestia"]);
    const f = facts({ godPool: full, progress: { region: 3, chamber: 1 } });
    expect(rules.canGodEnterPool("Zeus", f)).toBe(true);
  });

  it("closes on a full pool in the last region", () => {
    const full = new Set(["Hera", "Ares", "Demeter", "Hestia"]);
    const f = facts({ godPool: full, progress: { region: 4, chamber: 1 } });
    expect(rules.canGodEnterPool("Zeus", f)).toBe(false);
  });

  it("stays open in the last region when the god's own keepsake is already equipped", () => {
    // The case counting regions alone gets wrong: there is no boundary left to
    // swap at, and nothing needs swapping.
    const full = new Set(["Hera", "Ares", "Demeter", "Hestia"]);
    const f = facts({
      godPool: full,
      progress: { region: 4, chamber: 1 },
      equipped: { keepsake: "ZeusKeepsake" },
    });
    expect(rules.canGodEnterPool("Zeus", f)).toBe(true);
  });

  it("does not let another god's keepsake stand in", () => {
    const full = new Set(["Hera", "Ares", "Demeter", "Hestia"]);
    const f = facts({
      godPool: full,
      progress: { region: 4, chamber: 1 },
      equipped: { keepsake: "ZeusKeepsake" },
    });
    expect(rules.canGodEnterPool("Poseidon", f)).toBe(false);
  });

  it("is generous when progress was never collected", () => {
    const full = new Set(["Hera", "Ares", "Demeter", "Hestia"]);
    expect(rules.canGodEnterPool("Zeus", facts({ godPool: full }))).toBe(true);
  });

  it("is generous about a region number this game does not have", () => {
    const full = new Set(["Hera", "Ares", "Demeter", "Hestia"]);
    const f = facts({ godPool: full, progress: { region: 7, chamber: 1 } });
    expect(rules.canGodEnterPool("Zeus", f)).toBe(true);
  });

  it("says a god already in the pool can be in the pool", () => {
    const full = new Set(["Hera", "Ares", "Demeter", "Zeus"]);
    const f = facts({ godPool: full, progress: { region: 4, chamber: 1 } });
    expect(rules.canGodEnterPool("Zeus", f)).toBe(true);
  });

  it("does not count a god who takes no pool slot toward the cap", () => {
    // A run's god pool is every god it took a reward from, and this game has
    // five gods who grant boons without ever taking a slot: Hermes, Chaos,
    // Selene and the cameos. Counting them would shut the door on a run with
    // two slots still open.
    const f = facts({
      godPool: new Set(["Hera", "Ares", "Hermes", "Artemis"]),
      progress: { region: 4, chamber: 1 },
    });
    expect(rules.canGodEnterPool("Zeus", f)).toBe(true);
  });

  it("still closes once four slot-taking gods are in, whoever else is", () => {
    const f = facts({
      godPool: new Set(["Hera", "Ares", "Demeter", "Hestia", "Hermes"]),
      progress: { region: 4, chamber: 1 },
    });
    expect(rules.canGodEnterPool("Zeus", f)).toBe(false);
  });
});

describe("feasibility for one trait", () => {
  const rules = createRules(
    world([
      record({ id: "Plain" }),
      record({ id: "Conflicted", aspectConflicts: ["FormA"] }),
      record({ id: "Blocked", blockedBy: ["Blocker"] }),
      record({ id: "Blocker" }),
      record({ id: "GroupA", exclusiveGroup: ["GroupA", "GroupB"] }),
      record({ id: "GroupB", exclusiveGroup: ["GroupA", "GroupB"] }),
      // Records carrying two constraints at once, which is where the order the
      // four cases are checked in becomes observable. This game states none of
      // these pairs in its own data — it ships no blocks at all — so a world
      // stated here is the only place the order can be pinned.
      record({ id: "AspectAndBlocked", aspectConflicts: ["FormA"], blockedBy: ["Blocker"] }),
      record({
        id: "AspectAndGrouped",
        aspectConflicts: ["FormA"],
        exclusiveGroup: ["AspectAndGrouped", "GroupB"],
      }),
      record({
        id: "BlockedAndGrouped",
        blockedBy: ["Blocker"],
        exclusiveGroup: ["BlockedAndGrouped", "GroupB"],
      }),
    ]),
  );

  it("reports a ban", () => {
    const f = facts({ bans: new Set(["Plain"]) });
    expect(rules.isBlocked("Plain", f)).toEqual({ kind: "banned", trait: "Plain" });
  });

  it("reports nothing for an unconstrained trait", () => {
    expect(rules.isBlocked("Plain", facts())).toBeNull();
  });

  it("reports nothing for a trait this catalog does not carry", () => {
    expect(rules.isBlocked("NotARecord", facts())).toBeNull();
  });

  it("reports nothing for an id that only looks like a record", () => {
    // Every plain object answers to `toString`, so a lookup that asks only
    // whether it got undefined would take that for a record and start reading
    // fields off a function.
    expect(rules.isBlocked("toString", facts())).toBeNull();
  });

  it("reports the equipped aspect as a conflict", () => {
    const f = facts({ equipped: { aspect: "FormA" } });
    expect(rules.isBlocked("Conflicted", f)).toEqual({
      kind: "aspectConflict",
      aspect: "FormA",
      trait: "Conflicted",
    });
  });

  it("reports nothing while no aspect is equipped", () => {
    expect(rules.isBlocked("Conflicted", facts())).toBeNull();
  });

  it("reports nothing when a different aspect is equipped", () => {
    expect(rules.isBlocked("Conflicted", facts({ equipped: { aspect: "FormB" } }))).toBeNull();
  });

  it("answers an aspect conflict from the equipped kit and never from what is held", () => {
    // The regression that matters. A weapon form is equipped, not picked up,
    // and in Hades I the form is itself a trait record, so a run can hold the
    // id while having equipped nothing. Reading `held` would pass every other
    // test in this file while answering a different question.
    const f = facts({ held: held("FormA") });
    expect(rules.isBlocked("Conflicted", f)).toBeNull();
  });

  it("reports a one-directional block once the blocker is held", () => {
    const f = facts({ held: held("Blocker") });
    expect(rules.isBlocked("Blocked", f)).toEqual({
      kind: "blockedByTrait",
      trait: "Blocked",
      blockedBy: "Blocker",
    });
  });

  it("leaves the blocker itself alone, since the block runs one way", () => {
    expect(rules.isBlocked("Blocker", facts({ held: held("Blocked") }))).toBeNull();
  });

  it("releases the block when the blocker is no longer held", () => {
    expect(rules.isBlocked("Blocked", facts())).toBeNull();
  });

  it("reports a held group member as a conflict, and names it", () => {
    const f = facts({ held: held("GroupB") });
    expect(rules.isBlocked("GroupA", f)).toEqual({
      kind: "slotConflict",
      trait: "GroupA",
      conflictsWith: "GroupB",
    });
  });

  it("does not read a record's own membership as a conflict with itself", () => {
    expect(rules.isBlocked("GroupA", facts({ held: held("GroupA") }))).toBeNull();
  });

  it("reports the ban first where a trait is both banned and blocked", () => {
    const f = facts({ bans: new Set(["Blocked"]), held: held("Blocker") });
    expect(rules.isBlocked("Blocked", f)).toEqual({ kind: "banned", trait: "Blocked" });
  });

  it("reports a ban on an id this catalog does not carry", () => {
    // A ban is a fact about the run rather than about a record, so it gets
    // answered before the catalog is consulted at all. An id nobody can look up
    // is the shape a ban arrives in when the run and the snapshot disagree, and
    // dropping it would throw away the one constraint that was known for sure.
    const f = facts({ bans: new Set(["NotARecord"]) });
    expect(rules.isBlocked("NotARecord", f)).toEqual({ kind: "banned", trait: "NotARecord" });
  });

  it("reports the ban ahead of an equipped aspect conflict", () => {
    const f = facts({ bans: new Set(["Conflicted"]), equipped: { aspect: "FormA" } });
    expect(rules.isBlocked("Conflicted", f)).toEqual({ kind: "banned", trait: "Conflicted" });
  });

  it("reports the equipped aspect ahead of a held blocker", () => {
    const f = facts({ equipped: { aspect: "FormA" }, held: held("Blocker") });
    expect(rules.isBlocked("AspectAndBlocked", f)).toMatchObject({ kind: "aspectConflict" });
  });

  it("reports the equipped aspect ahead of a held group member", () => {
    const f = facts({ equipped: { aspect: "FormA" }, held: held("GroupB") });
    expect(rules.isBlocked("AspectAndGrouped", f)).toMatchObject({ kind: "aspectConflict" });
  });

  it("reports a held blocker ahead of a held group member", () => {
    const f = facts({ held: held("Blocker", "GroupB") });
    expect(rules.isBlocked("BlockedAndGrouped", f)).toMatchObject({ kind: "blockedByTrait" });
  });
});

describe("against the shipped Hades II catalog", () => {
  const rules = createRules(shippedCatalog());
  const traits = Object.values(traitsFor("hades2"));

  it("carries the feasibility population this game actually has", () => {
    const count = (pick: (r: TraitRecord) => readonly string[] | null) => {
      const carriers = traits.filter((r) => (pick(r) ?? []).length > 0);
      return { carriers: carriers.length, edges: carriers.reduce((n, r) => n + (pick(r) ?? []).length, 0) };
    };
    expect(count((r) => r.aspectConflicts)).toEqual({ carriers: 2, edges: 2 });
    expect(count((r) => r.blockedBy)).toEqual({ carriers: 0, edges: 0 });
    expect(count((r) => r.exclusiveGroup)).toEqual({ carriers: 7, edges: 29 });
  });

  it("opens the pool on a keepsake id the game actually uses", () => {
    // The pool tests above invent both halves of the mapping, so they pass
    // whatever id space it happens to be keyed in. This one hands over the
    // shipped map and the id a run really records — the same id the nine
    // Godsent Hex gates use when they name a keepsake. If the two ever drift
    // apart, the last-region rule stops seeing the keepsake that saves the run
    // and answers impossible.
    const f = facts({
      godPool: new Set(["Hera", "Ares", "Demeter", "Hestia"]),
      progress: { region: 4, chamber: 1 },
      equipped: { keepsake: "ForceZeusBoonKeepsake" },
    });
    expect(rules.canGodEnterPool("Zeus", f)).toBe(true);
    expect(rules.canGodEnterPool("Poseidon", f)).toBe(false);
  });

  it("fires on the two aspect conflicts the game declares", () => {
    // Both are Chaos curses that the autofire Torch is not offered alongside.
    const f = facts({ equipped: { aspect: "TorchAutofireAspect" } });
    expect(rules.isBlocked("ChaosPrimaryAttackCurse", f)).toEqual({
      kind: "aspectConflict",
      aspect: "TorchAutofireAspect",
      trait: "ChaosPrimaryAttackCurse",
    });
    expect(rules.isBlocked("ChaosSecondaryAttackCurse", f)).not.toBeNull();
  });

  it("leaves those two alone under another form of the same weapon", () => {
    // A real aspect id rather than an invented one. An id this catalog does not
    // carry would pass this test by matching nothing, which is exactly how the
    // conflicts went unnoticed in the first place.
    expect(traitsFor("hades2").TorchDetonateAspect).toBeDefined();
    const f = facts({ equipped: { aspect: "TorchDetonateAspect" } });
    expect(rules.isBlocked("ChaosPrimaryAttackCurse", f)).toBeNull();
  });

  it("fires on the Cast family, which is a real five-way exclusion", () => {
    const f = facts({ held: held("CastLobBoon") });
    expect(rules.isBlocked("CastAnywhereBoon", f)).toEqual({
      kind: "slotConflict",
      trait: "CastAnywhereBoon",
      conflictsWith: "CastLobBoon",
    });
    expect(rules.isBlocked("SelfCastBoon", f)).not.toBeNull();
    // A Cast boon outside the family is untouched by it.
    expect(rules.isBlocked("CastAttachBoon", f)).toBeNull();
  });

  it("blocks nothing on held traits alone, this game declaring no such block", () => {
    const everything = held(...traits.map((r) => r.id));
    const blocks = traits.filter(
      (r) => rules.isBlocked(r.id, facts({ held: everything }))?.kind === "blockedByTrait",
    );
    expect(blocks).toEqual([]);
  });
});
