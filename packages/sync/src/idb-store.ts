import type { GameId } from "@repo/core";
import type { PersistedRun } from "./persisted.js";
import { DB_NAME, DB_VERSION, STORE_NAME, type RunSlot, type RunStore, recordKey } from "./store.js";

/**
 * IndexedDB, described structurally rather than imported.
 *
 * The workspace compiles against the language library alone — no browser types
 * anywhere, which is what stops the pure domain package from reaching for a
 * document or a clock without anyone noticing. So the handful of IndexedDB
 * members this file touches are written out here instead. The interfaces are
 * narrower than the real ones on purpose: the browser's objects satisfy them,
 * and a test can supply something that satisfies them too without implementing
 * a database.
 *
 * The factory is a parameter rather than something read off the global object.
 * Reaching for a global would be the first place in the repo to assert a
 * platform exists, the typechecker could not check the assertion, and it would
 * fail at runtime under the test runner, which has no IndexedDB at all.
 */
export interface IdbFactoryLike {
  open(name: string, version?: number): IdbOpenRequestLike;
}

export interface IdbRequestLike<T> {
  result: T;
  error: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
}

export interface IdbOpenRequestLike extends IdbRequestLike<IdbDatabaseLike> {
  onupgradeneeded: (() => void) | null;
}

export interface IdbDatabaseLike {
  objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string): unknown;
  transaction(name: string, mode: "readonly" | "readwrite"): IdbTransactionLike;
}

export interface IdbTransactionLike {
  objectStore(name: string): IdbObjectStoreLike;
}

export interface IdbObjectStoreLike {
  get(key: string): IdbRequestLike<unknown>;
  put(value: unknown, key: string): IdbRequestLike<unknown>;
  delete(key: string): IdbRequestLike<unknown>;
}

/** Turns one IndexedDB request into a promise. */
function settle<T>(request: IdbRequestLike<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(asError(request.error));
    };
  });
}

/**
 * IndexedDB reports failures as an event carrying a `DOMException`, which is
 * not typed here and is not guaranteed to be an `Error` at all. Wrapping keeps
 * every rejection from this file something a caller can print.
 */
function asError(cause: unknown): Error {
  if (cause instanceof Error) return cause;
  return new Error(`IndexedDB request failed: ${String(cause)}`);
}

/**
 * A store backed by IndexedDB.
 *
 * The database is opened once and the promise is kept, so concurrent saves
 * share one connection rather than racing to create it. The connection is never
 * closed: this store lives as long as the page does, and closing it between
 * writes would trade a real cost for nothing.
 *
 * Origin-shared, which is what makes the multi-tab warning necessary — two tabs
 * writing here is last-write-wins and neither of them is told.
 */
export function createIdbStore(factory: IdbFactoryLike): RunStore {
  let opened: Promise<IdbDatabaseLike> | null = null;

  function open(): Promise<IdbDatabaseLike> {
    if (opened !== null) return opened;
    opened = new Promise<IdbDatabaseLike>((resolve, reject) => {
      const request = factory.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(asError(request.error));
      };
    });
    /**
     * A failed open is not remembered. Storage can be denied for reasons that
     * go away — a private window the user leaves, a quota prompt they answer —
     * and caching the rejection would make the first failure permanent for the
     * life of the page.
     */
    return opened.catch((cause: unknown) => {
      opened = null;
      throw asError(cause);
    });
  }

  async function withStore<T>(
    mode: "readonly" | "readwrite",
    body: (store: IdbObjectStoreLike) => IdbRequestLike<T>,
  ): Promise<T> {
    const db = await open();
    return settle(body(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)));
  }

  return {
    async load(game: GameId, slot: RunSlot): Promise<PersistedRun | null> {
      const stored = await withStore("readonly", (store) => store.get(recordKey(game, slot)));
      return stored === undefined || stored === null ? null : (stored as PersistedRun);
    },

    async save(game: GameId, slot: RunSlot, run: PersistedRun): Promise<void> {
      await withStore("readwrite", (store) => store.put(run, recordKey(game, slot)));
    },

    async clear(game: GameId, slot: RunSlot): Promise<void> {
      await withStore("readwrite", (store) => store.delete(recordKey(game, slot)));
    },
  };
}
