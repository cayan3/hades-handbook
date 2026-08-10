import type { GameId } from "@repo/core";
import { describe, expect, it } from "vitest";
import type { SyncCatalog } from "./catalog-view.js";
import { openManualSource } from "./manual-source.js";
import { STORE_VERSION, emptyRun, fromPersisted, toPersisted } from "./persisted.js";
import { type RunSlot, type RunStore, createMemoryStore } from "./store.js";
import { testCatalog, testRow, testTrait, traitTable } from "./test-support.js";

/**
 * A world with two gods who share a slot, one god who never takes a pool slot,
 * a weapon form, a keepsake and a Mirror row — which is the smallest set that
 * can tell every one of this source's bookkeeping rules apart.
 */
function world(): SyncCatalog {
  return testCatalog({
    game: "hades2",
    dataVersion: "build-1",
    traits: traitTable(
      testTrait("HeraAttack", { god: "Hera", slot: "Melee", rarity: ["Common", "Rare"] }),
      testTrait("ZeusAttack", { god: "Zeus", slot: "Melee" }),
      testTrait("HeraSpecial", { god: "Hera", slot: "Secondary" }),
      testTrait("HermesDash", { god: "Hermes", godKind: "NonPoolSlot" }),
      testTrait("Unattributed"),
      testTrait("TorchAutofireAspect", { slot: "Aspect" }),
    ),
    gods: new Set(["Hera", "Zeus", "Hermes"]),
    keepsakes: new Set(["ForceHeraBoonKeepsake"]),
    slots: new Set(["Melee", "Secondary", "Aspect"]),
    talents: new Set(["AmmoMetaUpgrade", "ReloadAmmoMetaUpgrade"]),
    mirrorRows: [testRow("Cast", "AmmoMetaUpgrade", "ReloadAmmoMetaUpgrade")],
  });
}

function open(store: RunStore = createMemoryStore()) {
  return openManualSource({ game: "hades2", catalog: world(), store });
}

describe("marking a boon", () => {
  it("holds it and puts its god in the pool", async () => {
    const source = await open();

    source.mark("HeraAttack");

    expect(source.getFacts().held.get("HeraAttack")).toEqual({ rarity: "Common", level: 1 });
    expect([...source.getFacts().godPool]).toEqual(["Hera"]);
    expect(source.getFacts().slots.get("Melee")).toBe("HeraAttack");
  });

  it("takes the rarity and level when the caller knows them", async () => {
    const source = await open();

    source.mark("HeraAttack", { rarity: "Rare", level: 3 });

    expect(source.getFacts().held.get("HeraAttack")).toEqual({ rarity: "Rare", level: 3 });
  });

  it("adds no god for a trait the game attributes to nobody", async () => {
    const source = await open();

    source.mark("Unattributed");

    expect(source.getFacts().godPool.size).toBe(0);
  });

  /**
   * Hermes hands out boons without ever claiming a pool slot, and the pool
   * records him anyway: a reward really was taken from him. Filtering here
   * would throw away a true fact to protect an arithmetic that is counted
   * somewhere else, by the side that has the catalog to say which gods hold a
   * slot.
   */
  it("records a god who takes no pool slot, without filtering", async () => {
    const source = await open();

    source.mark("HermesDash");

    expect(source.getFacts().godPool.has("Hermes")).toBe(true);
  });

  it("refuses an id the catalog does not have", async () => {
    const source = await open();

    expect(() => {
      source.mark("NotATrait");
    }).toThrow(/no trait/);
  });

  /**
   * A weapon form is equipped, never held. Recording one as a held trait is
   * silent when it happens and leaves every aspect conflict in the run inert,
   * so the one place it can be caught is the write.
   */
  it("refuses a weapon form and says where it belongs", async () => {
    const source = await open();

    expect(() => {
      source.mark("TorchAutofireAspect");
    }).toThrow(/equipAspect/);
    expect(source.getFacts().held.size).toBe(0);
  });
});

describe("a second boon in an occupied slot", () => {
  it("displaces the first, which leaves the run entirely", async () => {
    const source = await open();
    source.mark("HeraAttack");

    source.mark("ZeusAttack");

    expect(source.getFacts().held.has("HeraAttack")).toBe(false);
    expect(source.getFacts().held.has("ZeusAttack")).toBe(true);
    expect(source.getFacts().slots.get("Melee")).toBe("ZeusAttack");
  });

  /**
   * The displaced boon's god stays. This is the purge shape rather than the
   * correction shape: the reward was genuinely taken from Hera, and losing the
   * boon afterwards does not undo the pickup, so it never frees a slot.
   */
  it("keeps the displaced boon's god in the pool", async () => {
    const source = await open();
    source.mark("HeraAttack");

    source.mark("ZeusAttack");

    expect([...source.getFacts().godPool].sort()).toEqual(["Hera", "Zeus"]);
  });

  it("leaves boons in other slots alone", async () => {
    const source = await open();
    source.mark("HeraSpecial");
    source.mark("HeraAttack");

    source.mark("ZeusAttack");

    expect(source.getFacts().held.has("HeraSpecial")).toBe(true);
    expect(source.getFacts().slots.get("Secondary")).toBe("HeraSpecial");
  });
});

