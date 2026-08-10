import type {
  CatalogLookups,
  GameRules,
  Requirement,
  RunFacts,
  TraitId,
} from "@repo/core";
import { evaluate } from "@repo/core";
import { describe, expect, it } from "vitest";
import type { SyncCatalog } from "./catalog-view.js";
import { openManualSource } from "./manual-source.js";
import { createOverrideLayer } from "./override-layer.js";
import type { FactOverride } from "./overrides.js";
import type { RunStateSource, Unsub } from "./port.js";
import { createMemoryStore } from "./store.js";
import { testCatalog, testFacts, testTrait, traitTable } from "./test-support.js";

function world(): SyncCatalog {
  return testCatalog({
    traits: traitTable(
      testTrait("HeraAttack", { god: "Hera", slot: "Melee" }),
      testTrait("ZeusAttack", { god: "Zeus", slot: "Melee" }),
      testTrait("TorchAutofireAspect", { slot: "Aspect" }),
    ),
    gods: new Set(["Hera", "Zeus"]),
    keepsakes: new Set(["ForceHeraBoonKeepsake"]),
    slots: new Set(["Melee", "Aspect"]),
    talents: new Set(["AmmoMetaUpgrade"]),
  });
}

/**
 * A source that reports whatever the test tells it to.
 *
 * The layer wraps the port rather than the manual source, so the thing to test
 * it against is a port — and one that can push an update nobody asked for,
 * which is the case manual entry cannot produce and the case the layer exists
 * for.
 */
function fakeSource(initial: RunFacts) {
  let facts = initial;
  const listeners = new Set<(f: RunFacts) => void>();
  let status: RunStateSource["status"] = "connected";

  return {
    source: {
      getFacts: () => facts,
      subscribe(cb: (f: RunFacts) => void): Unsub {
        listeners.add(cb);
        return () => {
          listeners.delete(cb);
        };
      },
      get status() {
        return status;
      },
      get capabilities() {
        return { canWrite: false };
      },
    } satisfies RunStateSource,

    /** What a connected bridge does: hand over a whole new facts object. */
    report(next: RunFacts) {
      facts = next;
      for (const listener of listeners) listener(next);
    },

    /** What a source does when it changes something the port does not carry. */
    renotify() {
      for (const listener of listeners) listener(facts);
    },

    disconnect() {
      status = "disconnected";
    },

    get listenerCount() {
      return listeners.size;
    },
  };
}

function layerOver(facts: RunFacts, options: { restored?: FactOverride[] } = {}) {
  const fake = fakeSource(facts);
  const stored: FactOverride[][] = [];
  const layer = createOverrideLayer({
    source: fake.source,
    catalog: world(),
    restored: options.restored ?? [],
    persist: (overrides) => {
      stored.push([...overrides]);
    },
  });
  return { fake, layer, stored };
}

const heldFacts = () =>
  testFacts({
    held: new Map([["HeraAttack", { rarity: "Common" as const, level: 1 }]]),
    godPool: new Set(["Hera"]),
    slots: new Map([["Melee", "HeraAttack" as string | null]]),
  });

