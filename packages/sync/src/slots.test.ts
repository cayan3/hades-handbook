import type { RunState } from "@repo/core";
import { describe, expect, it } from "vitest";
import type { SyncCatalog } from "./catalog-view.js";
import { openManualSource } from "./manual-source.js";
import { emptyRun, toPersisted } from "./persisted.js";
import { adoptLegacySlots, holdsSomething } from "./slots.js";
import { type RunStore, createMemoryStore } from "./store.js";
import { testCatalog, testTrait, traitTable } from "./test-support.js";

function world(): SyncCatalog {
  return testCatalog({
    game: "hades2",
    dataVersion: "build-1",
    traits: traitTable(
      testTrait("HeraAttack", { god: "Hera", slot: "Melee" }),
      testTrait("ZeusAttack", { god: "Zeus", slot: "Melee" }),
    ),
    gods: new Set(["Hera", "Zeus"]),
    slots: new Set(["Melee"]),
  });
}

/** A record holding one boon, which is what an installed copy's runs look like. */
function runHolding(trait: string) {
  const state = emptyRun("hades2", "build-1");
  state.facts.held.set(trait, { rarity: "Common", level: 1 });
  state.facts.godPool.add(trait === "HeraAttack" ? "Hera" : "Zeus");
  return toPersisted({ state, quarantine: [] });
}

function heldIn(record: Awaited<ReturnType<RunStore["load"]>>): string[] {
  return (record?.facts.held ?? []).map(([trait]) => trait);
}

/**
 * The two records every installed copy of the earlier build has. This is the one
 * place this row can lose somebody's run, so the ordering is the whole test:
 * the pointer is written last and is what says the pass has run.
 */
describe("moving the two old records into slots", () => {
  it("puts the run in progress in slot 1 and the filed one in slot 2", async () => {
    const store = createMemoryStore();
    await store.save("hades2", "active", runHolding("HeraAttack"));
    await store.save("hades2", "last", runHolding("ZeusAttack"));

    await adoptLegacySlots(store, "hades2");

    expect(heldIn(await store.load("hades2", 1))).toEqual(["HeraAttack"]);
    expect(heldIn(await store.load("hades2", 2))).toEqual(["ZeusAttack"]);
    expect(await store.openSlot("hades2")).toBe(1);
  });

  it("drops the old keys once both runs are in slots", async () => {
    const store = createMemoryStore();
    await store.save("hades2", "active", runHolding("HeraAttack"));
    await store.save("hades2", "last", runHolding("ZeusAttack"));

    await adoptLegacySlots(store, "hades2");

    expect(await store.load("hades2", "active")).toBeNull();
    expect(await store.load("hades2", "last")).toBeNull();
  });

  /** A copy that never finished a run, which is most of them. */
  it("carries an active record with nothing filed behind it", async () => {
    const store = createMemoryStore();
    await store.save("hades2", "active", runHolding("HeraAttack"));

    await adoptLegacySlots(store, "hades2");

    expect(heldIn(await store.load("hades2", 1))).toEqual(["HeraAttack"]);
    expect(await store.load("hades2", 2)).toBeNull();
  });

  /**
   * And a filed run with no run in progress. Slot 1 stays free and open rather
   * than taking the filed run: opening it is the player's choice to make, and
   * this pass making it for them would be a resume nobody asked for.
   */
  it("leaves the filed run in slot 2 and opens the empty slot 1", async () => {
    const store = createMemoryStore();
    await store.save("hades2", "last", runHolding("ZeusAttack"));

    await adoptLegacySlots(store, "hades2");

    expect(await store.load("hades2", 1)).toBeNull();
    expect(heldIn(await store.load("hades2", 2))).toEqual(["ZeusAttack"]);
    expect(await store.openSlot("hades2")).toBe(1);
  });

  /**
   * The pointer says whether this has run, and a slot holding a run says the
   * same thing more locally. Both are checked, because the pointer alone leaves
   * one order — a slot written before the pointer was — in which this pass
   * writes an old record over a newer run.
   */
  it("leaves a slot that already holds a run alone", async () => {
    const store = createMemoryStore();
    await store.save("hades2", 1, runHolding("ZeusAttack"));
    await store.save("hades2", "active", runHolding("HeraAttack"));

    await adoptLegacySlots(store, "hades2");

    expect(heldIn(await store.load("hades2", 1))).toEqual(["ZeusAttack"]);
  });

  it("writes no pointer where there was nothing to move", async () => {
    const store = createMemoryStore();

    await adoptLegacySlots(store, "hades2");

    expect(await store.openSlot("hades2")).toBeNull();
  });

  /** The pointer is the record of this having run, so a second pass is a no-op. */
  it("does not run again over slots that have since moved on", async () => {
    const store = createMemoryStore();
    await store.save("hades2", "active", runHolding("HeraAttack"));
    await adoptLegacySlots(store, "hades2");
    await store.save("hades2", 1, runHolding("ZeusAttack"));
    await store.save("hades2", "active", runHolding("HeraAttack"));

    await adoptLegacySlots(store, "hades2");

    expect(heldIn(await store.load("hades2", 1))).toEqual(["ZeusAttack"]);
  });

  /**
   * The failure that would cost somebody a run, ordered so it cannot: the
   * pointer goes last, so a write that fails leaves it unset and the next load
   * reads the old keys again.
   */
  it("leaves the pointer unset when a slot could not be written, and converges", async () => {
    const memory = createMemoryStore();
    let refuse = true;
    const store: RunStore = {
      ...memory,
      save: (game, slot, run) =>
        refuse && slot === 2
          ? Promise.reject(new Error("quota exceeded"))
          : memory.save(game, slot, run),
    };
    await store.save("hades2", "active", runHolding("HeraAttack"));
    await store.save("hades2", "last", runHolding("ZeusAttack"));

    await expect(adoptLegacySlots(store, "hades2")).rejects.toThrow(/quota/);
    expect(await store.openSlot("hades2")).toBeNull();
    expect(await store.load("hades2", "last")).not.toBeNull();

    refuse = false;
    await adoptLegacySlots(store, "hades2");
    expect(heldIn(await store.load("hades2", 2))).toEqual(["ZeusAttack"]);
  });

  /** Each game's records move on their own, when that game is next opened. */
  it("touches only the game it was asked about", async () => {
    const store = createMemoryStore();
    await store.save("hades1", "active", runHolding("HeraAttack"));

    await adoptLegacySlots(store, "hades2");

    expect(await store.load("hades1", "active")).not.toBeNull();
    expect(await store.openSlot("hades1")).toBeNull();
  });

  /** End to end: an old install opens on the run it was playing. */
  it("is what a source opens on, so the run is where the player left it", async () => {
    const store = createMemoryStore();
    await store.save("hades2", "active", runHolding("HeraAttack"));
    await store.save("hades2", "last", runHolding("ZeusAttack"));

    const source = await openManualSource({ game: "hades2", catalog: world(), store });

    expect([...source.getFacts().held.keys()]).toEqual(["HeraAttack"]);
    expect(source.slot).toBe(1);
    const slots = await source.slots();
    expect(slots[1]?.contents.kind === "run" ? [...slots[1].contents.run.facts.held.keys()] : []).toEqual(
      ["ZeusAttack"],
    );
  });
});

