/**
 * The run-state port and its implementations.
 *
 * The port is internal, never user-facing: manual entry is "open a URL" & nothing
 * else. The manual source ships first; a read-only bridge fed by a game mod is a
 * later opt-in over a transport that hasn't been validated yet.
 *
 * What is here: the port, the manual source, IndexedDB persistence and the
 * migration pass that runs before any stored run reaches evaluation, the
 * multi-tab warning, and the field-level override layer with the single-level
 * undo that goes beside it. A consumer reading facts through a layered source
 * is reading the effective ones — what the source reports, with the fields the
 * user is holding by hand laid over them — which is what makes a hypothetical
 * show up in the answers immediately rather than after a reload.
 *
 * Not here yet: the control that pauses a source while planning. It is worth
 * nothing until there is a source that reports something the user did not type,
 * and it belongs with that source rather than ahead of it.
 */

export type { RunStateSource, SourceCapabilities, SourceStatus, Unsub } from "./port.js";

export type { MirrorRow, SyncCatalog } from "./catalog-view.js";
export { shippedCatalog } from "./catalog-view.js";

export type { QuarantinedEntry } from "./quarantine.js";

export type { FactOverride, OverlayState, OverridePath } from "./overrides.js";
export { emptyOverlay, factKey, fieldKey, mergeFacts, overlayOf, overrideKeyOf } from "./overrides.js";

export type { OverrideLayer, OverrideLayerOptions } from "./override-layer.js";
export { createOverrideLayer } from "./override-layer.js";

export type { RunSession } from "./run-session.js";
export { openRunSession } from "./run-session.js";

export type { PersistedRun, StoredRun } from "./persisted.js";
export { STORE_VERSION, emptyRun, fromPersisted, toPersisted } from "./persisted.js";

export type { MigrateOptions, MigrationOutcome, OverrideScan } from "./migrate.js";
export { migrate, scanOverrides } from "./migrate.js";

export type { RunSlot, RunStore } from "./store.js";
export { DB_NAME, DB_VERSION, STORE_NAME, createMemoryStore, recordKey } from "./store.js";

export type {
  IdbDatabaseLike,
  IdbFactoryLike,
  IdbObjectStoreLike,
  IdbOpenRequestLike,
  IdbRequestLike,
  IdbTransactionLike,
} from "./idb-store.js";
export { createIdbStore } from "./idb-store.js";

export type {
  EditAction,
  ManualSource,
  MarkOptions,
  MigrationNotice,
  OpenManualSourceOptions,
  SourceCondition,
  UndoableEdit,
} from "./manual-source.js";
export { openManualSource } from "./manual-source.js";

export type { BroadcastChannelLike, TabPresence, TabPresenceOptions, Timers } from "./tabs.js";
export { createTabPresence } from "./tabs.js";