describe("removal, which is two different actions", () => {
  it("takes the god back out of the pool on a correction", async () => {
    const source = await open();
    source.mark("HeraAttack");

    source.remove("HeraAttack");

    expect(source.getFacts().held.size).toBe(0);
    expect(source.getFacts().godPool.size).toBe(0);
    expect(source.getFacts().slots.get("Melee")).toBeNull();
  });

  it("keeps the god when a correction leaves another of their boons held", async () => {
    const source = await open();
    source.mark("HeraAttack");
    source.mark("HeraSpecial");

    source.remove("HeraAttack");

    expect(source.getFacts().godPool.has("Hera")).toBe(true);
  });

  it("keeps the god on a purge, since the pickup is not undone", async () => {
    const source = await open();
    source.mark("HeraAttack");

    source.purge("HeraAttack");

    expect(source.getFacts().held.size).toBe(0);
    expect(source.getFacts().godPool.has("Hera")).toBe(true);
    expect(source.getFacts().slots.get("Melee")).toBeNull();
  });

  /**
   * A correction asks whether anything still holds the god in the pool, and
   * `held` on its own gives the wrong answer four ways. Three rules put a god
   * there and deliberately leave them with no boon to show for it — recorded
   * directly, purged, displaced — and the migration removes a boon while
   * keeping its god for the same reason. Reading `held` treats every one of
   * those as though it never happened, so a correction *somewhere else in the
   * run* silently deleted a god who really was met.
   *
   * The direction is the merciful one — an under-reported pool reads as more
   * reachable, never less — which is exactly why it would never have been
   * noticed from the outside.
   */
  it("keeps a god who was recorded without a boon", async () => {
    const source = await open();
    source.addGod("Hera");
    source.mark("HeraAttack");

    source.remove("HeraAttack");

    expect(source.getFacts().godPool.has("Hera")).toBe(true);
  });

  it("keeps a god whose other boon was purged", async () => {
    const source = await open();
    source.mark("HeraAttack");
    source.purge("HeraAttack");
    source.mark("HeraSpecial");

    source.remove("HeraSpecial");

    expect(source.getFacts().godPool.has("Hera")).toBe(true);
  });

  it("keeps a god whose other boon was displaced", async () => {
    const source = await open();
    source.mark("HeraAttack");
    source.mark("ZeusAttack"); // displaces Hera's, and the pool keeps her
    source.mark("HeraSpecial");

    source.remove("HeraSpecial");

    expect(source.getFacts().godPool.has("Hera")).toBe(true);
  });

  it("still drops a god whose only boon really was a mis-tap", async () => {
    const source = await open();
    source.mark("HeraAttack");

    source.remove("HeraAttack");

    expect(source.getFacts().godPool.has("Hera")).toBe(false);
  });

  /**
   * A pool god with no held boon at all is standing on their own whatever put
   * them there, so the load can work that out by looking rather than by being
   * told. This is what repairs a run stored before any of this was recorded.
   */
  it("works out which gods stand alone from a record that never said", async () => {
    const store = createMemoryStore();
    const old = emptyRun("hades2", "build-1");
    old.facts.godPool.add("Hera"); // forced in by a keepsake, three builds ago
    old.facts.held.set("ZeusAttack", { rarity: "Common", level: 1 });
    old.facts.godPool.add("Zeus");
    await store.save("hades2", "active", toPersisted({ state: old, quarantine: [] }));

    const source = await open(store);
    source.mark("HeraAttack");
    source.remove("HeraAttack");

    expect(source.getFacts().godPool.has("Hera")).toBe(true);
  });

  /**
   * The one case this cannot get right, pinned so it is a known limit rather
   * than a surprise. A migration removes a held boon and keeps its god — but
   * the record it removed is precisely the one the catalog can no longer
   * identify, so nothing anywhere can say whose boon it was. If the god still
   * has another boon held, the load cannot tell this apart from an ordinary
   * one-boon god, and a later correction drops them.
   *
   * Left alone deliberately. The alternative — treating every pool god as
   * standing once any held id is quarantined — would switch off the correction
   * rule for the rest of the run on the strength of an unrelated event, which
   * trades a rare wrong answer for a permanent one. The error runs in the
   * forgiving direction: an under-reported pool reads as more reachable, never
   * less.
   */
  it("cannot keep a god whose only other boon was quarantined, and does not pretend to", async () => {
    const store = createMemoryStore();
    const old = emptyRun("hades2", "build-0");
    old.facts.held.set("HeraBoonGoneInBuild1", { rarity: "Common", level: 1 });
    old.facts.held.set("HeraAttack", { rarity: "Common", level: 1 });
    old.facts.godPool.add("Hera");
    await store.save("hades2", "active", toPersisted({ state: old, quarantine: [] }));

    const source = await open(store);
    source.remove("HeraAttack");

    expect(source.getFacts().godPool.has("Hera")).toBe(false);
  });

  it("remembers which gods stand on their own across a reload", async () => {
    const store = createMemoryStore();
    const first = await open(store);
    first.addGod("Hera");
    first.mark("HeraAttack");
    await first.flush();

    const second = await open(store);
    second.remove("HeraAttack");

    expect(second.getFacts().godPool.has("Hera")).toBe(true);
  });

  it("does nothing for a boon that was never held", async () => {
    const source = await open();
    const before = source.getFacts();

    source.remove("HeraAttack");
    source.purge("HeraAttack");

    expect(source.getFacts()).toBe(before);
  });
});

describe("recording a god directly", () => {
  it("accepts the bare name every requirement speaks", async () => {
    const source = await open();

    source.addGod("Zeus");

    expect(source.getFacts().godPool.has("Zeus")).toBe(true);
  });

  /**
   * The loot table id is what a god picker built out of the god records would
   * write, and a pool full of them matches no requirement and no member list.
   * Nothing downstream can tell that apart from a run that has met nobody, so
   * the write is the only place it can be refused.
   */
  it("refuses the loot table id, which is the mistake a god picker makes", async () => {
    const source = await open();

    expect(() => {
      source.addGod("ZeusUpgrade");
    }).toThrow(/bare name/);
    expect(source.getFacts().godPool.size).toBe(0);
  });
});

