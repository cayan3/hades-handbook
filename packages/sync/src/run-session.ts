import { type SyncCatalog, shippedCatalog } from "./catalog-view.js";
import {
  type ManualSource,
  type OpenManualSourceOptions,
  openManualSource,
} from "./manual-source.js";
import { type OverrideLayer, createOverrideLayer } from "./override-layer.js";

/**
 * A source and the overlay laid over it, wired together and ended together.
 *
 * The two halves are built to be independent and are: the layer wraps any
 * source, and the source stores an overlay it never reads. What neither of them
 * can own alone is the run *boundary*. Ending a run empties the source and
 * starts a fresh one, and the overlay is the one piece of state the source
 * cannot reach — so a layer left alone goes on laying a finished run's
 * hand-edits over a run that has not started, and puts them back in the record
 * at the next change. That is the same failure `finishRun` already refuses for
 * the undo offer, arriving through the one field it does not hold.
 *
 * So the pairing lives here rather than in a view. It is small enough to write
 * in three lines and exactly the kind of thing that gets written in three
 * slightly different ways in three places, one of which forgets.
 */
export interface RunSession {
  /**
   * Every writer: marks, the equipped kit, intent, undo, the migration notice.
   * **Except `finishRun`** — call this session's, which is the whole reason
   * the pairing exists.
   */
  readonly source: ManualSource;

  /**
   * What a view reads facts through. It is itself a `RunStateSource`, so a
   * component holding it cannot tell it from a bare source, and the overrides
   * arrive without anything knowing they did.
   */
  readonly layer: OverrideLayer;

  /**
   * Ends the run, hands every field back to the source first, and leaves the
   * pair over a fresh run.
   */
  finishRun(): Promise<void>;

  /** Stops the layer listening. The stored run is untouched. */
  close(): void;
}

/**
 * Opens the active run and lays an override layer over it.
 *
 * The overlay comes back from the record the source loaded, already scanned for
 * ids the catalog has since forgotten, and every change to it goes back to the
 * same record through the same writer.
 */
export async function openRunSession(options: OpenManualSourceOptions): Promise<RunSession> {
  // Resolved once and handed to both, so the layer's guard and the migration
  // pass can never be checking against two different catalogs.
  const catalog: SyncCatalog = options.catalog ?? shippedCatalog(options.game);
  const source = await openManualSource({ ...options, catalog });

  const layer = createOverrideLayer({
    source,
    catalog,
    restored: source.overrides,
    persist: (overrides) => {
      source.putOverrides(overrides);
    },
  });

  return {
    source,
    layer,

    /**
     * The overlay is handed back **before** the run ends, not after.
     *
     * After, there is a window with no way to close it from out here: the last
     * thing `finishRun` does is hand the fresh facts to every listener, and the
     * layer is one of them, so it recomputes and announces a merge of a run
     * that has not started under the previous run's hand-edits. A view is told
     * that once, and it is exactly the wrong answer.
     *
     * Which leaves the finished record without the overlay it had, and that is
     * the right trade rather than a cost worth avoiding: an override is what
     * the user is *trying out* over what happened, and a run that has ended has
     * nothing left to try. What is stored in `last` is the run as it really
     * was.
     */
    async finishRun(): Promise<void> {
      const handHeld = layer.overrides;
      layer.clearOverrides();
      try {
        await source.finishRun();
      } catch (cause) {
        // Ending a run is the one edit that discards what it holds, so a
        // failure has to leave everything where it was and let the caller
        // retry. The run itself is intact already; the overlay is only intact
        // if it is put back, and it was accepted by these same guards a moment
        // ago.
        for (const o of handHeld) layer.setOverride(o);
        throw cause;
      }
    },

    close(): void {
      layer.close();
    },
  };
}
