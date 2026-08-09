import { describe, expect, it } from "vitest";
import { migrate } from "./migrate.js";
import { runOn, testCatalog, testRow, testTrait, traitTable } from "./test-support.js";

/**
 * The catalog these tests migrate *to*: two traits, two gods, one slot, one
 * keepsake, one Mirror row. Everything else any test names is therefore an id
 * this catalog doesn't have (which is yk the whole point lolol).
 */
function currentCatalog() {
  return testCatalog({
    dataVersion: "build-2",
    traits: traitTable(
      testTrait("HeraAttack", { god: "Hera", slot: "Melee" }),
      testTrait("ZeusAttack", { god: "Zeus", slot: "Melee" }),
    ),
    gods: new Set(["Hera", "Zeus"]),
    keepsakes: new Set(["ForceHeraBoonKeepsake"]),
    slots: new Set(["Melee"]),
    talents: new Set(["AmmoMetaUpgrade", "ReloadAmmoMetaUpgrade"]),
    mirrorRows: [testRow("Cast", "AmmoMetaUpgrade", "ReloadAmmoMetaUpgrade")],
  });
}

/** A run on the previous build, so the scan actually yk runs lolol. */
function oldRun() {
  return runOn("hades2", "build-1");
}

describe("a run stamped with the shipped build", () => {
  /**
   * This used to be skipped, on the reasoning that ids checked against the
   * catalog they came out of could only ever agree. They didn't come out of
   * *this* catalog; they came out of one reporting the same `dataVersion`,
   * which is the game's build id and moves only when the game does. A
   * re-extraction, extractor fix, or overlay correction each change the
   * catalog underneath a stamp that can't actually move; and the overlay is
   * code, so nothing abt it is even capable of moving one lol. Both have
   * happened in this repo already :pensive: :pensive:.
   */
  it("is scanned anyway, because an equal stamp is not the same catalog", () => {
    const catalog = currentCatalog();
    const state = runOn("hades2", "build-2");
    state.facts.held.set("GoneInBuild2", { rarity: "Common", level: 1 });

    const outcome = migrate(state, catalog);

    expect(outcome.quarantine).toEqual([
      { path: "held", key: "GoneInBuild2", value: { rarity: "Common", level: 1 } },
    ]);
    expect(outcome.state.facts.held.has("GoneInBuild2")).toBe(false);
  });

  it("costs a matching run nothing but the walk", () => {
    const catalog = currentCatalog();
    const state = runOn("hades2", "build-2");
    state.facts.held.set("HeraAttack", { rarity: "Common", level: 1 });

    const outcome = migrate(state, catalog);

    expect(outcome.quarantine).toEqual([]);
    expect(outcome.restamped).toBe(true);
    expect(outcome.state.facts.dataVersion).toBe("build-2");
    expect(outcome.state.facts.held.has("HeraAttack")).toBe(true);
  });
});

describe("a run whose every id survives the update", () => {
  it("is carried forward whole and re-stamped", () => {
    const catalog = currentCatalog();
    const state = oldRun();
    state.facts.held.set("HeraAttack", { rarity: "Epic", level: 3 });
    state.facts.godPool.add("Hera");
    state.facts.slots.set("Melee", "HeraAttack");
    state.facts.equipped.keepsake = "ForceHeraBoonKeepsake";
    state.facts.elements.set("Fire", 3);
    state.facts.elements.set("Water", 1);
    state.intent.pins.add("ZeusAttack");

    const outcome = migrate(state, catalog);

    expect(outcome.quarantine).toEqual([]);
    expect(outcome.restamped).toBe(true);
    expect(outcome.state.facts.dataVersion).toBe("build-2");
    expect(outcome.state.facts.held.get("HeraAttack")).toEqual({ rarity: "Epic", level: 3 });
    expect(outcome.state.facts.slots.get("Melee")).toBe("HeraAttack");
    expect(outcome.state.intent.pins.has("ZeusAttack")).toBe(true);
  });

  /**
   * Elements are the one field with no table to check them against, so they're
   * also the one field where losing everything produces no quarantine entry,
   * no notice, and no dangling id (e.g. a run that reads as a clean migration
   * and is short every element it had counted). There isn't any second guard
   * here like there is for a trait, which is why the carry-through is asserted
   * on its own instead of just being left to the sweep above.
   */
  it("carries the element counts, which nothing else in the pass would notice", () => {
    const state = oldRun();
    state.facts.elements.set("Fire", 3);
    state.facts.elements.set("Earth", 2);

    const outcome = migrate(state, currentCatalog());

    expect([...outcome.state.facts.elements].sort()).toEqual([
      ["Earth", 2],
      ["Fire", 3],
    ]);
    expect(outcome.quarantine).toEqual([]);
  });
});

