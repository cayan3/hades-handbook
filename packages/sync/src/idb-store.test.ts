import { describe, expect, it } from "vitest";
import {
  type IdbDatabaseLike,
  type IdbFactoryLike,
  type IdbObjectStoreLike,
  type IdbOpenRequestLike,
  type IdbRequestLike,
  createIdbStore,
} from "./idb-store.js";
import { emptyRun, toPersisted } from "./persisted.js";
import { DB_NAME, DB_VERSION, STORE_NAME } from "./store.js";

/**
 * A stand-in for IndexedDB, satisfying the same narrow interfaces the browser's
 * does.
 *
 * It is a fake and it proves what a fake can: that the right database and store
 * are opened, that the store is created on upgrade and not otherwise, that keys
 * are what they should be, that a record survives the round trip, and that a
 * failed request rejects rather than hanging. It cannot prove anything about
 * real IndexedDB semantics — quotas, versioning conflicts between tabs, or what
 * a browser does to a structured clone.
 *
 * Requests settle asynchronously because the real ones do: code that reads
 * `request.result` before the callback fires works against a synchronous fake
 * and fails in a browser.
 */
class FakeIdb implements IdbFactoryLike {
  readonly records = new Map<string, string>();
  opens = 0;
  upgrades = 0;
  lastMode: string | null = null;
  failNextRequest = false;
  failOpen = false;

  private stores = new Set<string>();

  open(name: string, version?: number): IdbOpenRequestLike {
    this.opens++;
    const request: IdbOpenRequestLike = {
      result: this.database(),
      error: null,
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
    };
    void Promise.resolve().then(() => {
      if (this.failOpen) {
        request.error = new Error(`refused to open ${name} v${String(version)}`);
        request.onerror?.();
        return;
      }
      if (!this.stores.has(STORE_NAME)) {
        this.upgrades++;
        request.onupgradeneeded?.();
      }
      request.onsuccess?.();
    });
    return request;
  }

  private database(): IdbDatabaseLike {
    return {
      objectStoreNames: { contains: (name: string) => this.stores.has(name) },
      createObjectStore: (name: string) => {
        this.stores.add(name);
        return null;
      },
      transaction: (name: string, mode: "readonly" | "readwrite") => {
        this.lastMode = mode;
        if (name !== STORE_NAME) throw new Error(`no object store "${name}"`);
        return { objectStore: () => this.objectStore() };
      },
    };
  }

  private objectStore(): IdbObjectStoreLike {
    const settle = <T>(produce: () => T): IdbRequestLike<T> => {
      const request: IdbRequestLike<T> = {
        result: undefined as T,
        error: null,
        onsuccess: null,
        onerror: null,
      };
      const failing = this.failNextRequest;
      this.failNextRequest = false;
      void Promise.resolve().then(() => {
        if (failing) {
          request.error = new Error("request failed");
          request.onerror?.();
          return;
        }
        request.result = produce();
        request.onsuccess?.();
      });
      return request;
    };

    return {
      get: (key) => settle(() => {
        const stored = this.records.get(key);
        return stored === undefined ? undefined : (JSON.parse(stored) as unknown);
      }),
      put: (value, key) => settle(() => {
        this.records.set(key, JSON.stringify(value));
        return undefined;
      }),
      delete: (key) => settle(() => {
        this.records.delete(key);
        return undefined;
      }),
    };
  }
}

const RUN = toPersisted({ state: emptyRun("hades2", "build-1"), quarantine: [] });

describe("the IndexedDB store", () => {
  it("returns null for a slot that has never been written", async () => {
    const store = createIdbStore(new FakeIdb());

    expect(await store.load("hades2", "active")).toBeNull();
  });

  it("round-trips a run through the record it writes", async () => {
    const idb = new FakeIdb();
    const store = createIdbStore(idb);

    await store.save("hades2", "active", RUN);

    expect([...idb.records.keys()]).toEqual(["hades2:active"]);
    expect(await store.load("hades2", "active")).toEqual(RUN);
  });

  it("keeps the two games and the two slots apart", async () => {
    const idb = new FakeIdb();
    const store = createIdbStore(idb);

    await store.save("hades2", "active", RUN);
    await store.save("hades1", "active", toPersisted({ state: emptyRun("hades1", "b"), quarantine: [] }));
    await store.save("hades2", "last", RUN);

    expect([...idb.records.keys()].sort()).toEqual(["hades1:active", "hades2:active", "hades2:last"]);
    expect((await store.load("hades1", "active"))?.facts.game).toBe("hades1");
  });

  it("clears one slot without touching the other", async () => {
    const idb = new FakeIdb();
    const store = createIdbStore(idb);
    await store.save("hades2", "active", RUN);
    await store.save("hades2", "last", RUN);

    await store.clear("hades2", "active");

    expect(await store.load("hades2", "active")).toBeNull();
    expect(await store.load("hades2", "last")).not.toBeNull();
  });

  it("creates the object store once and opens the database once", async () => {
    const idb = new FakeIdb();
    const store = createIdbStore(idb);

    await store.save("hades2", "active", RUN);
    await store.save("hades2", "last", RUN);
    await store.load("hades2", "active");

    expect(idb.opens).toBe(1);
    expect(idb.upgrades).toBe(1);
  });

  it("opens the database this package owns", () => {
    const idb = new FakeIdb();
    let openedWith: [string, number | undefined] | null = null;
    const spy: IdbFactoryLike = {
      open(name, version) {
        openedWith = [name, version];
        return idb.open(name, version);
      },
    };

    void createIdbStore(spy).load("hades2", "active");

    expect(openedWith).toEqual([DB_NAME, DB_VERSION]);
  });

  it("reads in a read-only transaction and writes in a writable one", async () => {
    const idb = new FakeIdb();
    const store = createIdbStore(idb);

    await store.load("hades2", "active");
    expect(idb.lastMode).toBe("readonly");

    await store.save("hades2", "active", RUN);
    expect(idb.lastMode).toBe("readwrite");
  });

  it("rejects rather than hanging when a request fails", async () => {
    const idb = new FakeIdb();
    const store = createIdbStore(idb);
    await store.save("hades2", "active", RUN);
    idb.failNextRequest = true;

    await expect(store.load("hades2", "active")).rejects.toThrow(/request failed/);
  });

  /**
   * Storage can be denied for reasons that go away — a private window, a quota
   * prompt. Remembering the rejection would make the first failure permanent
   * for the life of the page, so the failed open is dropped and the next call
   * tries again.
   */
  it("retries the open after a failure instead of caching it", async () => {
    const idb = new FakeIdb();
    idb.failOpen = true;
    const store = createIdbStore(idb);

    await expect(store.load("hades2", "active")).rejects.toThrow(/refused to open/);
    idb.failOpen = false;

    expect(await store.load("hades2", "active")).toBeNull();
    expect(idb.opens).toBe(2);
  });
});