describe("the equipped kit", () => {
  it("puts a weapon form in the equipped aspect and nowhere else", async () => {
    const source = await open();

    source.equipAspect("TorchAutofireAspect");

    expect(source.getFacts().equipped.aspect).toBe("TorchAutofireAspect");
    expect(source.getFacts().held.has("TorchAutofireAspect")).toBe(false);
  });

  it("clears the form when the run has none", async () => {
    const source = await open();
    source.equipAspect("TorchAutofireAspect");

    source.equipAspect(null);

    expect(source.getFacts().equipped.aspect).toBeUndefined();
    expect("aspect" in source.getFacts().equipped).toBe(false);
  });

  it("refuses a keepsake the catalog does not have", async () => {
    const source = await open();

    expect(() => {
      source.equipKeepsake("NotAKeepsake");
    }).toThrow(/no keepsake/);
  });

  /**
   * The other half of the rule `mark` enforces. Forms go in the equipped kit
   * and boons go in `held`, and until now only one direction was checked — a
   * boon written here was accepted, where it would sit in the field aspect
   * conflicts are read from and match none of them, which is inert rather than
   * loud.
   */
  it("refuses a boon where a weapon form belongs", async () => {
    const source = await open();

    expect(() => {
      source.equipAspect("HeraAttack");
    }).toThrow(/not a weapon form/);
    expect(source.getFacts().equipped.aspect).toBeUndefined();
  });

  /**
   * And is silent where the data is. Hades I marks none of its forms, so the
   * check is written against the marker rather than a list of ids: it declines
   * to judge a catalog that never says which records are forms, and starts
   * working the moment one does. Same partiality `mark` has, for the same
   * reason, and it closes itself the same way.
   */
  it("says nothing about a catalog that marks no forms at all", async () => {
    const unmarked = testCatalog({
      ...world(),
      traits: traitTable(testTrait("ShieldLoadAmmoTrait"), testTrait("HeraAttack", { god: "Hera" })),
      slots: new Set(["Melee", "Secondary"]),
    });
    const source = await openManualSource({
      game: "hades2",
      catalog: unmarked,
      store: createMemoryStore(),
    });

    source.equipAspect("ShieldLoadAmmoTrait");

    expect(source.getFacts().equipped.aspect).toBe("ShieldLoadAmmoTrait");
  });
});

describe("answering a Mirror row", () => {
  /**
   * Both members are written every time. The unchosen one is a definite no for
   * the whole run, and leaving it out would make it look uncollected — merely
   * imprecise. The opposite mistake is the dangerous one and is what makes this
   * take a row rather than a talent: a "not selected" written for a row nobody
   * was asked about makes everything that row gates impossible.
   */
  it("writes both members, one selected and one not", async () => {
    const source = await open();

    source.answerMirrorRow("Cast", "AmmoMetaUpgrade");

    expect([...(source.getFacts().equipped.talents ?? [])].sort()).toEqual([
      ["AmmoMetaUpgrade", "selected"],
      ["ReloadAmmoMetaUpgrade", "notSelected"],
    ]);
  });

  it("writes both as not selected when the answer is none", async () => {
    const source = await open();

    source.answerMirrorRow("Cast", null);

    expect([...(source.getFacts().equipped.talents ?? [])].sort()).toEqual([
      ["AmmoMetaUpgrade", "notSelected"],
      ["ReloadAmmoMetaUpgrade", "notSelected"],
    ]);
  });

  it("refuses a talent that is not in the row", async () => {
    const source = await open();

    expect(() => {
      source.answerMirrorRow("Cast", "FirstStrikeMetaUpgrade");
    }).toThrow(/not a member/);
  });

  it("refuses a row the catalog does not carry", async () => {
    const source = await open();

    expect(() => {
      source.answerMirrorRow("Presence", null);
    }).toThrow(/no Mirror row/);
  });
});

describe("answering one talent on its own", () => {
  /**
   * The same question reaching the same map, differing only in which set the id
   * is checked against — and that is the whole point of it. The row form checks
   * `mirrorRows`, which no shipped catalog populates, so it throws on every
   * call; this checks `talents`, which carries every talent a requirement gates
   * on. Nothing else about the answer changes.
   */
  it("writes the one key it was asked about, and no other", async () => {
    const source = await open();

    source.answerTalent("AmmoMetaUpgrade", "selected");

    expect([...(source.getFacts().equipped.talents ?? [])]).toEqual([
      ["AmmoMetaUpgrade", "selected"],
    ]);
  });

  it("records a definite no, which is a different answer from silence", async () => {
    const source = await open();

    source.answerTalent("AmmoMetaUpgrade", "notSelected");

    expect(source.getFacts().equipped.talents?.get("AmmoMetaUpgrade")).toBe("notSelected");
    // The partner was never asked about, so it has no key at all — which reads
    // as an open question rather than as a second no.
    expect(source.getFacts().equipped.talents?.has("ReloadAmmoMetaUpgrade")).toBe(false);
  });

  /**
   * Un-answering has to reach *absent*, not *empty*. An empty map is the
   * run-wide "asked, and none is selected", so a user taking back their last
   * answer would otherwise be making the strongest statement available — the
   * mistake the three-state shape exists to prevent, arriving from the one
   * direction that looks like tidying up.
   */
  it("takes the map back to absent when the last answer is withdrawn", async () => {
    const source = await open();
    source.answerTalent("AmmoMetaUpgrade", "notSelected");
    source.answerTalent("ReloadAmmoMetaUpgrade", "notSelected");

    source.answerTalent("AmmoMetaUpgrade", null);
    expect(source.getFacts().equipped.talents?.size).toBe(1);

    source.answerTalent("ReloadAmmoMetaUpgrade", null);
    expect(source.getFacts().equipped.talents).toBeUndefined();
  });

  it("refuses a talent the catalog cannot name", async () => {
    const source = await open();

    expect(() => {
      source.answerTalent("NotATalent", "selected");
    }).toThrow(/no talent/);
    expect(source.getFacts().equipped.talents).toBeUndefined();
  });

  it("is takeable back like any other edit", async () => {
    const source = await open();
    source.answerTalent("AmmoMetaUpgrade", "selected");

    expect(source.lastEdit).toEqual({ action: "answerTalent", subject: "AmmoMetaUpgrade" });
    source.undo();

    expect(source.getFacts().equipped.talents).toBeUndefined();
  });
});