describe("an id the new catalog cannot identify", () => {
  it("leaves the run and arrives in quarantine with its value", () => {
    const catalog = currentCatalog();
    const state = oldRun();
    state.facts.held.set("HeraAttack", { rarity: "Common", level: 1 });
    state.facts.held.set("RenamedInBuild2", { rarity: "Heroic", level: 2 });

    const outcome = migrate(state, catalog);

    expect(outcome.state.facts.held.has("RenamedInBuild2")).toBe(false);
    expect(outcome.state.facts.held.has("HeraAttack")).toBe(true);
    // Both halves matter. Losing the id from `held` is what stops evaluation
    // seeing a dangling reference; naming it here with the rarity and level it
    // was held at is what makes that removal recoverable instead of like a
    // deletion. A pass that did the first and skipped the second would satisfy
    // every assertion above this line.
    expect(outcome.quarantine).toEqual([
      { path: "held", key: "RenamedInBuild2", value: { rarity: "Heroic", level: 2 } },
    ]);
  });

  it("holds the run's stamp back, so the notice is still owed next load", () => {
    const catalog = currentCatalog();
    const state = oldRun();
    state.facts.held.set("RenamedInBuild2", { rarity: "Common", level: 1 });

    const outcome = migrate(state, catalog);

    expect(outcome.restamped).toBe(false);
    expect(outcome.state.facts.dataVersion).toBe("build-1");
  });

  it("re-stamps once the user says migrate anyway", () => {
    const catalog = currentCatalog();
    const state = oldRun();
    state.facts.held.set("RenamedInBuild2", { rarity: "Common", level: 1 });

    const outcome = migrate(state, catalog, { acceptQuarantine: true });

    expect(outcome.quarantine).toHaveLength(1);
    expect(outcome.restamped).toBe(true);
    expect(outcome.state.facts.dataVersion).toBe("build-2");
  });

  it("does not mutate the run it was handed", () => {
    const catalog = currentCatalog();
    const state = oldRun();
    state.facts.held.set("RenamedInBuild2", { rarity: "Common", level: 1 });

    migrate(state, catalog);

    expect(state.facts.held.has("RenamedInBuild2")).toBe(true);
    expect(state.facts.dataVersion).toBe("build-1");
  });
});

describe("the god pool", () => {
  it("keeps a god addressed by the bare name", () => {
    const outcome = withGodPool(["Hera"]);
    expect(outcome.state.facts.godPool.has("Hera")).toBe(true);
    expect(outcome.quarantine).toEqual([]);
  });

  /**
   * The loot table id is the id a god picker reaches for first bc it's the one
   * written inside the god's own record. A pool built out of it doesn't match
   * any requirements or member lists, and there's nothing at evaluation time
   * that can tell it apart from a run that has literally met nobody o_0.
   * Quarantining it is the only place in the system where that mistake would
   * actually make any kind of sound.
   */
  it("quarantines a god addressed by its loot table id", () => {
    const outcome = withGodPool(["ZeusUpgrade"]);
    expect(outcome.state.facts.godPool.has("ZeusUpgrade")).toBe(false);
    expect(outcome.quarantine).toEqual([{ path: "godPool", key: "ZeusUpgrade" }]);
  });

  function withGodPool(gods: string[]) {
    const state = oldRun();
    for (const god of gods) state.facts.godPool.add(god);
    return migrate(state, currentCatalog());
  }
});

