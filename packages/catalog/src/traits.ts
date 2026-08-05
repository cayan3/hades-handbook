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
 * Only the fields the overlay actually overrides get replaced. `notes` isn't
 * merged here bc it isn't a `TraitRecord` field at all — it's an addition the
 * game has no equivalent for, and whoever renders it should be reading the
 * overlay directly instead of finding it smuggled into a record shaped like the
 * extractor's output.
 *
 * `aspectConflicts` used to be excluded on that same ground and no longer can
 * be: the games do declare these, the extractor reads them now, and the field
 * is on `TraitRecord`. So it merges — but as a *union* rather than a
 * replacement, bc the overlay's entries are ones the data doesn't state rather
 * than corrections to ones it does. Overwriting would silently drop every
 * extracted conflict on any trait the overlay also mentions, which is the one
 * outcome nobody adding an overlay entry would be asking for. Sorted so the
 * merged list doesn't depend on which side happened to name a form first.
 */
function merge(game: GameKey): Readonly<Record<string, TraitRecord>> {
  const raw = dataFor(game).boons as Record<string, TraitRecord>;
  const overlay = overlayFor(game);
  const merged: Record<string, TraitRecord> = {};
  for (const [id, record] of Object.entries(raw)) {
    const entry = overlay[id];
    if (entry === undefined) {
      merged[id] = record;
      continue;
    }
    const patch: Partial<TraitRecord> = {};
    if (entry.god !== undefined) patch.god = entry.god;
    if (entry.aspectConflicts !== undefined) {
      patch.aspectConflicts = Object.freeze(
        [...new Set([...(record.aspectConflicts ?? []), ...entry.aspectConflicts])].sort(),
      );
    }
    merged[id] =
      Object.keys(patch).length === 0 ? record : Object.freeze({ ...record, ...patch });
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