describe("intent", () => {
  it("refuses a pin or a plan on an id the catalog does not have", async () => {
    const source = await open();

    expect(() => {
      source.pin("NotATrait");
    }).toThrow(/no trait/);
    expect(() => {
      source.plan("NotATrait");
    }).toThrow(/no trait/);
  });

  /**
   * A note is the one thing in a run the player wrote, so an unmatched id costs
   * more here than anywhere else: the next update quarantines it, and what gets
   * quarantined is their sentence.
   */
  it("refuses a note on an id the catalog does not have", async () => {
    const source = await open();

    expect(() => {
      source.setNote("NotATrait", "save this for the Hera duo");
    }).toThrow(/no trait/);
    expect(source.getState().intent.notes.size).toBe(0);
  });

  it("clears a note without asking whether the trait is still there", async () => {
    const source = await open();

    expect(() => {
      source.setNote("NotATrait", "");
    }).not.toThrow();
  });

  it("removes a pin, a plan and a note it was given", async () => {
    const source = await open();
    source.pin("HeraAttack");
    source.plan("HeraSpecial");
    source.setNote("HeraAttack", "upgrade this");

    source.unpin("HeraAttack");
    source.unplan("HeraSpecial");
    source.setNote("HeraAttack", "");

    expect(source.getState().intent.pins.size).toBe(0);
    expect(source.getState().intent.planned.size).toBe(0);
    expect(source.getState().intent.notes.size).toBe(0);
  });
});

describe("the port surface", () => {
  it("reports a manual source as connected and writable", async () => {
    const source = await open();

    expect(source.status).toBe("connected");
    expect(source.capabilities.canWrite).toBe(true);
  });

  it("hands out a new facts object per edit, so a memoized read invalidates", async () => {
    const source = await open();
    const before = source.getFacts();

    source.mark("HeraAttack");

    expect(source.getFacts()).not.toBe(before);
    expect(before.held.size).toBe(0);
  });

  it("notifies subscribers until they unsubscribe", async () => {
    const source = await open();
    const seen: number[] = [];
    const unsub = source.subscribe((facts) => seen.push(facts.held.size));

    source.mark("HeraAttack");
    unsub();
    source.mark("HeraSpecial");

    expect(seen).toEqual([1]);
  });

  it("never lets a source write intent through a facts path", async () => {
    const source = await open();
    source.pin("HeraAttack");

    source.mark("HeraSpecial");

    expect([...source.getState().intent.pins]).toEqual(["HeraAttack"]);
  });
});

describe("persistence", () => {
  it("survives closing and reopening", async () => {
    const store = createMemoryStore();
    const first = await open(store);
    first.mark("HeraAttack", { rarity: "Rare", level: 2 });
    first.pin("HeraSpecial");
    first.setNote("HeraAttack", "upgrade this");
    await first.flush();

    const second = await open(store);

    expect(second.getFacts().held.get("HeraAttack")).toEqual({ rarity: "Rare", level: 2 });
    expect(second.getFacts().godPool.has("Hera")).toBe(true);
    expect([...second.getState().intent.pins]).toEqual(["HeraSpecial"]);
    expect(second.getState().intent.notes.get("HeraAttack")).toBe("upgrade this");
  });

  it("keeps the last edit as the last write when several are in flight", async () => {
    const store = createMemoryStore();
    const source = await open(store);

    source.mark("HeraAttack");
    source.mark("HeraSpecial");
    source.remove("HeraAttack");
    await source.flush();

    const reopened = await open(store);
    expect([...reopened.getFacts().held.keys()]).toEqual(["HeraSpecial"]);
  });

  it("moves a finished run into the second record and starts a fresh one", async () => {
    const store = createMemoryStore();
    const source = await open(store);
    source.mark("HeraAttack");

    await source.finishRun();

    expect(source.getFacts().held.size).toBe(0);
    expect(await store.load("hades2", "last")).not.toBeNull();
    const reopened = await open(store);
    expect(reopened.getFacts().held.size).toBe(0);
  });
});

describe("a store that fails a write", () => {
  /**
   * A write can fail for reasons that pass — a quota prompt, a private window,
   * a tab that lost its database. What must not happen is the failure taking
   * every later write with it: edits keep being accepted, nothing reaches
   * storage, and the run is silently lost at the next reload. That is the exact
   * shape this package exists to prevent, one layer down from the migration.
   */
  function flakyStore(): RunStore & { failNext: boolean } {
    const inner = createMemoryStore();
    const store = {
      failNext: false,
      load: inner.load.bind(inner),
      clear: inner.clear.bind(inner),
      save(game: Parameters<RunStore["save"]>[0], slot: Parameters<RunStore["save"]>[1], run: Parameters<RunStore["save"]>[2]) {
        if (store.failNext) {
          store.failNext = false;
          return Promise.reject(new Error("quota exceeded"));
        }
        return inner.save(game, slot, run);
      },
    };
    return store;
  }

  it("keeps persisting after the failure, and the next write recovers the lost one", async () => {
    const store = flakyStore();
    const source = await open(store);

    store.failNext = true;
    source.mark("HeraAttack");
    await source.flush().catch(() => undefined);

    source.mark("HeraSpecial");
    await source.flush();

    // Both, not just the second. Each write stores the whole run, so a write
    // that gets through carries everything the failed one would have — the
    // failure costs nothing as long as the chain is still running. Chained the
    // naive way it would not be: a rejected promise skips every `then` after
    // it, so this would read empty and go on reading empty for the life of the
    // page while every tap kept being accepted.
    const reopened = await open(store);
    expect([...reopened.getFacts().held.keys()].sort()).toEqual(["HeraAttack", "HeraSpecial"]);
  });

  it("reports the failure rather than throwing it at whoever tapped", async () => {
    const store = flakyStore();
    const source = await open(store);

    store.failNext = true;
    expect(() => {
      source.mark("HeraAttack");
    }).not.toThrow();

    await expect(source.flush()).rejects.toThrow(/quota/);
    expect(source.storageError?.message).toMatch(/quota/);
  });

  it("clears the reported failure once a write gets through", async () => {
    const store = flakyStore();
    const source = await open(store);
    store.failNext = true;
    source.mark("HeraAttack");
    await source.flush().catch(() => undefined);

    source.mark("HeraSpecial");
    await source.flush();

    expect(source.storageError).toBeNull();
  });
});