describe("a slot", () => {
  it("is emptied but kept when only its occupant is gone", () => {
    const state = oldRun();
    state.facts.slots.set("Melee", "RenamedInBuild2");

    const outcome = migrate(state, currentCatalog());

    // "This run has a Melee slot and it's free" is both true and useful, while
    // "This run has no Melee slot" is yk neither :skull: :skull:.
    expect(outcome.state.facts.slots.has("Melee")).toBe(true);
    expect(outcome.state.facts.slots.get("Melee")).toBeNull();
    expect(outcome.quarantine).toEqual([
      { path: "slots", key: "Melee", value: "RenamedInBuild2", slot: "kept" },
    ]);
  });

  it("goes entirely when the slot itself is gone", () => {
    const state = oldRun();
    state.facts.slots.set("Shout", "HeraAttack");

    const outcome = migrate(state, currentCatalog());

    expect(outcome.state.facts.slots.has("Shout")).toBe(false);
    expect(outcome.quarantine).toEqual([
      { path: "slots", key: "Shout", value: "HeraAttack", slot: "unknown" },
    ]);
  });

  it("is left alone when it is known and empty", () => {
    const state = oldRun();
    state.facts.slots.set("Melee", null);

    const outcome = migrate(state, currentCatalog());

    expect(outcome.state.facts.slots.get("Melee")).toBeNull();
    expect(outcome.quarantine).toEqual([]);
  });
});

describe("the equipped kit", () => {
  it("quarantines a form the catalog no longer has", () => {
    const state = oldRun();
    state.facts.equipped.aspect = "AspectOfGoneAway";

    const outcome = migrate(state, currentCatalog());

    expect(outcome.state.facts.equipped.aspect).toBeUndefined();
    expect(outcome.quarantine).toEqual([
      { path: "equipped", key: "aspect", value: "AspectOfGoneAway" },
    ]);
  });

  it("keeps a form that is still a trait record", () => {
    const state = oldRun();
    state.facts.equipped.aspect = "ZeusAttack";

    const outcome = migrate(state, currentCatalog());

    expect(outcome.state.facts.equipped.aspect).toBe("ZeusAttack");
    expect(outcome.quarantine).toEqual([]);
  });

  it("quarantines a keepsake the catalog no longer has", () => {
    const state = oldRun();
    state.facts.equipped.keepsake = "OldKeepsake";

    const outcome = migrate(state, currentCatalog());

    expect(outcome.state.facts.equipped.keepsake).toBeUndefined();
    expect(outcome.quarantine).toEqual([
      { path: "equipped", key: "keepsake", value: "OldKeepsake" },
    ]);
  });

  /**
   * Nothing in the catalog names a weapon or a resource, so neither can be
   * checked. Both are display-only (i.e. no requirement reads either), so
   * carrying a stale one forward costs a wrong readout, while quarantining
   * against a list that doesn't actually exist would be uh inventing an answer.
   */
  it("carries the weapon and the resources through unchecked", () => {
    const state = oldRun();
    state.facts.equipped.weapon = "WeaponThatMayNotExist";
    state.facts.resources.set("DarknessThatMayNotExist", 400);

    const outcome = migrate(state, currentCatalog());

    expect(outcome.state.facts.equipped.weapon).toBe("WeaponThatMayNotExist");
    expect(outcome.state.facts.resources.get("DarknessThatMayNotExist")).toBe(400);
    expect(outcome.quarantine).toEqual([]);
  });
});

