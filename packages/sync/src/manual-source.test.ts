import type { GameId } from "@repo/core";
import { describe, expect, it } from "vitest";
import type { SyncCatalog } from "./catalog-view.js";
import { openManualSource } from "./manual-source.js";
import { STORE_VERSION, emptyRun, toPersisted } from "./persisted.js";
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

describe("run progress", () => {
  /**
   * There is deliberately no method that sets it. The counter has one consumer
   * in the whole model, that consumer is reached only through a requirement
   * atom no shipped catalog produces, and its absence is already handled in the
   * safe direction. This test exists so that adding a setter is a decision
   * somebody makes on purpose rather than a helpful-looking patch.
   */
  it("is never collected by manual entry", async () => {
    const source = await open();
    source.mark("HeraAttack");
    source.equipKeepsake("ForceHeraBoonKeepsake");

    expect(source.getFacts().progress).toBeUndefined();
    expect(Object.keys(source)).not.toContain("setProgress");
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