describe("finishing a run when a write fails", () => {
  /**
   * The two records move together or not at all. Ending a run is the one edit
   * that throws away what is in memory, so doing it before the write lands
   * leaves the run in exactly one place — the record the next tap overwrites.
   */
  function storeFailing(slot: RunSlot | null): RunStore & { failOn: RunSlot | null } {
    const inner = createMemoryStore();
    const store = {
      failOn: slot,
      load: inner.load.bind(inner),
      clear: inner.clear.bind(inner),
      save(game: GameId, target: RunSlot, run: Parameters<RunStore["save"]>[2]) {
        if (target === store.failOn) return Promise.reject(new Error("quota exceeded"));
        return inner.save(game, target, run);
      },
    };
    return store;
  }

  it("keeps the run when the finished record cannot be written", async () => {
    const store = storeFailing("last");
    const source = await open(store);
    source.mark("HeraAttack");
    await source.flush();

    await expect(source.finishRun()).rejects.toThrow(/quota/);

    // Still the run that was being played, in memory and in storage. Cleared
    // here, the only surviving copy would be the `active` record, and the very
    // next tap would write the empty run over it.
    expect(source.getFacts().held.has("HeraAttack")).toBe(true);
    expect(await store.load("hades2", "last")).toBeNull();
    expect((await store.load("hades2", "active"))?.facts.held).toHaveLength(1);
  });

  it("does not lose the run to the next tap after a failed finish", async () => {
    const store = storeFailing("last");
    const source = await open(store);
    source.mark("HeraAttack");
    await source.flush();
    await source.finishRun().catch(() => undefined);

    source.mark("HeraSpecial");
    await source.flush();

    const active = await store.load("hades2", "active");
    expect(active?.facts.held.map(([trait]) => trait).sort()).toEqual(["HeraAttack", "HeraSpecial"]);
  });

  it("keeps the run in memory when only the fresh record fails, so a retry finishes it", async () => {
    // Set after the run is under way, so the failure lands on the second of
    // the two writes rather than on the ordinary saves before it.
    const store = storeFailing(null);
    const source = await open(store);
    source.mark("HeraAttack");
    await source.flush();

    store.failOn = "active";
    await expect(source.finishRun()).rejects.toThrow(/quota/);
    expect(source.getFacts().held.has("HeraAttack")).toBe(true);

    store.failOn = null;
    await source.finishRun();

    expect(source.getFacts().held.size).toBe(0);
    expect((await store.load("hades2", "last"))?.facts.held).toHaveLength(1);
    expect((await store.load("hades2", "active"))?.facts.held).toHaveLength(0);
  });

  it("reports the failure the same way an ordinary write does", async () => {
    const store = storeFailing("last");
    const source = await open(store);

    await expect(source.finishRun()).rejects.toThrow(/quota/);
    expect(source.storageError?.message).toMatch(/quota/);
  });
});

describe("opening a run stored against an older build", () => {
  async function storeOldRun(): Promise<RunStore> {
    const store = createMemoryStore();
    const old = emptyRun("hades2", "build-0");
    old.facts.held.set("HeraAttack", { rarity: "Common", level: 1 });
    old.facts.held.set("RenamedSinceBuild0", { rarity: "Epic", level: 1 });
    await store.save("hades2", "active", toPersisted({ state: old, quarantine: [] }));
    return store;
  }

  it("surfaces a notice naming what could not be matched", async () => {
    const source = await open(await storeOldRun());

    expect(source.migrationNotice).toEqual({
      count: 1,
      entries: [{ path: "held", key: "RenamedSinceBuild0", value: { rarity: "Epic", level: 1 } }],
      playedOn: "build-0",
      now: "build-1",
    });
    expect(source.getFacts().held.has("HeraAttack")).toBe(true);
    expect(source.getFacts().held.has("RenamedSinceBuild0")).toBe(false);
  });

  it("keeps the quarantined entries recoverable across another reload", async () => {
    const store = await storeOldRun();
    const first = await open(store);
    await first.flush();

    const second = await open(store);

    expect(second.quarantine).toEqual(first.quarantine);
    expect(second.quarantine).toHaveLength(1);
  });

  /**
   * The notice is owed until somebody has read it, not until somebody taps
   * something else.
   *
   * This is the failure the stamp-holdback could not prevent: the pass that
   * raises the notice also removes the ids it is about, so the *first* edit
   * persisted a run whose offending ids were already gone, and the next load
   * scanned it clean and re-stamped it with nobody told. Owing it is now its
   * own stored fact, which is the only place it can live — it cannot be
   * re-derived from a run the migration has already cleaned.
   */
  it("still owes the notice after an edit and a reload", async () => {
    const store = await storeOldRun();
    const first = await open(store);
    expect(first.migrationNotice?.count).toBe(1);

    first.mark("HeraSpecial");
    await first.flush();
    const second = await open(store);

    expect(second.migrationNotice?.count).toBe(1);
    expect(second.migrationNotice?.playedOn).toBe("build-0");
    expect(second.migrationNotice?.now).toBe("build-1");
  });

  it("keeps owing it across several reloads with no acceptance", async () => {
    const store = await storeOldRun();
    await (await open(store)).flush();
    const second = await open(store);
    second.mark("HeraSpecial");
    await second.flush();

    const third = await open(store);

    expect(third.migrationNotice?.count).toBe(1);
  });

  it("stops owing it once accepted, permanently", async () => {
    const store = await storeOldRun();
    const first = await open(store);

    first.acceptMigration();
    await first.flush();
    const second = await open(store);
    second.mark("HeraSpecial");
    await second.flush();
    const third = await open(store);

    expect(second.migrationNotice).toBeNull();
    expect(third.migrationNotice).toBeNull();
    // Accepting is not forgetting: the entries stay recoverable.
    expect(third.quarantine).toHaveLength(1);
  });

  /**
   * Two updates before anyone acknowledges either is one notice about both.
   * Reporting only the newer would leave the first update's losses unmentioned
   * for good, since the run no longer contains anything to notice them by.
   */
  it("gathers what a second update sets aside into the same unacknowledged notice", async () => {
    const store = await storeOldRun();
    await (await open(store)).flush();

    // A later catalog that has also forgotten HeraAttack, the one thing the
    // first migration left the run holding.
    const later = testCatalog({
      ...world(),
      dataVersion: "build-2",
      traits: traitTable(testTrait("ZeusAttack", { god: "Zeus", slot: "Melee" })),
    });
    const second = await openManualSource({ game: "hades2", catalog: later, store });

    expect(second.migrationNotice?.count).toBe(2);
    expect(second.migrationNotice?.playedOn).toBe("build-0");
    expect(second.migrationNotice?.now).toBe("build-2");
  });

  it("stops re-checking once the user accepts the migration", async () => {
    const store = await storeOldRun();
    const first = await open(store);

    first.acceptMigration();
    await first.flush();
    const second = await open(store);

    expect(first.migrationNotice).toBeNull();
    expect(second.migrationNotice).toBeNull();
    expect(second.getFacts().dataVersion).toBe("build-1");
    // Accepting is not forgetting: the entries are still there to restore.
    expect(second.quarantine).toHaveLength(1);
  });
});

