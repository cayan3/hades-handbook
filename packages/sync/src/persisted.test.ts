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

describe("the fields the user is holding by hand", () => {
  const overrides = [
    { path: "held", key: "HeraAttack", value: null },
    { path: "godPool", god: "Zeus", present: true },
    { path: "slots", slot: "Melee", value: null },
    { path: "elements", element: "Fire", value: 0 },
    { path: "resources", resource: "Ash", value: 3 },
    { path: "bans", trait: "ZeusAttack", present: false },
    { path: "equipped", field: "keepsake", value: null },
    { path: "talents", talent: "AmmoMetaUpgrade", selection: "notSelected" },
  ] as const;

  it("survives the round trip in the shape they went in", () => {
    const state = emptyRun("hades2", "build-1");

    const back = fromPersisted(
      JSON.parse(JSON.stringify(toPersisted({ state, quarantine: [], overrides: [...overrides] }))),
    );

    expect(back.overrides).toEqual(overrides);
  });

  /**
   * The route the store version does not have to move for: the field is
   * optional and additive, so a record written before it existed reads back
   * meaning exactly what it did — nothing held by hand.
   */
  it("are absent from a record that has none, and read back as none", () => {
    const record = toPersisted({ state: emptyRun("hades2", "build-1"), quarantine: [] });

    expect("overrides" in record).toBe(false);
    expect(fromPersisted(JSON.parse(JSON.stringify(record))).overrides).toEqual([]);
  });

  it("keep a run readable by a build that never heard of them", () => {
    const record = toPersisted({
      state: emptyRun("hades2", "build-1"),
      quarantine: [],
      overrides: [...overrides],
    });
    const { overrides: _dropped, ...asAnOlderBuildWroteIt } = record;

    expect(fromPersisted(asAnOlderBuildWroteIt).overrides).toEqual([]);
    expect(fromPersisted(asAnOlderBuildWroteIt).state.facts.held.size).toBe(0);
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

  /**
   * The quarantine is the one field here whose whole purpose is to be read back
   * later, by something that will put the values where they came from. Handing
   * it through unchecked is the one place this decoder would repair by
   * omission: an entry with a path nothing recognises survives every reload,
   * counts toward the notice, and cannot be restored by anybody.
   */
  it("is refused when the quarantine is not a list of entries", () => {
    const withQuarantine = (quarantine: unknown) => {
      const record = toPersisted({ state: emptyRun("hades2", "build-1"), quarantine: [] });
      return { ...record, quarantine } as never;
    };

    expect(() => fromPersisted(withQuarantine({}))).toThrow(/quarantine/);
    expect(() => fromPersisted(withQuarantine([null]))).toThrow(/quarantine/);
    expect(() => fromPersisted(withQuarantine([{ path: "nowhere", key: "x" }]))).toThrow(
      /quarantine/,
    );
    expect(() => fromPersisted(withQuarantine([{ path: "held" }]))).toThrow(/quarantine/);
    expect(() => fromPersisted(withQuarantine([{ path: "held", key: 7 }]))).toThrow(/quarantine/);
  });

  /**
   * Held to a stricter standard than the quarantine beside it, and the
   * difference is the reason: a quarantined value is set aside and handed to
   * nobody, while an override's value is merged into the facts and read by
   * evaluation. A count that came back a string would throw nowhere —
   * evaluation is total — it would quietly answer a comparison wrong.
   */
  it("is refused when an override is not one", () => {
    const withOverrides = (overrides: unknown) => {
      const record = toPersisted({ state: emptyRun("hades2", "build-1"), quarantine: [] });
      return { ...record, overrides } as never;
    };

    expect(() => fromPersisted(withOverrides({}))).toThrow(/overrides are not a list/);
    expect(() => fromPersisted(withOverrides([null]))).toThrow(/not an object/);
    expect(() => fromPersisted(withOverrides([{ path: "nowhere", key: "x" }]))).toThrow(
      /unknown field/,
    );
    expect(() => fromPersisted(withOverrides([{ path: "held", value: null }]))).toThrow(/no key/);
    expect(() => fromPersisted(withOverrides([{ path: "elements", element: "Fire" }]))).toThrow(
      /wrong shape/,
    );
    expect(
      () => fromPersisted(withOverrides([{ path: "elements", element: "Fire", value: "2" }])),
    ).toThrow(/wrong shape/);
    expect(() => fromPersisted(withOverrides([{ path: "godPool", god: "Hera" }]))).toThrow(
      /whether the god is in/,
    );
    expect(
      () => fromPersisted(withOverrides([{ path: "equipped", field: "hat", value: null }])),
    ).toThrow(/field of the equipped kit/);
    expect(
      () => fromPersisted(withOverrides([{ path: "talents", talent: "A", selection: "maybe" }])),
    ).toThrow(/neither answer nor absence/);
  });

  /**
   * The held arm carries a record rather than a scalar, and it is the only one
   * whose value decides a verdict: evaluation compares `level` against a
   * requirement's minimum. A level that comes back missing or as a string makes
   * that comparison false, so the boon reads as unheld — while every set-shaped
   * question about the same run still counts it, because those ask only whether
   * the key is there. One run answering "you have a boon of this god" yes and
   * "you have this boon" no is the failure worth a load-time refusal.
   */
  it("is refused when a held override carries something that is not a held trait", () => {
    const withOverrides = (overrides: unknown) => {
      const record = toPersisted({ state: emptyRun("hades2", "build-1"), quarantine: [] });
      return { ...record, overrides } as never;
    };
    const held = (value: unknown) => withOverrides([{ path: "held", key: "HeraAttack", value }]);

    expect(() => fromPersisted(held({}))).toThrow(/wrong shape/);
    expect(() => fromPersisted(held({ rarity: "Common" }))).toThrow(/wrong shape/);
    expect(() => fromPersisted(held({ rarity: "Common", level: "2" }))).toThrow(/wrong shape/);
    expect(() => fromPersisted(held({ level: 2 }))).toThrow(/wrong shape/);

    // Both shapes the field is allowed to take still read.
    expect(fromPersisted(held(null)).overrides).toHaveLength(1);
    expect(fromPersisted(held({ rarity: "Common", level: 2 })).overrides).toHaveLength(1);
  });

  /**
   * The identical hole one field over, and in the field evaluation reads most.
   * A held boon was decoded straight into the map with no check at all, so a
   * `{}` beside a real trait id produced the same split answer an override now
   * cannot: unheld to `hasTrait`, held to everything that asks about the god.
   *
   * Refusing is affordable because a refusal no longer strands anybody — the
   * record is set aside, a fresh run starts, and the load says so on screen.
   */
  it("is refused when a held boon carries no level or rarity", () => {
    const withHeld = (held: unknown) => {
      const record = toPersisted({ state: emptyRun("hades2", "build-1"), quarantine: [] });
      return { ...record, facts: { ...record.facts, held } } as never;
    };

    expect(() => fromPersisted(withHeld({}))).toThrow(/not a list/);
    expect(() => fromPersisted(withHeld([["HeraAttack"]]))).toThrow(/no level or rarity/);
    expect(() => fromPersisted(withHeld([["HeraAttack", {}]]))).toThrow(/no level or rarity/);
    expect(() => fromPersisted(withHeld([["HeraAttack", { rarity: "Common" }]]))).toThrow(
      /no level or rarity/,
    );
    expect(() => fromPersisted(withHeld([["HeraAttack", { rarity: "Common", level: "2" }]]))).toThrow(
      /no level or rarity/,
    );
    expect(() => fromPersisted(withHeld([[7, { rarity: "Common", level: 1 }]]))).toThrow(/no id/);

    const good = fromPersisted(withHeld([["HeraAttack", { rarity: "Common", level: 2 }]]));
    expect(good.state.facts.held.get("HeraAttack")).toEqual({ rarity: "Common", level: 2 });
  });

  it("reads a record that carries no quarantine at all", () => {
    const record = toPersisted({ state: emptyRun("hades2", "build-1"), quarantine: [] });
    const { quarantine: _dropped, ...withoutIt } = record;

    // Absent is a shape this build can read — an empty one. Present and wrong
    // is not, which is the distinction above.
    expect(fromPersisted(withoutIt).quarantine).toEqual([]);
  });
});
