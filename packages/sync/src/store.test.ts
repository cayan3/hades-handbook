import { describe, expect, it } from "vitest";
import { emptyRun, toPersisted } from "./persisted.js";
import { createMemoryStore, recordKey } from "./store.js";

const run = () => toPersisted({ state: emptyRun("hades2", "build-1"), quarantine: [] });

describe("the key a record sits under", () => {
  it("puts the game first, so the two games can never share a slot", () => {
    expect(recordKey("hades1", "active")).toBe("hades1:active");
    expect(recordKey("hades2", "active")).toBe("hades2:active");
    expect(recordKey("hades2", "last")).toBe("hades2:last");
    expect(recordKey("hades2", "unreadable")).toBe("hades2:unreadable");
  });
});

describe("the in-memory store", () => {
  it("hands back what it was given", async () => {
    const store = createMemoryStore();

    await store.save("hades2", "active", run());

    expect(await store.load("hades2", "active")).toEqual(run());
  });

  it("returns null for a slot nothing was written to", async () => {
    expect(await createMemoryStore().load("hades2", "last")).toBeNull();
  });

  it("forgets a slot that was cleared", async () => {
    const store = createMemoryStore();
    await store.save("hades2", "active", run());

    await store.clear("hades2", "active");

    expect(await store.load("hades2", "active")).toBeNull();
  });

  /**
   * The two copies are the point of this store existing rather than a `Map`.
   * IndexedDB copies on the way in and out because it has to, and a fallback
   * that held the caller's object instead would let an edit made after a save
   * reach back and change what a later load returns. That difference does not
   * show up anywhere the tests run — only in a browser, on somebody's run.
   */
  it("does not keep the object it was handed", async () => {
    const store = createMemoryStore();
    const saved = run();
    await store.save("hades2", "active", saved);

    saved.facts.held.push(["HeraAttack", { rarity: "Common", level: 1 }]);

    expect((await store.load("hades2", "active"))?.facts.held).toEqual([]);
  });

  it("does not hand the same object to two loads", async () => {
    const store = createMemoryStore();
    await store.save("hades2", "active", run());

    const first = await store.load("hades2", "active");
    const second = await store.load("hades2", "active");

    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });
});