describe("reading a source through the layer", () => {
  it("reports the source's facts when nothing is held by hand", async () => {
    const facts = heldFacts();
    const { layer } = layerOver(facts);

    expect(layer.getFacts()).toBe(facts);
    expect(layer.overrides).toEqual([]);
  });

  it("lays a hand-edit over the field it names", () => {
    const { layer } = layerOver(heldFacts());

    layer.setOverride({ path: "held", key: "HeraAttack", value: null });

    expect(layer.getFacts().held.has("HeraAttack")).toBe(false);
    expect(layer.sourceFacts().held.has("HeraAttack")).toBe(true);
    expect(layer.isOverridden("held", "HeraAttack")).toBe(true);
    expect(layer.isOverridden("held", "ZeusAttack")).toBe(false);
  });

  /**
   * The merge is cached and recomputed only when the source moves or the
   * overlay changes, so an override the caller can still reach is one it can
   * change with nothing invalidating that cache. The stale answer that comes
   * back is the hard kind to notice: the facts object's identity has not moved
   * either, so a consumer memoizing on it is not merely holding an old answer,
   * it is being told the answer is current.
   */
  it("keeps hold of its own overrides rather than the caller's objects", () => {
    const { fake, layer } = layerOver(heldFacts());
    const mine = { path: "godPool", god: "Zeus", present: true } as FactOverride;

    layer.setOverride(mine);
    (mine as { present: boolean }).present = false;
    // The read has to come after something invalidates the cached merge, or the
    // stale answer and the right one are the same answer and the assertion
    // holds either way.
    fake.report(heldFacts());
    expect(layer.getFacts().godPool.has("Zeus")).toBe(true);

    const handedBack = layer.overrides[0] as { present: boolean };
    handedBack.present = false;
    fake.report(heldFacts());
    expect(layer.getFacts().godPool.has("Zeus")).toBe(true);
  });

  it("keeps hold of what a restore handed it, too", () => {
    const restored = [{ path: "godPool", god: "Zeus", present: true } as FactOverride];
    const { layer } = layerOver(heldFacts(), { restored });

    (restored[0] as { present: boolean }).present = false;

    expect(layer.getFacts().godPool.has("Zeus")).toBe(true);
  });

  it("passes the source's own status and capabilities through", () => {
    const { fake, layer } = layerOver(heldFacts());

    expect(layer.status).toBe("connected");
    expect(layer.capabilities).toEqual({ canWrite: false });
    fake.disconnect();
    expect(layer.status).toBe("disconnected");
  });
});

describe("a source that keeps reporting while a field is held by hand", () => {
  /**
   * The behaviour the whole layer exists for: planning against a run that is
   * still being reported. Every field nobody took in hand goes on updating,
   * which is what makes this an overlay rather than a pause.
   */
  it("updates every field nobody took in hand", () => {
    const { fake, layer } = layerOver(heldFacts());
    layer.setOverride({ path: "held", key: "HeraAttack", value: null });

    fake.report(
      testFacts({
        held: new Map([["HeraAttack", { rarity: "Epic", level: 3 }]]),
        godPool: new Set(["Hera", "Zeus"]),
      }),
    );

    expect(layer.getFacts().held.has("HeraAttack")).toBe(false);
    expect([...layer.getFacts().godPool].sort()).toEqual(["Hera", "Zeus"]);
  });

  it("hands the field back to the source the moment it is cleared", () => {
    const { fake, layer } = layerOver(heldFacts());
    layer.setOverride({ path: "held", key: "HeraAttack", value: null });
    fake.report(testFacts({ held: new Map([["HeraAttack", { rarity: "Epic", level: 3 }]]) }));

    layer.clearOverride("held", "HeraAttack");

    expect(layer.getFacts().held.get("HeraAttack")).toEqual({ rarity: "Epic", level: 3 });
    expect(layer.isOverridden("held", "HeraAttack")).toBe(false);
  });

  it("hands every field back at once", () => {
    const facts = heldFacts();
    const { layer } = layerOver(facts);
    layer.setOverride({ path: "held", key: "HeraAttack", value: null });
    layer.setOverride({ path: "godPool", god: "Zeus", present: true });

    layer.clearOverrides();

    expect(layer.overrides).toEqual([]);
    expect(layer.getFacts()).toBe(facts);
  });

  it("tells subscribers about a hand-edit as well as about an incoming fact", () => {
    const { fake, layer } = layerOver(heldFacts());
    const seen: RunFacts[] = [];
    const unsub = layer.subscribe((f) => seen.push(f));

    layer.setOverride({ path: "held", key: "HeraAttack", value: null });
    fake.report(testFacts({ godPool: new Set(["Zeus"]) }));
    layer.clearOverride("held", "HeraAttack");
    unsub();
    layer.setOverride({ path: "godPool", god: "Hera", present: true });

    expect(seen).toHaveLength(3);
    expect(seen[0]?.held.has("HeraAttack")).toBe(false);
  });

  it("says nothing when a clear names a field nobody was holding", () => {
    const { layer } = layerOver(heldFacts());
    const seen: RunFacts[] = [];
    layer.subscribe((f) => seen.push(f));

    layer.clearOverride("held", "HeraAttack");
    layer.clearOverrides();

    expect(seen).toEqual([]);
  });

  it("stops listening to the source when closed", () => {
    const { fake, layer } = layerOver(heldFacts());
    expect(fake.listenerCount).toBe(1);

    layer.close();

    expect(fake.listenerCount).toBe(0);
  });
});

