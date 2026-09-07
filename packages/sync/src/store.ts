import type { GameId } from "@repo/core";
import { type PersistedRun, STORE_VERSION } from "./persisted.js";

/**
 * A numbered save slot. Three of them: two saved runs and the one being played,
 * which is four rows on a phone once the row that starts a run is counted. The
 * games themselves offer a handful rather than a list.
 */
export type SaveSlot = 1 | 2 | 3;

export const SAVE_SLOTS: readonly SaveSlot[] = [1, 2, 3];

/**
 * The keys the two-record build wrote. Read once by the pass that moves them
 * into slots and never written again — they stay in the type because they are
 * still in somebody's browser.
 */
export type LegacySlot = "active" | "last";

/**
 * Which record this is: one of the numbered slots, or one of the two keys the
 * earlier build wrote.
 *
 * There was a third kind, `unreadable`, holding a record this build could not
 * decode so that a later one might make something of it. Nothing ever read it,
 * and the case it was written for — a store version bump this build got wrong —
 * has not come up, so a load now starts fresh in the slot and says why.
 */
export type RunSlot = SaveSlot | LegacySlot;

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
  /**
   * Which slot this game's run is open in — the only run state there is, now
   * that nothing is filed over anything. Null before a game has been entered.
   */
  openSlot(game: GameId): Promise<SaveSlot | null>;
  setOpenSlot(game: GameId, slot: SaveSlot | null): Promise<void>;
}

/**
 * The key one record sits under. Game first so the two games never share a
 * slot: loading a Hades I run against the Hades II catalog is refused further
 * up, and this is what makes it impossible rather than merely refused.
 */
export function recordKey(game: GameId, slot: RunSlot): string {
  return `${game}:${typeof slot === "number" ? `slot${slot}` : slot}`;
}

/** Where the pointer sits. Not a record, so it cannot collide with one. */
export function openKey(game: GameId): string {
  return `${game}:open`;
}

/** Whether a stored number still names a slot, asked of anything read back. */
export function isSaveSlot(value: unknown): value is SaveSlot {
  return SAVE_SLOTS.some((slot) => slot === value);
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
  const open = new Map<string, SaveSlot>();

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
    openSlot(game) {
      return Promise.resolve(open.get(openKey(game)) ?? null);
    },
    setOpenSlot(game, slot) {
      if (slot === null) open.delete(openKey(game));
      else open.set(openKey(game), slot);
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