describe("a stored run this build cannot read", () => {
  /**
   * Refusing to decode is right; refusing to *start* is not. The record is not
   * cleared by anything, so a decoder that throws on the way in throws again on
   * every load after it, for as long as the record exists — the player's way
   * out is clearing site data, which destroys both runs. The store version has
   * no upgrade path yet and the first bump is the obvious way in, but a
   * truncated record gets there today.
   */
  async function storeHolding(record: unknown): Promise<RunStore> {
    const store = createMemoryStore();
    await store.save("hades2", "active", record as Parameters<RunStore["save"]>[2]);
    return store;
  }

  async function unreadableRecord(): Promise<RunStore> {
    const record = toPersisted({ state: emptyRun("hades2", "build-1"), quarantine: [] });
    record.storeVersion = STORE_VERSION + 1;
    return storeHolding(record);
  }

  it("starts a fresh run instead of refusing to open", async () => {
    const source = await open(await unreadableRecord());

    expect(source.getFacts().held.size).toBe(0);
    expect(source.unreadableRun?.message).toMatch(/store version/);
  });

  it("sets the record aside rather than writing over it", async () => {
    const store = await unreadableRecord();

    await open(store);

    // Kept, in full and unread. Whatever a later build can make of it, this one
    // must not be the reason it stopped existing.
    expect(await store.load("hades2", "unreadable")).not.toBeNull();
  });

  it("does the same for a record that fails any other decoder check", async () => {
    const source = await open(await storeHolding({ storeVersion: STORE_VERSION }));

    expect(source.unreadableRun?.message).toMatch(/facts or intent/);
  });

  it("keeps going once the fresh run is under way", async () => {
    const store = await unreadableRecord();
    const source = await open(store);

    source.mark("HeraAttack");
    await source.flush();
    const reopened = await open(store);

    expect(reopened.getFacts().held.has("HeraAttack")).toBe(true);
    expect(reopened.unreadableRun).toBeNull();
  });

  it("refuses to start when the record it cannot read also cannot be preserved", async () => {
    const inner = await unreadableRecord();
    const store: RunStore = {
      load: inner.load.bind(inner),
      clear: inner.clear.bind(inner),
      save: (game, slot, run) =>
        slot === "unreadable"
          ? Promise.reject(new Error("quota exceeded"))
          : inner.save(game, slot, run),
    };

    // Starting fresh over a record that could not be copied is the loss this
    // whole path exists to avoid, so the failure is the honest answer.
    await expect(open(store)).rejects.toThrow(/quota/);
  });

  it("reports nothing on an ordinary load", async () => {
    expect((await open(createMemoryStore())).unreadableRun).toBeNull();
  });
});