/**
 * What makes a slot taken. One predicate rather than three, because a run that
 * holds nothing must not occupy a slot anybody has to choose over — which is
 * where the guard that used to sit inside the run boundary went.
 */
describe("whether a run holds anything", () => {
  const empty = (): RunState => emptyRun("hades2", "build-1");

  it("says no to a run nobody has touched", () => {
    expect(holdsSomething(empty())).toBe(false);
  });

  it("says yes to a boon, a pool god, a pin, a plan and a note", () => {
    const held = empty();
    held.facts.held.set("HeraAttack", { rarity: "Common", level: 1 });
    expect(holdsSomething(held)).toBe(true);

    const pooled = empty();
    pooled.facts.godPool.add("Hera");
    expect(holdsSomething(pooled)).toBe(true);

    const pinned = empty();
    pinned.intent.pins.add("HeraAttack");
    expect(holdsSomething(pinned)).toBe(true);

    const planned = empty();
    planned.intent.planned.add("HeraAttack");
    expect(holdsSomething(planned)).toBe(true);

    const noted = empty();
    noted.intent.notes.set("HeraAttack", "for the duo");
    expect(holdsSomething(noted)).toBe(true);
  });

  /** The case the old guard could not see, and the defect it left in the app. */
  it("says yes to a run carrying only an equipped weapon or form", () => {
    const armed = empty();
    armed.facts.equipped = { weapon: "WeaponTorch" };
    expect(holdsSomething(armed)).toBe(true);

    const formed = empty();
    formed.facts.equipped = { aspect: "TorchAutofireAspect" };
    expect(holdsSomething(formed)).toBe(true);
  });

  /**
   * A boon taken and then corrected leaves the position behind with nothing in
   * it, which is a run holding nothing.
   */
  it("says no to a slot the run emptied again", () => {
    const corrected = empty();
    corrected.facts.slots.set("Melee", null);
    expect(holdsSomething(corrected)).toBe(false);
  });

  /**
   * An empty talent map is an answer: the Mirror was asked and nothing was
   * selected, which is why the codec keeps it apart from an absent one. Read as
   * nothing, a run carrying only that answer would be written over by the next
   * fresh run.
   */
  it("says yes to a talent map that was answered with nothing", () => {
    const answered = empty();
    answered.facts.equipped = { talents: new Map() };
    expect(holdsSomething(answered)).toBe(true);
  });

  /**
   * Field by field, so a field added later turns up here with no case and this
   * goes red. The predicate is a hand-written list, and the way it fails is a
   * slot reading free that is not — a run written over with nothing to say it
   * happened. Three fields are deliberately not read and are named as such.
   */
  it("reads every field of a run except the three it means to skip", () => {
    const populate: Record<string, (run: RunState) => void> = {
      held: (run) => run.facts.held.set("HeraAttack", { rarity: "Common", level: 1 }),
      godPool: (run) => run.facts.godPool.add("Hera"),
      resources: (run) => run.facts.resources.set("Darkness", 100),
      bans: (run) => run.facts.bans.add("HeraAttack"),
      equipped: (run) => {
        run.facts.equipped = { weapon: "WeaponTorch" };
      },
      pins: (run) => run.intent.pins.add("HeraAttack"),
      planned: (run) => run.intent.planned.add("HeraAttack"),
      notes: (run) => run.intent.notes.set("HeraAttack", "for the duo"),
    };
    /* `game` and `dataVersion` are not things a player put there; `elements` is
       derived from `held`; `slots` is skipped for the reason above. */
    const skipped = ["game", "dataVersion", "elements", "slots"];

    const fields = [...Object.keys(empty().facts), ...Object.keys(empty().intent)];
    expect(fields.filter((field) => !skipped.includes(field)).sort()).toEqual(
      Object.keys(populate).sort(),
    );
    for (const [field, put] of Object.entries(populate)) {
      const run = empty();
      put(run);
      expect(holdsSomething(run), `${field} should make a slot taken`).toBe(true);
    }
  });
});
