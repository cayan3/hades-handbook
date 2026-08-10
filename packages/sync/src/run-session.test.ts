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

describe("ending a run through the session", () => {
  /**
   * The failure the pairing exists for. `finishRun` empties the source and
   * starts a fresh run, and the overlay is the one piece of state it cannot
   * reach — so a layer left to itself goes on laying the finished run's
   * hand-edits over a run that has not started, with evaluation reading them.
   */
  it("leaves nothing of the finished run's overlay over the fresh one", async () => {
    const session = await open();
    session.source.mark("HeraAttack");
    session.layer.setOverride({ path: "godPool", god: "Zeus", present: true });

    await session.finishRun();

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
    await session.finishRun();

    // Every notification the run boundary produced said the same thing. A clear
    // that came after the source's own would have announced `true` once first.
    expect(seen).not.toContain(true);
  });

  it("stores the finished run without the hypotheticals laid over it", async () => {
    const store = createMemoryStore();
    const session = await open(store);
    session.source.mark("HeraAttack");
    session.layer.setOverride({ path: "godPool", god: "Zeus", present: true });

    await session.finishRun();
    await session.source.flush();

    const last = fromPersisted(await store.load("hades2", "last"));
    expect([...last.state.facts.held.keys()]).toEqual(["HeraAttack"]);
    expect(last.overrides).toEqual([]);
  });

  /**
   * Ending a run is the one edit that discards what it holds, so a failed write
   * has to leave everything where it was and let the caller retry. The run is
   * intact on its own; the overlay is intact only if it is put back.
   */
  it("puts the overlay back when the run could not be stored", async () => {
    const store: RunStore = {
      load: () => Promise.resolve(null),
      save: (_game, slot) =>
        slot === "last" ? Promise.reject(new Error("quota")) : Promise.resolve(),
      clear: () => Promise.resolve(),
    };
    const session = await open(store);
    session.layer.setOverride({ path: "godPool", god: "Zeus", present: true });

    await expect(session.finishRun()).rejects.toThrow(/quota/);

    expect(session.layer.overrides).toEqual([{ path: "godPool", god: "Zeus", present: true }]);
    expect(session.layer.getFacts().godPool.has("Zeus")).toBe(true);
  });
});
