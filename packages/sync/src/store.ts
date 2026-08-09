import type { GameId } from "@repo/core";
import { type PersistedRun, STORE_VERSION } from "./persisted.js";

/**
 * Which record this is.
 *
 * Two runs, not a list: the one being played and the one before it. A saved-run
 * library is a different product and a different set of questions, and every
 * view that reads a run reads one of those two.
 *
 * The third is not a run. It holds a record that could not be decoded, kept
 * because the alternative is deleting the only copy of somebody's run on the
 * word of the build that could not read it. Nothing loads it and no view shows
 * it; it exists so that a later build has something to try.
 */
export type RunSlot = "active" | "last" | "unreadable";

/**
 * Where persisted runs live, as an interface so that the browser is not the
 * only place this package can run.
 *
 * Async throughout because the real implementation is IndexedDB and there is no
 * synchronous way to read it. Everything above this returns promises for that
 * reason alone.
 */
export interface RunStore {
  load(game: GameId, slot: RunSlot): Promise<PersistedRun | null>;
  save(game: GameId, slot: RunSlot, run: PersistedRun): Promise<void>;
  clear(game: GameId, slot: RunSlot): Promise<void>;
}

/**
 * The key one record sits under. Game first so the two games never share a
 * slot: loading a Hades I run against the Hades II catalog is refused further
 * up, and this is what makes it impossible rather than merely refused.
 */
export function recordKey(game: GameId, slot: RunSlot): string {
  return `${game}:${slot}`;
}

/**
 * A store that forgets everything when the process does.
 *
 * Written for tests, and honest as a fallback: a browser with storage denied
 * gets a working session that does not survive a reload, which is better than a
 * page that refuses to start. Records are cloned on the way in and out, so a
 * caller holding the object it saved cannot reach back into the store and
 * change what a later load returns — the IndexedDB implementation copies by
 * necessity and this one has to match, or a bug would only show up in the
 * browser.
 */
export function createMemoryStore(): RunStore {
  const records = new Map<string, string>();

  return {
    load(game, slot) {
      const stored = records.get(recordKey(game, slot));
      return Promise.resolve(stored === undefined ? null : (JSON.parse(stored) as PersistedRun));
    },
    save(game, slot, run) {
      records.set(recordKey(game, slot), JSON.stringify(run));
      return Promise.resolve();
    },
    clear(game, slot) {
      records.delete(recordKey(game, slot));
      return Promise.resolve();
    },
  };
}

/** The IndexedDB database and object store this package owns. */
export const DB_NAME = "hades-handbook";
export const STORE_NAME = "runs";

/**
 * The database version, which tracks the persisted shape rather than counting
 * its own upgrades. Storage layout and record layout change together here —
 * there is one store holding one kind of record — so keeping two numbers would
 * mean keeping them in step by hand for no benefit.
 */
export const DB_VERSION = STORE_VERSION;
