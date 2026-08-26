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
    expect(run.groups[0]?.boons.map((view) => view.trait)).toEqual(["ZeusAttack"]);
  });

  /* The two names are deliberately in the opposite order alphabetically, or
     the assertion cannot tell the two rules apart. */
  it("ranks a god's boons by the slot column rather than alphabetically", () => {
    const run = finishedRun(
      world(),
      state({ held: held("AegisOfZeus", "ZeusAttack"), godPool: new Set(["Zeus"]) }),
      SLOTS,
    );

    expect(run.groups[0]?.boons.map((view) => view.trait)).toEqual(["ZeusAttack", "AegisOfZeus"]);
  });

  /**
   * The 9.55 shape: a record with no god still has a home, and dropping it
   * would lose a whole page's worth of a run with nothing saying so.
   */
  it("puts a weapon's own records under the weapon", () => {
    const run = finishedRun(world(), state({ held: held("SwordHammer") }), SLOTS);

    const group = run.groups.find((entry) => entry.weapon !== null);
    expect(group?.weapon).toBe("WeaponSword");
    expect(group?.boons.map((view) => view.trait)).toEqual(["SwordHammer"]);
    expect(run.held).toBe(1);
  });

  it("keeps a record belonging to neither rather than dropping it", () => {
    const run = finishedRun(world(), state({ held: held("Nowhere") }), SLOTS);

    expect(run.groups.map((group) => group.key)).toEqual(["other"]);
    expect(run.groups[0]?.boons.map((view) => view.trait)).toEqual(["Nowhere"]);
  });

  /** Once, or the groups stop adding up to the count above them. */
  it("draws a Duo under one of its two gods", () => {
    const run = finishedRun(
      world(),
      state({ held: held("Curse"), godPool: new Set(["Zeus", "Ares"]) }),
      SLOTS,
    );

    const drawn = run.groups.flatMap((group) => group.boons.map((view) => view.trait));
    expect(drawn).toEqual(["Curse"]);
    expect(run.held).toBe(1);
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
    expect(run.weapon?.form?.trait).toBe("SwordAspect");
    // Equipped, so it is not one of the boons and is not counted as one.
    expect(run.held).toBe(0);
    expect(run.groups).toEqual([]);
  });

  it("orders the elements by how many the run gathered", () => {
    const run = finishedRun(
      world(),
      state({ elements: new Map([["Air", 1], ["Fire", 3]]) }),
      SLOTS,
    );

    expect(run.elements).toEqual([
      { element: "Fire", count: 3 },
      { element: "Air", count: 1 },
    ]);
  });

  /** Hades I has no element system, so its overview simply has no such row. */
  it("has no elements where the run gathered none", () => {
    const run = finishedRun(world(), state({ held: held("ZeusAttack") }), SLOTS);

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
