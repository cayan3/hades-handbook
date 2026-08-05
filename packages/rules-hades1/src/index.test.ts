import { type TraitRecord, poolGods, traitsFor } from "@repo/catalog";
import type { HeldTrait, RunFacts, TraitId } from "@repo/core";
import { describe, expect, it } from "vitest";
import { type RulesCatalog, createRules, shippedCatalog } from "./index.js";

/**
 * The synthetic half states one small world per rule; the shipped half asks
 * whether those rules fire on what the game really ships.
 *
 * That second half carries more weight here than it does in the Hades II
 * package, because this is where the feasibility data lives. Seventeen aspect
 * conflicts and twelve blocks were extracted and then read by nothing, and
 * before that the aspect ones sat in the block field, where they could not have
 * fired at all. A rule that is right against invented records and silent
 * against real ones is exactly the failure this file exists to catch.
 */

function facts(over: Partial<RunFacts> = {}): RunFacts {
  return {
    game: "hades1",
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
    poolGods: poolGods("hades1"),
  };
}

describe("the pool cap", () => {
  const rules = createRules(world([], { ZeusKeepsake: "Zeus" }));
  const full = () => new Set(["Aphrodite", "Ares", "Artemis", "Athena"]);

  it("is four", () => {
    expect(rules.poolCapacity(facts())).toBe(4);
  });

  it("lets a god in while the pool has room", () => {
    const f = facts({ godPool: new Set(["Ares"]), progress: { region: 4, chamber: 30 } });
    expect(rules.canGodEnterPool("Zeus", f)).toBe(true);
  });

  it("lets a god in from a full pool while a region boundary remains", () => {
    const f = facts({ godPool: full(), progress: { region: 3, chamber: 1 } });
    expect(rules.canGodEnterPool("Zeus", f)).toBe(true);
  });

  it("closes on a full pool in the last region", () => {
    const f = facts({ godPool: full(), progress: { region: 4, chamber: 1 } });
    expect(rules.canGodEnterPool("Zeus", f)).toBe(false);
  });

  it("stays open in the last region when the god's own keepsake is already equipped", () => {
    const f = facts({
      godPool: full(),
      progress: { region: 4, chamber: 1 },
      equipped: { keepsake: "ZeusKeepsake" },
    });
    expect(rules.canGodEnterPool("Zeus", f)).toBe(true);
  });

  it("does not let another god's keepsake stand in", () => {
    const f = facts({
      godPool: full(),
      progress: { region: 4, chamber: 1 },
      equipped: { keepsake: "ZeusKeepsake" },
    });
    expect(rules.canGodEnterPool("Poseidon", f)).toBe(false);
  });

  it("is generous when progress was never collected", () => {
    expect(rules.canGodEnterPool("Zeus", facts({ godPool: full() }))).toBe(true);
  });

  it("is generous about a region number this game does not have", () => {
    const f = facts({ godPool: full(), progress: { region: 9, chamber: 1 } });
    expect(rules.canGodEnterPool("Zeus", f)).toBe(true);
  });

  it("says a god already in the pool can be in the pool", () => {
    const f = facts({ godPool: new Set([...full(), "Zeus"]), progress: { region: 4, chamber: 1 } });
    expect(rules.canGodEnterPool("Zeus", f)).toBe(true);
  });

  it("does not count a god who takes no pool slot toward the cap", () => {
    // A run's god pool is every god it took a reward from, and Hermes hands out
    // sixteen boons in this game without ever taking a slot. Counting him would
    // fill the pool a god early and shut the door while one was still open.
    const f = facts({
      godPool: new Set(["Aphrodite", "Ares", "Artemis", "Hermes"]),
      progress: { region: 4, chamber: 1 },
    });
    expect(rules.canGodEnterPool("Zeus", f)).toBe(true);
  });

  it("still closes once four slot-taking gods are in, whoever else is", () => {
    const f = facts({
      godPool: new Set([...full(), "Hermes"]),
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
      // four cases are checked in becomes observable. The shipped data cannot
      // pin all of it: no record in either game carries both a block and a
      // group, so a world stated here is the only place that pair exists.
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
    // The shipped half below states this with the real Beowulf id, which is the
    // stronger form of it. This one holds whatever the extractor does, and the
    // two files are meant to stay copies of each other.
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

describe("against the shipped Hades I catalog", () => {
  const rules = createRules(shippedCatalog());
  const traits = traitsFor("hades1");
  const all = Object.values(traits);
  /** Aspect of Beowulf, which replaces the Cast and so is named by thirteen Cast boons. */
  const BEOWULF = "ShieldLoadAmmoTrait";

  it("carries the feasibility population this game actually has", () => {
    const count = (pick: (r: TraitRecord) => readonly string[] | null) => {
      const carriers = all.filter((r) => (pick(r) ?? []).length > 0);
      return {
        carriers: carriers.length,
        edges: carriers.reduce((n, r) => n + (pick(r) ?? []).length, 0),
      };
    };
    expect(count((r) => r.aspectConflicts)).toEqual({ carriers: 16, edges: 17 });
    expect(count((r) => r.blockedBy)).toEqual({ carriers: 5, edges: 12 });
    expect(count((r) => r.exclusiveGroup)).toEqual({ carriers: 9, edges: 21 });
  });

  it("opens the pool on a keepsake id the game actually uses", () => {
    // The pool tests above invent both halves of the mapping, so they pass
    // whatever id space it happens to be keyed in. This one hands over the
    // shipped map and the id a run really records — the same id a requirement
    // naming this keepsake would use. If the two ever drift apart, the
    // last-region rule stops seeing the keepsake that saves the run and answers
    // impossible.
    const f = facts({
      godPool: new Set(["Aphrodite", "Ares", "Artemis", "Athena"]),
      progress: { region: 4, chamber: 1 },
      equipped: { keepsake: "ForceZeusBoonTrait" },
    });
    expect(rules.canGodEnterPool("Zeus", f)).toBe(true);
    expect(rules.canGodEnterPool("Poseidon", f)).toBe(false);
  });

  it("reports every aspect conflict the game declares, once the form is equipped", () => {
    const forms = new Set(all.flatMap((r) => r.aspectConflicts ?? []));
    const fired = [...forms].flatMap((form) =>
      all.filter(
        (r) => rules.isBlocked(r.id, facts({ equipped: { aspect: form } }))?.kind === "aspectConflict",
      ),
    );
    expect(fired.length).toBe(17);
  });

  it("names the trait as well as the form, which the requirement-side answer cannot", () => {
    const f = facts({ equipped: { aspect: BEOWULF } });
    expect(rules.isBlocked("AphroditeRangedTrait", f)).toEqual({
      kind: "aspectConflict",
      aspect: BEOWULF,
      trait: "AphroditeRangedTrait",
    });
  });

  it("does not fire on a real aspect the run merely holds", () => {
    // The regression, in the form the game actually offers it. This game's
    // aspects are trait records, and a run holds the one it chose, so answering
    // from `held` would look right while reading the wrong fact.
    expect(traits[BEOWULF]).toBeDefined();
    const f = facts({ held: held(BEOWULF) });
    expect(rules.isBlocked("AphroditeRangedTrait", f)).toBeNull();
  });

  it("fires on a real one-directional block", () => {
    // Ammo Reclaim is not offered to a run already holding a boon that replaces
    // the Cast projectile.
    const f = facts({ held: held("AresRangedTrait") });
    expect(rules.isBlocked("AmmoReclaimTrait", f)).toEqual({
      kind: "blockedByTrait",
      trait: "AmmoReclaimTrait",
      blockedBy: "AresRangedTrait",
    });
    expect(rules.isBlocked("AresRangedTrait", facts({ held: held("AmmoReclaimTrait") }))).toBeNull();
  });

  it("reports the equipped form ahead of a held blocker where a record has both", () => {
    const f = facts({ equipped: { aspect: BEOWULF }, held: held("AresRangedTrait") });
    expect(rules.isBlocked("AmmoReclaimTrait", f)).toMatchObject({ kind: "aspectConflict" });
  });

  it("reports the equipped form ahead of a held group member where a record has both", () => {
    // Three real records carry both an aspect conflict and an exclusive group,
    // and the Blizzard orb is one of them: Beowulf is never offered it, and
    // Poseidon's projectile boon excludes it. The form is the older fact, so
    // the form is the answer.
    const f = facts({ equipped: { aspect: BEOWULF }, held: held("PoseidonAresProjectileTrait") });
    expect(rules.isBlocked("BlizzardOrbTrait", f)).toMatchObject({ kind: "aspectConflict" });
  });

  it("treats a group as the record's own neighbourhood, not as a clique", () => {
    // These groups are chains here: Poseidon's projectile boon excludes the
    // Blizzard orb, and the Blizzard orb excludes the ice array, but the
    // projectile boon and the array do not exclude each other. Reading the
    // group transitively would invent an exclusion the game does not state.
    const f = facts({ held: held("PoseidonAresProjectileTrait") });
    expect(rules.isBlocked("BlizzardOrbTrait", f)).toEqual({
      kind: "slotConflict",
      trait: "BlizzardOrbTrait",
      conflictsWith: "PoseidonAresProjectileTrait",
    });
    expect(rules.isBlocked("IceStrikeArrayTrait", f)).toBeNull();
  });

  it("leaves a run holding nothing and equipping nothing entirely unblocked", () => {
    const blocked = all.filter((r) => rules.isBlocked(r.id, facts()) !== null);
    expect(blocked).toEqual([]);
  });
});
