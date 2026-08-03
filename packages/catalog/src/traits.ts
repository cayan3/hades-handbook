import { type GameKey, dataFor } from "./data.js";
import { overlayFor } from "./overlay.js";
import type { TraitRecord } from "./schema.js";

/**
 * The trait records with the overlay folded in — what everything should read.
 *
 * `dataFor` hands back the extraction verbatim, which is deliberate: where the
 * game's own files are wrong the extractor keeps reporting what they say, so
 * that re-running it never reports a difference it was told to invent. That
 * leaves exactly one place for the correction to happen, and it's here.
 *
 * Built once per game & frozen, same as the lookups beside it: the merge is a
 * fixed property of a data snapshot, so redoing it per call would allocate a
 * fresh copy of the whole catalog on every read (:sobbing: :sobbing:).
 *
 * Only the fields the overlay actually overrides get replaced. `aspectConflicts`
 * and `notes` aren't merged here bc they aren't `TraitRecord` fields at all —
 * they're additions the game has no equivalent for, and whoever renders them
 * should be reading the overlay directly instead of finding them smuggled into
 * a record shaped like the extractor's output.
 */
function merge(game: GameKey): Readonly<Record<string, TraitRecord>> {
  const raw = dataFor(game).boons as Record<string, TraitRecord>;
  const overlay = overlayFor(game);
  const merged: Record<string, TraitRecord> = {};
  for (const [id, record] of Object.entries(raw)) {
    const entry = overlay[id];
    merged[id] =
      entry?.god === undefined
        ? record
        : Object.freeze({ ...record, god: entry.god });
  }
  return Object.freeze(merged);
}

const MERGED: Readonly<Record<GameKey, Readonly<Record<string, TraitRecord>>>> =
  Object.freeze({
    hades1: merge("hades1"),
    hades2: merge("hades2"),
  });

export function traitsFor(game: GameKey): Readonly<Record<string, TraitRecord>> {
  return MERGED[game];
}
