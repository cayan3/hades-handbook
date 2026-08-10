import type { RunFacts } from "@repo/core";
import type { SyncCatalog } from "./catalog-view.js";
import {
  type FactOverride,
  type OverridePath,
  emptyOverlay,
  factKey,
  fieldKey,
  mergeFacts,
  overlayOf,
} from "./overrides.js";
import type { RunStateSource, Unsub } from "./port.js";

/**
 * A source with the user's hand-edits laid over it.
 *
 * It is itself a `RunStateSource`, which is the whole design: a view reads
 * facts through the port and cannot tell whether it is holding a bare source or
 * a layered one, so the override behaviour arrives without a single component
 * knowing about it. Anything that genuinely needs the difference — the
 * "diverges from live" marker, the control that hands a field back to sync —
 * asks this interface rather than the port.
 */
export interface OverrideLayer extends RunStateSource {
  /** Every field currently held by hand, in no particular order. */
  readonly overrides: readonly FactOverride[];

  /**
   * Whether this one field is hand-held rather than coming from the source.
   * The marker a view puts beside an overridden field, which is per field and
   * never a mode the whole run is in.
   */
  isOverridden(path: OverridePath, key: string): boolean;

  /** What the source itself reports, with nothing merged over it. */
  sourceFacts(): RunFacts;

  /** Takes one field in hand, replacing any earlier override of that field. */
  setOverride(o: FactOverride): void;

  /** Hands one field back to the source, which repopulates it immediately. */
  clearOverride(path: OverridePath, key: string): void;

  /** Hands every field back at once. */
  clearOverrides(): void;

  /** Stops listening to the source. The source itself is left alone. */
  close(): void;
}

export interface OverrideLayerOptions {
  /**
   * The source these overrides sit on top of. Any source: the layer's whole
   * purpose is hand-editing a fact something else keeps reporting, which is a
   * problem manual entry does not have and a connected bridge does.
   */
  source: RunStateSource;

  /**
   * Checked against, so an override cannot name something the catalog has never
   * heard of. Required rather than optional: an override goes straight into the
   * facts evaluation reads, every id one can name comes off a catalog-driven
   * list in the first place, and a guard a caller can switch off by leaving an
   * argument out is a guard that will be off.
   */
  catalog: SyncCatalog;

  /** Overrides restored from storage, if the run had any. */
  restored?: Iterable<FactOverride>;

  /**
   * Handed every override in force whenever that changes, so that whoever owns
   * the stored run can put them in it.
   *
   * A callback rather than a store of this layer's own, because the run record
   * has exactly one writer and adding a second would mean two halves of the
   * same record racing each other. Absent means the overlay lasts as long as
   * the page, which is the honest answer for a source with nowhere to keep it.
   */
  persist?(overrides: readonly FactOverride[]): void;
}

/**
 * Lays a set of field-level overrides over a source.
 *
 * Incoming facts keep updating every field nobody has taken in hand, which is
 * the behaviour this exists for: plan against a run that is still being
 * reported, without the next update undoing the planning and without going
 * offline to get that. The alternative — pausing the whole source while
 * planning — is a mode, and a mode is a thing to be in and forget you are in.
 */
