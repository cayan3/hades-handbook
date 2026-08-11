import { type GameKey, dataFor } from "./data.js";
import { overlayFor } from "./overlay.js";
import { type TraitRecord, isRequirementNode } from "./schema.js";

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
function merge(game: GameKey): {
  records: Readonly<Record<string, TraitRecord>>;
  refused: readonly string[];
} {
  const raw = dataFor(game).boons as Record<string, TraitRecord>;
  const overlay = overlayFor(game);
  const merged: Record<string, TraitRecord> = {};
  const refused: string[] = [];
  for (const [id, record] of Object.entries(raw)) {
    /**
     * A record whose gate isn't a `Requirement` doesn't get handed over.
     *
     * The extractor refuses to guess a clause it can't classify and says so on
     * the record instead, which is right — and it means two Hades II records
     * ship a prereq that is a node with no `kind`. This is the last place that
     * can notice: past here the field is typed as the engine's own union and
     * every consumer is entitled to believe it.
     *
     * Refused rather than repaired, because each repair is worse. Inventing a
     * prerequisite is what the build failure exists to prevent, the unresolved
     * clause being a member list nothing can reconstruct. Nulling it means "no
     * prerequisite", so a Chaos curse called Barren would read as takeable now.
     * Leaving it to whoever renders a node moves the question one layer out and
     * makes every future consumer remember the same guard.
     *
     * The cost is that these two can't be looked up at all. Both are Chaos,
     * out of v1 scope, and both keep their build failure, so what was lost is
     * recoverable once somebody decides what such a record should say.
     */
    if (record.prereq != null && !isRequirementNode(record.prereq)) {
      refused.push(id);
      continue;
    }

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
  return { records: Object.freeze(merged), refused: Object.freeze(refused.sort()) };
}

const MERGED: Readonly<Record<GameKey, ReturnType<typeof merge>>> = Object.freeze({
  hades1: merge("hades1"),
  hades2: merge("hades2"),
});

export function traitsFor(game: GameKey): Readonly<Record<string, TraitRecord>> {
  return MERGED[game].records;
}

/**
 * The ids this catalog would not hand over, sorted. Exported so the refusal is
 * something you can look at: a record that vanishes between the snapshot and the
 * app with nothing naming it gets rediscovered as a bug two sessions later.
 */
export function refusedTraits(game: GameKey): readonly string[] {
  return MERGED[game].refused;
}
