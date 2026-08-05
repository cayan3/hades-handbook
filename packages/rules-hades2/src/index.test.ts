import { type TraitRecord, traitsFor } from "@repo/catalog";
import type { HeldTrait, RunFacts, TraitId } from "@repo/core";
import { describe, expect, it } from "vitest";
import { type RulesCatalog, createRules, shippedCatalog } from "./index.js";

/**
 * Two halves, and they are testing different things.
 *
 * The synthetic half states one small world per rule, so a verdict can be read
 * off the test rather than looked up in six hundred records. The shipped half
 * asks whether the rules fire on the data the game actually ships, which is the
 * question a synthetic world cannot answer and the one this seam has been
 * failing quietly: the aspect conflicts below were carried for a whole session
 * in a field that could never match them, and nothing failed.
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

function world(records: readonly TraitRecord[], forcing: Record<string, string> = {}): RulesCatalog {
  return {
    traits: Object.fromEntries(records.map((r) => [r.id, r])),
    forcingKeepsakes: new Map(Object.entries(forcing)),
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
    // and in Hades I the form is itself a trait record -- so a run can hold the
    // id while having equipped nothing. Reading `held` would pass every other
    // test in this file and answer a different question.
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
    // A real aspect id rather than an invented one: an id this catalog does not
    // carry would pass this test by matching nothing, which is the same way the
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
