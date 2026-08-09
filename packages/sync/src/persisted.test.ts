import { describe, expect, it } from "vitest";
import { STORE_VERSION, emptyRun, fromPersisted, toPersisted } from "./persisted.js";

function populated() {
  const state = emptyRun("hades2", "build-1");
  state.facts.held.set("HeraAttack", { rarity: "Epic", level: 3 });
  state.facts.godPool.add("Hera");
  state.facts.elements.set("Fire", 2);
  state.facts.slots.set("Melee", "HeraAttack");
  state.facts.slots.set("Ranged", null);
  state.facts.resources.set("Ash", 12);
  state.facts.bans.add("SomeVowedTrait");
  state.facts.equipped.weapon = "WeaponTorch";
  state.facts.equipped.aspect = "TorchAutofireAspect";
  state.facts.equipped.keepsake = "ForceHeraBoonKeepsake";
  state.intent.pins.add("HeraSecondary");
  state.intent.planned.add("ZeusAttack");
  state.intent.notes.set("HeraAttack", "keep at Epic");
  return state;
}

describe("a run written to storage and read back", () => {
  it("comes back with every collection intact", () => {
    const before = populated();

    const after = fromPersisted(JSON.parse(JSON.stringify(toPersisted({ state: before, quarantine: [] })))).state;

    expect(after).toEqual(before);
    // Structural equality is not enough on its own here: `toEqual` on two
    // empty Maps passes whatever they were built from, so the collections that
    // actually carry something are checked by hand.
    expect(after.facts.held.get("HeraAttack")).toEqual({ rarity: "Epic", level: 3 });
    expect(after.facts.slots.get("Ranged")).toBeNull();
    expect(after.intent.notes.get("HeraAttack")).toBe("keep at Epic");
  });

  it("carries quarantined entries with it", () => {
    const state = emptyRun("hades1", "build-1");
    const quarantine = [
      { path: "held", key: "GoneTrait", value: { rarity: "Common", level: 1 } },
    ] as const;

    const after = fromPersisted(JSON.parse(JSON.stringify(toPersisted({ state, quarantine: [...quarantine] }))));

    expect(after.quarantine).toEqual(quarantine);
  });
});

describe("the absent-versus-empty distinction for talents", () => {
  /**
   * These two states mean opposite things and JSON has one representation for
   * carelessness about the difference. Absent is "nobody asked", which reads as
   * an open question; empty is "asked, and none is selected", which makes every
   * trait the rows gate impossible for the whole run. A codec that wrote an
   * empty map for an absent one would turn the first into the second on the
   * next reload.
   */
  it("keeps an absent talent map absent", () => {
    const state = emptyRun("hades1", "build-1");

    const record = toPersisted({ state, quarantine: [] });
    expect(record.facts.equipped.talents).toBeUndefined();
    expect(fromPersisted(JSON.parse(JSON.stringify(record))).state.facts.equipped.talents).toBeUndefined();
  });

  it("keeps an empty talent map empty rather than dropping it", () => {
    const state = emptyRun("hades1", "build-1");
    state.facts.equipped.talents = new Map();

    const back = fromPersisted(JSON.parse(JSON.stringify(toPersisted({ state, quarantine: [] }))));

    expect(back.state.facts.equipped.talents).toBeDefined();
    expect(back.state.facts.equipped.talents?.size).toBe(0);
  });
});

describe("a record this build cannot read", () => {
  it("is refused when it comes from a newer store version", () => {
    const record = toPersisted({ state: emptyRun("hades2", "build-1"), quarantine: [] });
    record.storeVersion = STORE_VERSION + 1;

    expect(() => fromPersisted(record)).toThrow(/store version/);
  });

  it("is refused rather than repaired when it is not a run at all", () => {
    expect(() => fromPersisted(null)).toThrow();
    expect(() => fromPersisted({ storeVersion: STORE_VERSION })).toThrow(/facts or intent/);
  });

  it("is refused when it names a game that does not exist", () => {
    const record = toPersisted({ state: emptyRun("hades2", "build-1"), quarantine: [] });
    record.facts.game = "hades3" as never;

    expect(() => fromPersisted(record)).toThrow(/unknown game/);
  });
});