describe("the overlay stored beside the run", () => {
  /**
   * Stored and handed back, never interpreted. The overlay belongs to whatever
   * is laying it over this source; what belongs here is the record and its one
   * writer, since two halves of the same run saving themselves separately is
   * how one of them gets lost.
   */
  it("survives closing and reopening, exactly as it went in", async () => {
    const store = createMemoryStore();
    const source = await open(store);
    const overrides = [
      { path: "held", key: "HeraAttack", value: null },
      { path: "godPool", god: "Zeus", present: true },
    ] as const;

    source.putOverrides([...overrides]);
    await source.flush();

    expect((await open(store)).overrides).toEqual(overrides);
  });

  it("stays out of a record that has none", async () => {
    const store = createMemoryStore();
    const source = await open(store);
    source.mark("HeraAttack");
    await source.flush();

    const record = await store.load("hades2", "active");

    expect(record === null ? true : "overrides" in record).toBe(false);
    expect((await open(store)).overrides).toEqual([]);
  });

  /**
   * The load scans the overlay with the run, and it has to: the merge lays the
   * overlay back over the facts after the pass that cleaned them, so a hand-held
   * field naming a renamed trait would put that id straight back into what
   * evaluation reads — past the one pass whose whole job is that no such id
   * ever reaches it.
   */
  it("loses a field naming something the update renamed, and says so", async () => {
    const store = createMemoryStore();
    const old = emptyRun("hades2", "build-0");
    const gone = { path: "held", key: "RenamedSinceBuild0", value: null } as const;
    await store.save(
      "hades2",
      "active",
      toPersisted({
        state: old,
        quarantine: [],
        overrides: [gone, { path: "held", key: "HeraAttack", value: null }],
      }),
    );

    const source = await open(store);

    expect(source.overrides).toEqual([{ path: "held", key: "HeraAttack", value: null }]);
    expect(source.quarantine).toEqual([
      { path: "overrides", key: "held:RenamedSinceBuild0", value: gone },
    ]);
    expect(source.migrationNotice?.count).toBe(1);
  });

  it("is gone when the run it belonged to ends", async () => {
    const store = createMemoryStore();
    const source = await open(store);
    source.putOverrides([{ path: "held", key: "HeraAttack", value: null }]);

    await source.finishRun();

    expect(source.overrides).toEqual([]);
    expect((await open(store)).overrides).toEqual([]);
  });

  /**
   * A write chained while `finishRun`'s two record writes are in flight used to
   * capture the run as it was at the tap — which, since nothing is cleared until
   * both records are written, was the *finished* run. It then landed after both,
   * so the record meaning "the run in progress" came back holding the run that
   * had just ended, and the next load un-ended it. The write is chained after
   * the boundary and now snapshots there too, so it stores the fresh run.
   */
  it("is not put back by a write that lands while the run is ending", async () => {
    const store = createMemoryStore();
    const source = await open(store);
    source.mark("HeraAttack");

    const ending = source.finishRun();
    source.putOverrides([{ path: "godPool", god: "Zeus", present: true }]);
    await ending;
    await source.flush();

    const reopened = await open(store);
    expect([...reopened.getFacts().held.keys()]).toEqual([]);
    expect(reopened.overrides).toEqual([]);
    // The finished run is where it belongs, and it kept what it had.
    const last = fromPersisted(await store.load("hades2", "last"));
    expect([...last.state.facts.held.keys()]).toEqual(["HeraAttack"]);
  });
});

