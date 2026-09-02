import { type SyncCatalog, shippedCatalog } from "./catalog-view.js";
import {
  type ManualSource,
  type OpenManualSourceOptions,
  openManualSource,
} from "./manual-source.js";
import { type OverrideLayer, createOverrideLayer } from "./override-layer.js";
import type { SaveSlot } from "./store.js";

/**
 * A source and the overlay laid over it, wired together and ended together.
 *
 * The two halves are built to be independent and are: the layer wraps any
 * source, and the source stores an overlay it never reads. What neither of them
 * can own alone is the run *boundary*. Opening another slot replaces the run
 * the source holds, and the overlay is the one piece of state the source
 * cannot reach — so a layer left alone goes on laying one run's hand-edits
 * over another, and puts them back in that run's record at the next change.
 * That is the same failure the source already refuses for the undo offer,
 * arriving through the one field it does not hold.
 *
 * So the pairing lives here rather than in a view. It is small enough to write
 * in three lines and exactly the kind of thing that gets written in three
 * slightly different ways in three places, one of which forgets.
 */
export interface RunSession {
  /**
   * Every writer: marks, the equipped kit, intent, undo, the migration notice.
   * **Except the three slot verbs** — call this session's, which is the whole
   * reason the pairing exists.
   */
  readonly source: ManualSource;

  /**
   * What a view reads facts through. It is itself a `RunStateSource`, so a
   * component holding it cannot tell it from a bare source, and the overrides
   * arrive without anything knowing they did.
   */
  readonly layer: OverrideLayer;

  /**
   * Opens a saved slot as the run in progress, handing every held field back
   * first. Here for the reason above: the overlay is the one thing the source
   * cannot reach.
   */
  openRun(slot: SaveSlot): Promise<void>;

  /** Starts a fresh run in a slot, replacing whatever that slot held. */
  startRun(slot: SaveSlot): Promise<void>;

  /**
   * Empties a slot. The overlay goes only where that slot is the open one —
   * deleting a run nobody is in changes nothing the layer is laid over.
   */
  deleteRun(slot: SaveSlot): Promise<void>;

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

  /**
   * Hands the overlay back, crosses the boundary, and puts it back where that
   * failed: the run this was to replace is still there, so the hand-edits over
   * it have to be too, and these same guards accepted them a moment ago.
   */
  async function acrossTheBoundary(boundary: () => Promise<void>): Promise<void> {
    const handHeld = layer.overrides;
    layer.clearOverrides();
    try {
      await boundary();
    } catch (cause) {
      for (const o of handHeld) layer.setOverride(o);
      throw cause;
    }
  }

  return {
    source,
    layer,

    /**
     * The overlay goes first: the last thing the source does is hand the new
     * facts to every listener, so clearing afterwards announces the arriving run
     * under the previous one's hand-edits. The slot left behind loses the
     * overlay, which is right — a slot stores the run as it really was.
     */
    async openRun(slot: SaveSlot): Promise<void> {
      await acrossTheBoundary(() => source.openRun(slot));
    },

    /** For the reason above; nothing of a run survives a fresh one in any case. */
    async startRun(slot: SaveSlot): Promise<void> {
      await acrossTheBoundary(() => source.startRun(slot));
    },

    /**
     * Only the open slot's deletion is a run change out here: deleting one
     * nobody is in leaves the layer laid over exactly what it was.
     */
    async deleteRun(slot: SaveSlot): Promise<void> {
      if (slot !== source.slot) {
        await source.deleteRun(slot);
        return;
      }
      await acrossTheBoundary(() => source.deleteRun(slot));
    },

    close(): void {
      layer.close();
    },
  };
}
