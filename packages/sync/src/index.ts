/**
 * The run-state port and its implementations.
 *
 * The port is internal, never user-facing: manual entry is "open a URL" & nothing
 * else. The manual source ships first; a read-only bridge fed by a game mod is a
 * later opt-in over a transport that hasn't been validated yet.
 *
 * What is here: the port, the manual source, IndexedDB persistence and the
 * migration pass that runs before any stored run reaches evaluation, and the
 * multi-tab warning. Not here yet: the field-level override layer and the
 * single-level undo that goes with it, so what a consumer reads today is the
 * source's own facts rather than facts merged with the user's hand edits.
 */

export type { RunStateSource, SourceCapabilities, SourceStatus, Unsub } from "./port.js";

export type { MirrorRow, SyncCatalog } from "./catalog-view.js";
export { shippedCatalog } from "./catalog-view.js";

export type { QuarantinedEntry } from "./quarantine.js";

export type { PersistedRun, StoredRun } from "./persisted.js";
export { STORE_VERSION, emptyRun, fromPersisted, toPersisted } from "./persisted.js";

export type { MigrateOptions, MigrationOutcome } from "./migrate.js";
export { migrate } from "./migrate.js";

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

export type { ManualSource, MarkOptions, MigrationNotice, OpenManualSourceOptions } from "./manual-source.js";
export { openManualSource } from "./manual-source.js";

export type { BroadcastChannelLike, TabPresence, TabPresenceOptions, Timers } from "./tabs.js";
export { createTabPresence } from "./tabs.js";