describe("Mirror talents", () => {
  it("quarantines a talent the catalog no longer names", () => {
    const state = oldRun();
    state.facts.equipped.talents = new Map([
      ["AmmoMetaUpgrade", "selected"],
      ["RetiredMetaUpgrade", "notSelected"],
    ]);

    const outcome = migrate(state, currentCatalog());

    expect([...(outcome.state.facts.equipped.talents ?? [])]).toEqual([
      ["AmmoMetaUpgrade", "selected"],
    ]);
    expect(outcome.quarantine).toEqual([
      { path: "talents", key: "RetiredMetaUpgrade", value: "notSelected" },
    ]);
  });

  /**
   * An empty talent map isn't the same fact as an absent one. Empty means the
   * rows were asked about and nothing is selected, which makes every trait they
   * gate impossible for the whole run. A migration that emptied the map would
   * be concluding that on the player's behalf out of a renamed id.
   */
  it("removes the map rather than emptying it when nothing survives", () => {
    const state = oldRun();
    state.facts.equipped.talents = new Map([["RetiredMetaUpgrade", "selected"]]);

    const outcome = migrate(state, currentCatalog());

    expect(outcome.state.facts.equipped.talents).toBeUndefined();
    expect(outcome.quarantine).toHaveLength(1);
  });

  /**
   * The other half of the same rule, and the one that runs the other way. A map
   * that arrived empty already *was* the answer "asked, and none selected", and
   * this pass did nothing to it, so deleting it would be the migration turning
   * a real answer back into "nobody asked" (silently and with nothing
   * quarantined to say so). The codec beside this keeps the distinction; the
   * scan has to keep it too, or one reload would undo what the other preserved.
   */
  it("keeps a map that arrived empty, having taken nothing out of it", () => {
    const state = oldRun();
    state.facts.equipped.talents = new Map();

    const outcome = migrate(state, currentCatalog());

    expect(outcome.state.facts.equipped.talents).toBeDefined();
    expect(outcome.state.facts.equipped.talents?.size).toBe(0);
    expect(outcome.quarantine).toEqual([]);
  });
});

describe("intent", () => {
  it("is scanned on the same terms as facts, notes and all", () => {
    const state = oldRun();
    state.intent.pins.add("RenamedInBuild2");
    state.intent.pins.add("HeraAttack");
    state.intent.planned.add("AlsoGone");
    state.intent.notes.set("GoneWithANote", "save this for the Hera duo");

    const outcome = migrate(state, currentCatalog());

    expect([...outcome.state.intent.pins]).toEqual(["HeraAttack"]);
    expect(outcome.state.intent.planned.size).toBe(0);
    expect(outcome.state.intent.notes.size).toBe(0);
    // The note text is the only thing in the whole run the player wrote
    // themselves, so it's the one entry where losing the value would be worse
    // than losing the id.
    expect(outcome.quarantine).toContainEqual({
      path: "notes",
      key: "GoneWithANote",
      value: "save this for the Hera duo",
    });
    expect(outcome.quarantine).toContainEqual({ path: "pins", key: "RenamedInBuild2" });
    expect(outcome.quarantine).toContainEqual({ path: "planned", key: "AlsoGone" });
  });
});

describe("bans", () => {
  it("are checked like any other trait reference", () => {
    const state = oldRun();
    state.facts.bans.add("BannedAndGone");

    const outcome = migrate(state, currentCatalog());

    expect(outcome.state.facts.bans.size).toBe(0);
    expect(outcome.quarantine).toEqual([{ path: "bans", key: "BannedAndGone" }]);
  });
});

describe("a stored id that collides with an inherited property name", () => {
  /**
   * A plain object answers to `toString`, `constructor`, and a few more, so
   * looking a trait up and testing the result against undefined would carry
   * those through as records that don't actually exist. There's nothing to stop
   * a game's own identifier being one of them.
   */
  it("is quarantined rather than mistaken for a record", () => {
    const state = oldRun();
    state.facts.held.set("toString", { rarity: "Common", level: 1 });
    state.intent.pins.add("constructor");

    const outcome = migrate(state, currentCatalog());

    expect(outcome.state.facts.held.size).toBe(0);
    expect(outcome.state.intent.pins.size).toBe(0);
    expect(outcome.quarantine).toHaveLength(2);
  });
});

describe("a run belonging to the other game", () => {
  /**
   * Left to the scan, this would look like a successful migration: nearly every
   * Hades I id is absent from the Hades II catalog, so the pass would quarantine
   * the entire run and report it cleanly. Refusing is what separates a caller
   * bug from a destroyed save.
   */
  it("is refused instead of quarantined wholesale", () => {
    const state = runOn("hades1", "build-1");
    state.facts.held.set("ZeusAttackTrait", { rarity: "Common", level: 1 });

    expect(() => migrate(state, currentCatalog())).toThrow(/hades1.*hades2/s);
    expect(state.facts.held.size).toBe(1);
  });
});
