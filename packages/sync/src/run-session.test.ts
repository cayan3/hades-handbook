import { describe, expect, it } from "vitest";
import type { SyncCatalog } from "./catalog-view.js";
import { fromPersisted } from "./persisted.js";
import { openRunSession } from "./run-session.js";
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
    keepsakes: new Set(["ForceHeraBoonKeepsake"]),
    slots: new Set(["Melee"]),
    talents: new Set(["AmmoMetaUpgrade"]),
  });
}

function open(store: RunStore = createMemoryStore()) {
  return openRunSession({ game: "hades2", catalog: world(), store });
}

describe("a source and its overlay, wired", () => {
  it("reads the source's facts with the hand-edits over them", async () => {
    const session = await open();

    session.source.mark("HeraAttack");
    session.layer.setOverride({ path: "godPool", god: "Zeus", present: true });

    expect(session.layer.getFacts().held.has("HeraAttack")).toBe(true);
    expect(session.layer.getFacts().godPool.has("Zeus")).toBe(true);
    expect(session.layer.sourceFacts().godPool.has("Zeus")).toBe(false);
  });

  /**
   * The round trip the whole design rests on, which until now was tested in
   * halves against two different partners and never once end to end: a
   * hand-edit reaches the record through the source's one writer, and comes
   * back through the load that scans it.
   */
  it("carries an overlay through a reload", async () => {
    const store = createMemoryStore();
    const first = await open(store);
    first.layer.setOverride({ path: "godPool", god: "Zeus", present: true });
    await first.source.flush();

    const second = await open(store);

    expect(second.layer.overrides).toEqual([{ path: "godPool", god: "Zeus", present: true }]);
    expect(second.layer.getFacts().godPool.has("Zeus")).toBe(true);
  });

  it("drops a restored hand-edit the catalog no longer names, and says so", async () => {
    const store = createMemoryStore();
    const first = await open(store);
    first.source.putOverrides([{ path: "held", key: "RenamedSince", value: null }]);
    await first.source.flush();

    const second = await open(store);

    expect(second.layer.overrides).toEqual([]);
    expect(second.source.migrationNotice?.count).toBe(1);
  });
});

describe("crossing a slot boundary through the session", () => {
  /**
   * The failure the pairing exists for. A slot verb replaces the run the source
   * holds, and the overlay is the one piece of state it cannot reach — so a
   * layer left to itself goes on laying the old run's hand-edits over the new
   * one, with evaluation reading them.
   */
  it("leaves nothing of the old run's overlay over the fresh one", async () => {
    const session = await open();
    session.source.mark("HeraAttack");
    session.layer.setOverride({ path: "godPool", god: "Zeus", present: true });

    await session.startRun(2);

    expect(session.layer.overrides).toEqual([]);
    expect(session.layer.getFacts().godPool.has("Zeus")).toBe(false);
    expect(session.layer.getFacts().held.size).toBe(0);
  });

  it("never hands a listener the fresh run under the old overlay", async () => {
    const session = await open();
    session.layer.setOverride({ path: "godPool", god: "Zeus", present: true });

    const seen: boolean[] = [];
    session.layer.subscribe((facts) => {
      seen.push(facts.godPool.has("Zeus"));
    });
    await session.startRun(2);

    // Every notification the boundary produced said the same thing. A clear
    // that came after the source's own would have announced `true` once first.
    expect(seen).not.toContain(true);
  });

  it("stores the run it left without the hypotheticals laid over it", async () => {
    const store = createMemoryStore();
    const session = await open(store);
    session.source.mark("HeraAttack");
    session.layer.setOverride({ path: "godPool", god: "Zeus", present: true });

    await session.startRun(2);
    await session.source.flush();

    const before = fromPersisted(await store.load("hades2", 1));
    expect([...before.state.facts.held.keys()]).toEqual(["HeraAttack"]);
    expect(before.overrides).toEqual([]);
  });

  /**
   * A failed write has to leave everything where it was and let the caller
   * retry. The run is intact on its own; the overlay is intact only if it is
   * put back.
   */
  it("puts the overlay back when the run could not be stored", async () => {
    const memory = createMemoryStore();
    const store: RunStore = {
      ...memory,
      save: (game, slot, run) =>
        slot === 2 ? Promise.reject(new Error("quota")) : memory.save(game, slot, run),
    };
    const session = await open(store);
    session.source.mark("HeraAttack");
    session.layer.setOverride({ path: "godPool", god: "Zeus", present: true });

    await expect(session.startRun(2)).rejects.toThrow(/quota/);

    expect(session.layer.overrides).toEqual([{ path: "godPool", god: "Zeus", present: true }]);
    expect(session.layer.getFacts().godPool.has("Zeus")).toBe(true);
  });

  /** Opening a saved slot crosses the same boundary and owes the same clear. */
  it("clears the overlay when another slot is opened", async () => {
    const session = await open();
    session.source.mark("HeraAttack");
    await session.startRun(2);
    session.layer.setOverride({ path: "godPool", god: "Zeus", present: true });

    await session.openRun(1);

    expect(session.layer.overrides).toEqual([]);
    expect([...session.layer.getFacts().held.keys()]).toEqual(["HeraAttack"]);
  });
});

describe("deleting a slot through the session", () => {
  it("clears the overlay where the slot is the one in play", async () => {
    const session = await open();
    session.source.mark("HeraAttack");
    session.layer.setOverride({ path: "godPool", god: "Zeus", present: true });

    await session.deleteRun(session.source.slot);

    expect(session.layer.overrides).toEqual([]);
    expect(session.layer.getFacts().held.size).toBe(0);
  });

  /**
   * And leaves it alone otherwise: deleting a run nobody is in changes nothing
   * the layer is laid over, so throwing the hand-edits away would be a loss
   * with no boundary behind it.
   */
  it("keeps the overlay where the slot is one nobody is in", async () => {
    const session = await open();
    session.source.mark("HeraAttack");
    await session.startRun(2);
    session.layer.setOverride({ path: "godPool", god: "Zeus", present: true });

    await session.deleteRun(1);

    expect(session.layer.overrides).toEqual([{ path: "godPool", god: "Zeus", present: true }]);
    expect(session.layer.getFacts().godPool.has("Zeus")).toBe(true);
  });

  it("puts the overlay back when the record could not be removed", async () => {
    const memory = createMemoryStore();
    const store: RunStore = { ...memory, clear: () => Promise.reject(new Error("quota")) };
    const session = await open(store);
    session.source.mark("HeraAttack");
    session.layer.setOverride({ path: "godPool", god: "Zeus", present: true });

    await expect(session.deleteRun(session.source.slot)).rejects.toThrow(/quota/);

    // The run survived the failed write, so what the user was holding by hand
    // over it has to survive too, or the retry is about something else.
    expect(session.layer.overrides).toEqual([{ path: "godPool", god: "Zeus", present: true }]);
    expect(session.layer.getFacts().held.has("HeraAttack")).toBe(true);
  });
});