describe("the identity a memoized consumer reads", () => {
  it("hands back the same merged object until something changes", () => {
    const { layer } = layerOver(heldFacts());
    layer.setOverride({ path: "held", key: "HeraAttack", value: null });

    const first = layer.getFacts();

    expect(layer.getFacts()).toBe(first);
  });

  /**
   * A source writing something the port does not carry — intent, say — hands
   * back the facts object it already had. Rebuilding the merge for that would
   * hand every consumer a new object saying exactly what the old one said, and
   * every memo keyed on it would miss for nothing.
   */
  it("keeps that object when the source renotifies without changing a fact", () => {
    const { fake, layer } = layerOver(heldFacts());
    layer.setOverride({ path: "held", key: "HeraAttack", value: null });
    const before = layer.getFacts();

    fake.renotify();

    expect(layer.getFacts()).toBe(before);
  });

  it("hands back a new object once a fact really moves", () => {
    const { fake, layer } = layerOver(heldFacts());
    layer.setOverride({ path: "held", key: "HeraAttack", value: null });
    const before = layer.getFacts();

    fake.report(testFacts({ godPool: new Set(["Zeus"]) }));

    expect(layer.getFacts()).not.toBe(before);
  });
});

describe("an override that names something the catalog does not have", () => {
  /**
   * Every id one of these can name comes off a catalog-driven list, so one the
   * catalog does not have is a programming error rather than user input — and
   * left to reach the facts it would be a dangling id in the one place the
   * migration pass is not looking, since the overlay is laid back on after it.
   */
  it("is refused at the write", () => {
    const { layer } = layerOver(heldFacts());
    const refuse = (o: FactOverride) => () => {
      layer.setOverride(o);
    };

    expect(refuse({ path: "held", key: "NotATrait", value: null })).toThrow(/no trait/);
    expect(refuse({ path: "godPool", god: "Poseidon", present: true })).toThrow(/no god/);
    expect(refuse({ path: "slots", slot: "Nowhere", value: null })).toThrow(/no slot/);
    expect(refuse({ path: "slots", slot: "Melee", value: "NotATrait" })).toThrow(/no trait/);
    expect(refuse({ path: "bans", trait: "NotATrait", present: true })).toThrow(/no trait/);
    expect(refuse({ path: "talents", talent: "NotATalent", selection: null })).toThrow(/no talent/);
    expect(refuse({ path: "equipped", field: "keepsake", value: "NotAKeepsake" })).toThrow(
      /no keepsake/,
    );
    expect(refuse({ path: "equipped", field: "aspect", value: "NotATrait" })).toThrow(/no trait/);
    expect(layer.overrides).toEqual([]);
  });

  /**
   * The unchecked fields are the ones the migration leaves unchecked too, and
   * for its reasons: there is no resource table and no weapon table to check
   * against, and an element is a closed set the type already fixes.
   */
  it("says nothing about the fields no table can answer for", () => {
    const { layer } = layerOver(heldFacts());

    layer.setOverride({ path: "resources", resource: "Whatever", value: 3 });
    layer.setOverride({ path: "equipped", field: "weapon", value: "WeaponUnknown" });

    expect(layer.getFacts().resources.get("Whatever")).toBe(3);
    expect(layer.getFacts().equipped.weapon).toBe("WeaponUnknown");
  });
});