export function createOverrideLayer(options: OverrideLayerOptions): OverrideLayer {
  const { source, catalog } = options;
  const persist = options.persist;
  const overlay = options.restored === undefined ? emptyOverlay() : overlayOf(options.restored);

  let sourceFacts = source.getFacts();
  const listeners = new Set<(facts: RunFacts) => void>();

  /**
   * The merged facts, held until something makes them wrong.
   *
   * Recomputing per read would hand out an equal-but-new object every time and
   * defeat every consumer that memoizes evaluation on the identity of the facts
   * — which is most of them, since re-deriving a whole game's worth of state is
   * the one thing that has to stay off the critical path. So the merge runs
   * when the source moves or the overlay changes, and not otherwise.
   */
  let merged: RunFacts | null = null;

  function facts(): RunFacts {
    merged ??= mergeFacts(sourceFacts, overlay);
    return merged;
  }

  function announce(): void {
    const current = facts();
    for (const listener of listeners) listener(current);
  }

  /**
   * A change to the overlay is a change to what everything downstream reads,
   * exactly as an incoming fact is, so it goes out the same way. A view that
   * subscribed to the port has no other way to hear about it.
   */
  function overlayChanged(): void {
    merged = null;
    persist?.(overrides());
    announce();
  }

  /**
   * Copies on the way out for the reason `overlayOf` copies on the way in: the
   * merge below is cached, so an override a caller still holds a reference to
   * is one it can change without anything invalidating that cache.
   */
  function overrides(): readonly FactOverride[] {
    return [...overlay.overrides.values()].map((o) => ({ ...o }));
  }

  /**
   * An override may only name something the catalog can identify, on the same
   * ground the write-side guards stand on: the id came off a catalog-driven
   * list, so one the catalog does not have is a programming error rather than
   * user input, and left to reach the facts it would be a dangling id in the
   * one place nothing scans.
   *
   * The unchecked fields are unchecked for the reasons the migration gives, not
   * out of inattention: there is no resource table and no weapon table to check
   * against, and the elements are a closed set the type already fixes.
   */
  function check(o: FactOverride): void {
    const missing = (what: string, id: string): Error =>
      new Error(`no ${what} "${id}" in the ${catalog.game} catalog`);

    switch (o.path) {
      case "held":
        if (!Object.hasOwn(catalog.traits, o.key)) throw missing("trait", o.key);
        return;
      case "bans":
        if (!Object.hasOwn(catalog.traits, o.trait)) throw missing("trait", o.trait);
        return;
      case "godPool":
        if (!catalog.gods.has(o.god)) throw missing("god", o.god);
        return;
      case "slots":
        if (!catalog.slots.has(o.slot)) throw missing("slot", o.slot);
        if (o.value !== null && !Object.hasOwn(catalog.traits, o.value)) {
          throw missing("trait", o.value);
        }
        return;
      case "talents":
        if (!catalog.talents.has(o.talent)) throw missing("talent", o.talent);
        return;
      case "equipped":
        if (o.value === null) return;
        // The weapon is the one equipped field with no table behind it. An
        // aspect is checked against the trait table, which is where a weapon
        // form lives in both games.
        if (o.field === "aspect" && !Object.hasOwn(catalog.traits, o.value)) {
          throw missing("trait", o.value);
        }
        if (o.field === "keepsake" && !catalog.keepsakes.has(o.value)) {
          throw missing("keepsake", o.value);
        }
        return;
      case "elements":
      case "resources":
        return;
    }
  }

  const unsubscribe = source.subscribe((next) => {
    /**
     * An update that hands back the facts object the layer already has is not a
     * change to any fact — it is what a source does when it writes something
     * the port does not carry. Recomputing the merge for one would hand every
     * consumer a new object saying exactly what the old one said, and every
     * memo keyed on it would miss for nothing.
     */
    if (next !== sourceFacts) {
      sourceFacts = next;
      merged = null;
    }
    announce();
  });

  return {
    get status() {
      return source.status;
    },

    get capabilities() {
      return source.capabilities;
    },

    get overrides() {
      return overrides();
    },

    getFacts(): RunFacts {
      return facts();
    },

    sourceFacts(): RunFacts {
      return sourceFacts;
    },

    subscribe(cb: (f: RunFacts) => void): Unsub {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },

    isOverridden(path: OverridePath, key: string): boolean {
      return overlay.overrides.has(fieldKey(path, key));
    },

    setOverride(o: FactOverride): void {
      check(o);
      overlay.overrides.set(factKey(o), { ...o });
      overlayChanged();
    },

    clearOverride(path: OverridePath, key: string): void {
      if (!overlay.overrides.delete(fieldKey(path, key))) return;
      overlayChanged();
    },

    clearOverrides(): void {
      if (overlay.overrides.size === 0) return;
      overlay.overrides.clear();
      overlayChanged();
    },

    close(): void {
      unsubscribe();
      listeners.clear();
    },
  };
}
