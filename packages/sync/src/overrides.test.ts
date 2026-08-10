import { describe, expect, it } from "vitest";
import { type FactOverride, factKey, mergeFacts, overlayOf } from "./overrides.js";
import { testFacts } from "./test-support.js";

/** The facts a merge is laid over, with something in every collection. */
function source() {
  return testFacts({
    held: new Map([["HeraAttack", { rarity: "Common" as const, level: 1 }]]),
    godPool: new Set(["Hera"]),
    elements: new Map([["Fire" as const, 2]]),
    slots: new Map([["Melee", "HeraAttack" as string | null]]),
    resources: new Map([["Ash", 12]]),
    bans: new Set(["BannedTrait"]),
    equipped: { weapon: "WeaponTorch", keepsake: "ForceHeraBoonKeepsake" },
  });
}

function merge(facts = source(), ...overrides: FactOverride[]) {
  return mergeFacts(facts, overlayOf(overrides));
}

describe("addressing a field", () => {
  it("gives one key per field, so overriding it again replaces", () => {
    const overlay = overlayOf([
      { path: "held", key: "HeraAttack", value: null },
      { path: "held", key: "HeraAttack", value: { rarity: "Epic", level: 3 } },
    ]);

    expect(overlay.overrides.size).toBe(1);
    expect(merge(source(), ...overlay.overrides.values()).held.get("HeraAttack")).toEqual({
      rarity: "Epic",
      level: 3,
    });
  });

  it("keeps the same id under two paths apart", () => {
    expect(factKey({ path: "held", key: "X", value: null })).not.toBe(
      factKey({ path: "bans", trait: "X", present: true }),
    );
    expect(
      overlayOf([
        { path: "held", key: "X", value: null },
        { path: "bans", trait: "X", present: true },
      ]).overrides.size,
    ).toBe(2);
  });
});

describe("laying overrides over the facts", () => {
  it("sets and removes a held boon", () => {
    expect(
      merge(source(), { path: "held", key: "ZeusAttack", value: { rarity: "Rare", level: 2 } })
        .held.get("ZeusAttack"),
    ).toEqual({ rarity: "Rare", level: 2 });

    expect(merge(source(), { path: "held", key: "HeraAttack", value: null }).held.size).toBe(0);
  });

  it("adds and removes a god and a ban by presence", () => {
    const facts = merge(
      source(),
      { path: "godPool", god: "Zeus", present: true },
      { path: "godPool", god: "Hera", present: false },
      { path: "bans", trait: "BannedTrait", present: false },
    );

    expect([...facts.godPool]).toEqual(["Zeus"]);
    expect(facts.bans.size).toBe(0);
  });

  /**
   * A count of zero is set instead of deleted. The two read the same to the
   * only atom that asks (an absent element counts as zero) so normalizing
   * here would be this layer deciding that what the user said and what the
   * facts happen to omit are the same singular thing.
   */
  it("states an element or resource count, including zero", () => {
    const facts = merge(
      source(),
      { path: "elements", element: "Fire", value: 0 },
      { path: "resources", resource: "Ash", value: 40 },
    );

    expect(facts.elements.get("Fire")).toBe(0);
    expect(facts.elements.has("Fire")).toBe(true);
    expect(facts.resources.get("Ash")).toBe(40);
  });

  /**
   * The two nulls in the union mean opposite things. A slot's null is a value
   * (i.e. the slot is here and it's free) while the equipped kit's null is an
   * absence (bc "nothing equipped" is what an optional field spells by not
   * yk being there lol).
   */
  it("empties a slot without removing it, and unequips by removing the field", () => {
    const facts = merge(
      source(),
      { path: "slots", slot: "Melee", value: null },
      { path: "equipped", field: "keepsake", value: null },
      { path: "equipped", field: "aspect", value: "TorchAutofireAspect" },
    );

    expect(facts.slots.has("Melee")).toBe(true);
    expect(facts.slots.get("Melee")).toBeNull();
    expect("keepsake" in facts.equipped).toBe(false);
    expect(facts.equipped.aspect).toBe("TorchAutofireAspect");
  });

  it("answers one talent without touching the others", () => {
    const facts = source();
    facts.equipped.talents = new Map([["AmmoMetaUpgrade", "selected"]]);

    const merged = merge(facts, {
      path: "talents",
      talent: "ReloadAmmoMetaUpgrade",
      selection: "notSelected",
    });

    expect(merged.equipped.talents?.get("AmmoMetaUpgrade")).toBe("selected");
    expect(merged.equipped.talents?.get("ReloadAmmoMetaUpgrade")).toBe("notSelected");
  });

  it("takes a talent back to nobody-asked by removing the key", () => {
    const facts = source();
    facts.equipped.talents = new Map([
      ["AmmoMetaUpgrade", "selected"],
      ["ReloadAmmoMetaUpgrade", "notSelected"],
    ]);

    const merged = merge(facts, {
      path: "talents",
      talent: "AmmoMetaUpgrade",
      selection: null,
    });

    expect(merged.equipped.talents?.has("AmmoMetaUpgrade")).toBe(false);
    expect(merged.equipped.talents?.get("ReloadAmmoMetaUpgrade")).toBe("notSelected");
  });

  /**
   * The trap this shape exists to avoid. Absent means nobody asked and reads as
   * an open question, while empty means asked and none selected (which means a
   * permanent Impossible for every trait that those rows gate). A merge that
   * answered a talent and then un-answered it must not leave the second where
   * it actually found the first.
   */
  it("leaves an unasked talent map absent rather than manufacturing an empty one", () => {
    const facts = source();
    expect(facts.equipped.talents).toBeUndefined();

    const merged = merge(facts, {
      path: "talents",
      talent: "AmmoMetaUpgrade",
      selection: null,
    });

    expect(merged.equipped.talents).toBeUndefined();
  });
});