describe("keeping the overlay", () => {
  it("hands every override in force to whoever stores them", () => {
    const { layer, stored } = layerOver(heldFacts());

    layer.setOverride({ path: "held", key: "HeraAttack", value: null });
    layer.setOverride({ path: "godPool", god: "Zeus", present: true });
    layer.clearOverride("held", "HeraAttack");

    expect(stored).toHaveLength(3);
    expect(stored[2]).toEqual([{ path: "godPool", god: "Zeus", present: true }]);
  });

  it("starts from the overrides a load brought back", () => {
    const { layer } = layerOver(heldFacts(), {
      restored: [{ path: "held", key: "HeraAttack", value: null }],
    });

    expect(layer.isOverridden("held", "HeraAttack")).toBe(true);
    expect(layer.getFacts().held.has("HeraAttack")).toBe(false);
  });

  it("runs without anywhere to keep them, for a source that has nowhere", () => {
    const fake = fakeSource(heldFacts());
    const layer = createOverrideLayer({ source: fake.source, catalog: world() });

    layer.setOverride({ path: "held", key: "HeraAttack", value: null });

    expect(layer.getFacts().held.has("HeraAttack")).toBe(false);
  });
});

/**
 * The invariant the layer is worth having for. A hypothetical that does not
 * reach the answers is the feature failing silently: the screen would show the
 * hand-edit while every verdict on it went on describing the run as reported.
 */
describe("what evaluation reads", () => {
  const rules: GameRules = {
    poolCapacity: () => 4,
    isGodPoolFull: (f) => f.godPool.size >= 4,
    isBlocked: (t: TraitId, f) => (f.bans.has(t) ? { kind: "banned", trait: t } : null),
  };
  const lookups: CatalogLookups = { boonsOfGod: () => [] };
  const wantHera: Requirement = { kind: "hasTrait", trait: "HeraAttack" };
  const verdict = (facts: RunFacts) => evaluate(wantHera, facts, rules, lookups).kind;

  it("answers off the merged facts, and moves the moment an override does", () => {
    const { layer } = layerOver(heldFacts());
    expect(verdict(layer.getFacts())).toBe("satisfied");

    layer.setOverride({ path: "held", key: "HeraAttack", value: null });
    expect(verdict(layer.getFacts())).toBe("pending");

    layer.setOverride({ path: "bans", trait: "HeraAttack", present: true });
    expect(verdict(layer.getFacts())).toBe("unsatisfiable");

    layer.clearOverrides();
    expect(verdict(layer.getFacts())).toBe("satisfied");
  });

  /**
   * Undo is on the source and the merge is on the layer, and the contract asks
   * for the composition: taking back an edit recomputes the effective facts.
   * Each half is tested on its own above, which is exactly the arrangement in
   * which a composition can be broken with every test still green.
   */
  it("moves when an undo on the source takes an edit back", async () => {
    const source = await openManualSource({
      game: "hades2",
      catalog: world(),
      store: createMemoryStore(),
    });
    const layer = createOverrideLayer({ source, catalog: world() });
    layer.setOverride({ path: "godPool", god: "Zeus", present: true });

    source.mark("HeraAttack");
    expect(verdict(layer.getFacts())).toBe("satisfied");
    source.undo();

    expect(verdict(layer.getFacts())).toBe("pending");
    // The hand-edit is untouched by the undo: it was never that edit.
    expect(layer.getFacts().godPool.has("Zeus")).toBe(true);
  });

  /**
   * The round trip the contract states: set an override, read back through the
   * port, clear it, read back again. The second read is the source's own object
   * rather than a copy of it, which is the stronger claim.
   */
  it("comes back to exactly what the source reports once the field is handed back", () => {
    const facts = heldFacts();
    const { layer } = layerOver(facts);

    layer.setOverride({ path: "held", key: "HeraAttack", value: null });
    const during = layer.getFacts();
    layer.clearOverride("held", "HeraAttack");

    expect(during).not.toBe(facts);
    expect(layer.getFacts()).toBe(facts);
    expect(verdict(layer.getFacts())).toBe("satisfied");
  });
});
