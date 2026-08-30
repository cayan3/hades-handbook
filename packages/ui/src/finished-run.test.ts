import type { TraitRecord } from "@repo/catalog";
import type { RunIntent, RunState, TraitId } from "@repo/core";
import { describe, expect, it } from "vitest";
import { finishedRun } from "./finished-run.js";
import { createNodeSource } from "./node-view.js";
import { held, makeFacts, stubLookups, stubNaming, stubRules } from "./test-support.js";

/**
 * What a finished run says about itself, on a world small enough to state.
 *
 * The interesting cases are the ones a god-keyed grouping loses: a hammer
 * belongs to a weapon and to no god, and a Duo belongs to two gods and must be
 * drawn once or the group totals stop adding up to the count in the heading.
 */

function record(id: TraitId, over: Partial<TraitRecord> = {}): TraitRecord {
  return {
    id,
    god: null,
    godKind: null,
    name: id,
    descriptionRef: null,
    icon: null,
    boonCategory: "StandardOlympian",
    slot: null,
    weapon: null,
    rarity: [],
    duoGods: null,
    exclusiveGroup: null,
    elementAffinity: null,
    elementGrants: [],
    prereq: null,
    prereqSource: null,
    tier: null,
    blockedBy: null,
    activation: null,
    aspectConflicts: null,
    source: `Scripts/Test.lua:${id}`,
    ...over,
  };
}

const RECORDS = [
  record("ZeusAttack", { god: "Zeus", slot: "Melee" }),
  record("AegisOfZeus", { god: "Zeus", slot: "Ranged" }),
  record("AresAttack", { god: "Ares", slot: "Melee" }),
  record("Curse", { duoGods: ["Zeus", "Ares"] }),
  record("SwordHammer", { weapon: "WeaponSword" }),
  record("Nowhere"),
  record("SwordAspect", { slot: "Aspect", weapon: "WeaponSword" }),
];

function world() {
  const byId = Object.fromEntries(RECORDS.map((entry) => [entry.id, entry]));
  return { ...createNodeSource("hades1", stubRules(), stubLookups(), byId), naming: stubNaming };
}

/** The same world under the game that has elements at all. */
function hades2World() {
  const byId = Object.fromEntries(RECORDS.map((entry) => [entry.id, entry]));
  return { ...createNodeSource("hades2", stubRules(), stubLookups(), byId), naming: stubNaming };
}

const SLOTS = ["Melee", "Secondary", "Ranged"];

function state(over: Partial<RunState["facts"]> = {}, intent: Partial<RunIntent> = {}): RunState {
  return {
    facts: makeFacts(over),
    intent: { pins: new Set(), planned: new Set(), notes: new Map(), ...intent },
  };
}