describe("what the merge shares and what it copies", () => {
  /**
   * Identity is the contract, not an optimization. Every write in a source
   * hands out a whole new facts object with untouched collections shared, so a
   * consumer can tell "something changed" from the object it's holding. A
   * merge that rebuilt everything would make every one of those checks say yes.
   */
  it("hands back the source itself when nothing is overridden", () => {
    const facts = source();

    expect(mergeFacts(facts, overlayOf([]))).toBe(facts);
  });

  it("shares every collection no override addressed", () => {
    const facts = source();

    const merged = merge(facts, { path: "held", key: "HeraAttack", value: null });

    expect(merged).not.toBe(facts);
    expect(merged.held).not.toBe(facts.held);
    expect(merged.godPool).toBe(facts.godPool);
    expect(merged.elements).toBe(facts.elements);
    expect(merged.slots).toBe(facts.slots);
    expect(merged.resources).toBe(facts.resources);
    expect(merged.bans).toBe(facts.bans);
    expect(merged.equipped).toBe(facts.equipped);
  });

  it("leaves the source facts exactly as they were", () => {
    const facts = source();

    merge(
      facts,
      { path: "held", key: "HeraAttack", value: null },
      { path: "godPool", god: "Zeus", present: true },
      { path: "equipped", field: "weapon", value: null },
    );

    expect(facts.held.has("HeraAttack")).toBe(true);
    expect(facts.godPool.has("Zeus")).toBe(false);
    expect(facts.equipped.weapon).toBe("WeaponTorch");
  });

  /**
   * The property the contract states outright: set an override, clear it, and
   * the merge is the source again. Asserted by identity instead of by value,
   * which is the stronger claim and the one a memoizing consumer depends on.
   */
  it("comes back to the source object once the override is cleared", () => {
    const facts = source();
    const overlay = overlayOf([{ path: "held", key: "HeraAttack", value: null }]);

    expect(mergeFacts(facts, overlay)).not.toBe(facts);
    overlay.overrides.delete(factKey({ path: "held", key: "HeraAttack", value: null }));

    expect(mergeFacts(facts, overlay)).toBe(facts);
  });
});