describe("taking back the last edit", () => {
  it("names what it would take back, and stops offering once it has", async () => {
    const source = await open();
    expect(source.lastEdit).toBeNull();

    source.mark("HeraAttack");
    expect(source.lastEdit).toEqual({ action: "mark", subject: "HeraAttack" });

    source.undo();
    expect(source.lastEdit).toBeNull();
    expect(source.getFacts().held.size).toBe(0);
  });

  it("does nothing at all when there is nothing to take back", async () => {
    const source = await open();
    const before = source.getFacts();

    source.undo();
    source.undo();

    expect(source.getFacts()).toBe(before);
  });

  it("keeps only the last one, however many came before it", async () => {
    const source = await open();
    source.mark("HeraAttack");
    source.mark("HeraSpecial");

    source.undo();
    source.undo();

    expect(source.getFacts().held.has("HeraSpecial")).toBe(false);
    expect(source.getFacts().held.has("HeraAttack")).toBe(true);
  });

  /**
   * Marking a boon is four writes, not one — the trait, its slot, its god, and
   * whatever it displaced. An undo built out of the field an override would
   * name puts back the first and loses the fourth, which is the case with no
   * symptom: the run looks right and a requirement that named the displaced
   * boon has quietly stopped being met.
   */
  it("puts back the boon a mark displaced, and the slot it was in", async () => {
    const source = await open();
    source.mark("HeraAttack");

    source.mark("ZeusAttack");
    source.undo();

    expect(source.getFacts().held.has("HeraAttack")).toBe(true);
    expect(source.getFacts().held.has("ZeusAttack")).toBe(false);
    expect(source.getFacts().slots.get("Melee")).toBe("HeraAttack");
    expect([...source.getFacts().godPool]).toEqual(["Hera"]);
  });

  /**
   * The half no fact records. A purge leaves its god in the pool on the
   * strength of a reward that really was taken, and that reason lives outside
   * the run facts. Rewinding the facts alone would leave the god pooled with
   * the rule explaining them switched off — so the next unrelated correction
   * anywhere in the run would delete a god the player really has met.
   */
  it("takes a purged boon's god back out of the standing set", async () => {
    const source = await open();
    source.mark("HeraAttack");
    source.mark("HeraSpecial");

    source.purge("HeraSpecial");
    source.undo();
    // Hera now stands on her held boons alone again, so correcting the last of
    // them is a correction rather than a no-op.
    source.remove("HeraSpecial");
    source.remove("HeraAttack");

    expect(source.getFacts().godPool.size).toBe(0);
  });

  it("does the same for the displacement that leaves a god behind", async () => {
    const source = await open();
    source.mark("HeraAttack");

    source.mark("ZeusAttack");
    source.undo();
    source.remove("HeraAttack");

    expect(source.getFacts().godPool.size).toBe(0);
  });

  /**
   * The other direction, and the one every test above happens to miss: an undo
   * must not *wipe* a god who was already standing before the edit it takes
   * back. Left wrong, taking back an unrelated mark switches off the rule that
   * explains a god purged an hour ago, and the next correction deletes them —
   * which is the composition failure the standing set was introduced to fix,
   * reproduced one layer along.
   */
  it("leaves a god who was already standing where they were", async () => {
    const source = await open();
    source.mark("HeraAttack");
    source.mark("HeraSpecial");
    source.purge("HeraSpecial");

    source.mark("HermesDash");
    source.undo();
    source.remove("HeraAttack");

    expect(source.getFacts().godPool.has("Hera")).toBe(true);
  });

  it("takes back a god recorded directly, standing set and all", async () => {
    const source = await open();
    source.mark("HeraAttack");

    source.addGod("Zeus");
    source.undo();

    expect(source.getFacts().godPool.has("Zeus")).toBe(false);
    source.remove("HeraAttack");
    expect(source.getFacts().godPool.size).toBe(0);
  });

  it("takes back an edit to intent as readily as one to facts", async () => {
    const source = await open();
    source.pin("HeraAttack");
    source.setNote("HeraAttack", "keep at Epic");

    source.undo();

    expect(source.getState().intent.notes.has("HeraAttack")).toBe(false);
    expect(source.getState().intent.pins.has("HeraAttack")).toBe(true);
    expect(source.lastEdit).toBeNull();
  });

  it("takes back the equipped kit and a Mirror answer", async () => {
    const hades1 = await openManualSource({
      game: "hades1",
      catalog: testCatalog({ ...world(), game: "hades1" }),
      store: createMemoryStore(),
    });
    hades1.answerMirrorRow("Cast", "AmmoMetaUpgrade");

    hades1.undo();

    expect(hades1.getFacts().equipped.talents).toBeUndefined();

    const source = await open();
    source.equipKeepsake("ForceHeraBoonKeepsake");
    source.undo();
    expect(source.getFacts().equipped.keepsake).toBeUndefined();
  });

  /**
   * A refused write is not an edit. Left uncaptured this would offer to take
   * back the thing before it, which is a different edit than the one the user
   * just failed to make.
   */
  it("offers nothing after a write the source refused", async () => {
    const source = await open();
    source.mark("HeraAttack");

    expect(() => {
      source.mark("TorchAutofireAspect");
    }).toThrow();
    expect(() => {
      source.addGod("ZeusUpgrade");
    }).toThrow();
    expect(() => {
      source.remove("HeraSpecial");
    }).not.toThrow();

    expect(source.lastEdit).toEqual({ action: "mark", subject: "HeraAttack" });
  });

  it("reaches storage, so what was taken back stays taken back", async () => {
    const store = createMemoryStore();
    const source = await open(store);
    source.mark("HeraAttack");
    source.mark("ZeusAttack");

    source.undo();
    await source.flush();

    expect((await open(store)).getFacts().held.has("HeraAttack")).toBe(true);
    expect((await open(store)).getFacts().held.has("ZeusAttack")).toBe(false);
  });

  /**
   * The offer does not survive the run it belongs to. That edit is in the other
   * record now, and putting it back here would drop a boon somebody earned last
   * night into a run that has not started.
   */
  it("is off the table once the run has ended", async () => {
    const source = await open();
    source.mark("HeraAttack");

    await source.finishRun();

    expect(source.lastEdit).toBeNull();
    source.undo();
    expect(source.getFacts().held.size).toBe(0);
  });

  /**
   * Accepting the migration writes a fact — the build stamp — so it is an edit
   * like any other, and taking it back has to bring the notice with it. The
   * notice is not in the run facts, so an undo that rewound them alone would
   * leave the stamp back where it was and the apology gone.
   */
  it("brings the migration notice back with the stamp it advanced", async () => {
    const store = createMemoryStore();
    const old = emptyRun("hades2", "build-0");
    old.facts.held.set("RenamedSinceBuild0", { rarity: "Epic", level: 1 });
    await store.save("hades2", "active", toPersisted({ state: old, quarantine: [] }));
    const source = await open(store);
    expect(source.migrationNotice).not.toBeNull();

    source.acceptMigration();
    expect(source.migrationNotice).toBeNull();
    source.undo();

    expect(source.migrationNotice).not.toBeNull();
    expect(source.getFacts().dataVersion).toBe("build-0");
  });

  /**
   * The test above asserts in memory, which is the only place the restored
   * notice and the restored *owing* look alike. They are two fields, and an
   * undo that put back the one on screen while leaving the record saying
   * nothing is owed would pass it — the apology given back to the user and
   * forgiven on disk in the same breath, with the next load raising nothing.
   * Reloading is what tells them apart.
   */
  it("leaves the notice owed on disk too, so the next load still raises it", async () => {
    const store = createMemoryStore();
    const old = emptyRun("hades2", "build-0");
    old.facts.held.set("RenamedSinceBuild0", { rarity: "Epic", level: 1 });
    await store.save("hades2", "active", toPersisted({ state: old, quarantine: [] }));

    const source = await open(store);
    source.acceptMigration();
    source.undo();
    await source.flush();

    const reloaded = await open(store);
    expect(reloaded.migrationNotice?.playedOn).toBe("build-0");
    expect(reloaded.migrationNotice?.entries).toEqual([
      { path: "held", key: "RenamedSinceBuild0", value: { rarity: "Epic", level: 1 } },
    ]);
    // The stamp is not the assertion, and deliberately so: with nothing left to
    // quarantine the reload re-stamps, which is the whole reason the owing is
    // stored in a field of its own. One field cannot mean both "the build this
    // run was played on" and "somebody still has to be told".
    expect(reloaded.getFacts().dataVersion).toBe("build-1");
  });

  /**
   * Nothing owed and the stamp already current: no field moves. Left ungated
   * this was the expensive kind of no-op — a fresh facts object saying exactly
   * what the old one said, so every consumer memoizing on that identity
   * re-derived a game's worth of state for nothing — and worse, it spent the
   * one level of undo the user has, replacing the offer to take back their
   * last real edit with an offer to take back a gesture that changed nothing.
   */
  it("does nothing at all when there is no migration to accept", async () => {
    const source = await open();
    source.mark("HeraAttack");
    const before = source.getFacts();
    let heard = 0;
    source.subscribe(() => {
      heard += 1;
    });

    source.acceptMigration();

    expect(source.getFacts()).toBe(before);
    expect(heard).toBe(0);
    expect(source.lastEdit).toEqual({ action: "mark", subject: "HeraAttack" });

    // And the mark is still the thing an undo takes back.
    source.undo();
    expect(source.getFacts().held.has("HeraAttack")).toBe(false);
  });
});

describe("run progress", () => {
  /**
   * The run facts no longer carry region and chamber at all, so the interesting
   * half of the old assertion — that the source declines to collect a field it
   * could have — is now a type error rather than a test. What is left is the
   * surface: nothing here grew a setter for a counter the model dropped.
   */
  it("is never collected by manual entry", async () => {
    const source = await open();
    source.mark("HeraAttack");
    source.equipKeepsake("ForceHeraBoonKeepsake");

    expect(Object.keys(source)).not.toContain("setProgress");
  });
});