describe("the run an overview draws", () => {
  it("counts what the run held, the gods it met and the goals it reached", () => {
    const run = finishedRun(
      world(),
      state(
        { held: held("ZeusAttack", "AresAttack"), godPool: new Set(["Zeus", "Ares"]) },
        { pins: new Set<TraitId>(["ZeusAttack", "AegisOfZeus"]) },
      ),
      SLOTS,
    );

    expect(run.held).toBe(2);
    expect(run.gods).toBe(2);
    expect(run.goalsMet).toBe(1);
    expect(run.goals).toBe(2);
  });

  /** The pool's order is arrival order, which is the order the god bar runs in. */
  it("groups boons under their gods, in the order the run met them", () => {
    const run = finishedRun(
      world(),
      state({ held: held("AresAttack", "ZeusAttack"), godPool: new Set(["Zeus", "Ares"]) }),
      SLOTS,
    );

    expect(run.groups.map((group) => group.label)).toEqual(["god:Zeus", "god:Ares"]);
    expect(run.groups[0]?.boons.map((boon) => boon.view.trait)).toEqual(["ZeusAttack"]);
  });

  /* The two names are deliberately in the opposite order alphabetically, or
     the assertion cannot tell the two rules apart. */
  it("ranks a god's boons by the slot column rather than alphabetically", () => {
    const run = finishedRun(
      world(),
      state({ held: held("AegisOfZeus", "ZeusAttack"), godPool: new Set(["Zeus"]) }),
      SLOTS,
    );

    expect(run.groups[0]?.boons.map((boon) => boon.view.trait)).toEqual(["ZeusAttack", "AegisOfZeus"]);
  });

  /**
   * The 9.55 shape: a record with no god still has a home, and dropping it
   * would lose a whole page's worth of a run with nothing saying so.
   */
  it("puts a weapon's own records under the weapon", () => {
    const run = finishedRun(world(), state({ held: held("SwordHammer") }), SLOTS);

    const group = run.groups.find((entry) => entry.weapon !== null);
    expect(group?.weapon).toBe("WeaponSword");
    expect(group?.boons.map((boon) => boon.view.trait)).toEqual(["SwordHammer"]);
    expect(run.held).toBe(1);
  });

  it("keeps a record belonging to neither rather than dropping it", () => {
    const run = finishedRun(world(), state({ held: held("Nowhere") }), SLOTS);

    expect(run.groups.map((group) => group.key)).toEqual(["other"]);
    expect(run.groups[0]?.boons.map((boon) => boon.view.trait)).toEqual(["Nowhere"]);
  });

  /**
   * Under both, which is what the member lists do and what every other surface
   * here does. So the groups total more than `held`, and that is right: the
   * count is boons the run held and the groups are where to find each one.
   */
  it("draws a Duo under both of its gods", () => {
    const run = finishedRun(
      world(),
      state({ held: held("Curse"), godPool: new Set(["Zeus", "Ares"]) }),
      SLOTS,
    );

    expect(run.groups.map((group) => group.label)).toEqual(["god:Zeus", "god:Ares"]);
    for (const group of run.groups) {
      expect(group.boons.map((boon) => boon.view.trait)).toEqual(["Curse"]);
    }
    expect(run.held).toBe(1);
  });

  /**
   * The level is the run's, not the catalog's, so it has to come off `held`
   * rather than off the view — nothing else carries it.
   */
  it("carries how far each boon was levelled", () => {
    const run = finishedRun(
      world(),
      state({
        held: new Map([
          ["ZeusAttack", { rarity: "Common", level: 3 }],
          ["AresAttack", { rarity: "Common", level: 1 }],
        ]),
        godPool: new Set(["Zeus", "Ares"]),
      }),
      SLOTS,
    );

    const levels = Object.fromEntries(
      run.groups.flatMap((group) => group.boons.map((boon) => [boon.view.trait, boon.level])),
    );
    expect(levels).toEqual({ ZeusAttack: 3, AresAttack: 1 });
  });

  /**
   * Two goals fed by the same boon are two goals, each asked about itself. The
   * count is over pins rather than over contributing boons, so nothing can be
   * counted twice — and nothing shared can make one goal answer for the other.
   */
  it("counts goals one per pin, however much they overlap", () => {
    const run = finishedRun(
      world(),
      state(
        { held: held("ZeusAttack"), godPool: new Set(["Zeus"]) },
        { pins: new Set<TraitId>(["ZeusAttack", "AegisOfZeus"]) },
      ),
      SLOTS,
    );

    expect(run.goals).toBe(2);
    expect(run.goalsMet).toBe(1);
  });

  /** A boon whose god left the pool is still a boon the run held. */
  it("still groups a boon whose god the pool does not name", () => {
    const run = finishedRun(world(), state({ held: held("ZeusAttack") }), SLOTS);

    expect(run.groups.map((group) => group.label)).toEqual(["god:Zeus"]);
  });

  it("names the weapon and the form, which are equipped rather than held", () => {
    const run = finishedRun(
      world(),
      state({ equipped: { weapon: "WeaponSword", aspect: "SwordAspect" } }),
      SLOTS,
    );

    expect(run.weapon?.weapon).toBe("WeaponSword");
    expect(run.weapon?.form?.view.trait).toBe("SwordAspect");
    // Equipped, so it is not one of the boons and is not counted as one.
    expect(run.held).toBe(0);
    expect(run.groups).toEqual([]);
  });

  /**
   * All five, in the game's own order, zeros included. A row naming only what a
   * run has is one a player must read to find what is missing, and it
   * rearranges as the run picks them up.
   */
  it("names all five of Hades II's elements, in the tray's order", () => {
    const run = finishedRun(
      hades2World(),
      state({ elements: new Map([["Air", 1], ["Fire", 3]]) }),
      SLOTS,
    );

    expect(run.elements).toEqual([
      { element: "Earth", count: 0 },
      { element: "Water", count: 0 },
      { element: "Air", count: 1 },
      { element: "Fire", count: 3 },
      { element: "Aether", count: 0 },
    ]);
  });

  /** Hades I has no element system, so its overview simply has no such row. */
  it("names none in Hades I, whatever the facts carry", () => {
    const run = finishedRun(
      world(),
      state({ held: held("ZeusAttack"), elements: new Map([["Fire", 2]]) }),
      SLOTS,
    );

    expect(run.elements).toEqual([]);
  });

  /** A pin and no boons is a run somebody played; it reads as itself. */
  it("says a run held nothing without inventing anything", () => {
    const run = finishedRun(world(), state({}, { pins: new Set<TraitId>(["ZeusAttack"]) }), SLOTS);

    expect(run.held).toBe(0);
    expect(run.groups).toEqual([]);
    expect(run.goalsMet).toBe(0);
    expect(run.goals).toBe(1);
  });
});
