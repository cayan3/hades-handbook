import type {
  Element,
  GodId,
  HeldTrait,
  ResourceId,
  RunFacts,
  SlotId,
  TalentId,
  TalentSelection,
  TraitId,
} from "@repo/core";

/**
 * One fact the user has taken into their own hands.
 *
 * The point of the layer is planning against a run that's still being
 * reported; e.g. deselect a boon the source insists is held, mark the
 * replacement, and see what that would do. An override addresses **one field**,
 * and everything it doesn't address keeps coming from the source. A whole-facts
 * "here is what I think the run is" would be a second source instead of an
 * overlay, and moving the real one there would leave no way to tell which parts
 * of the copy were actually intended.
 *
 * This is typed instead of `unknown` at the value bc this is the seam where a
 * hand-held value enters the facts read by evaluation, so the alternative is a
 * cast at the point where being wrong is ermm least visible :sobbing: :sobbing:.
 * The union is also what makes the merge below a total switch instead of like
 * a bag of `if`s lol.
 *
 * Two rows purposefully don't carry a value. A god pool and a ban list are sets
 * (the only thing that can be said about one member is whether it's in or not),
 * so `present` says it directly instead of making membership seem like some
 * value that just happens to be a boolean lol.
 */
export type FactOverride =
  | { path: "held"; key: TraitId; value: HeldTrait | null }
  | { path: "godPool"; god: GodId; present: boolean }
  | { path: "elements"; element: Element; value: number }
  | { path: "slots"; slot: SlotId; value: TraitId | null }
  | { path: "resources"; resource: ResourceId; value: number }
  | { path: "bans"; trait: TraitId; present: boolean }
  | { path: "equipped"; field: "weapon" | "aspect" | "keepsake"; value: string | null }
  /**
   * This is its own path instead of a fourth `equipped` field bc the equipped
   * row addresses one scalar at a time and the talent map needs "set this one
   * entry, leave the rest" (which is the shape the keyed paths already have).
   * Three states instead of two, for the same reason the map has three:
   * `null` removes the key and restores "nobody asked", which has to stay
   * tellable apart from a definite no. Hades I only in practice; the row is
   * inert for the other game instead of absent from the type.
   */
  | { path: "talents"; talent: TalentId; selection: TalentSelection | null };

/** Which field an override addresses, in the union's own vocab. */
export type OverridePath = FactOverride["path"];

/**
 * The part of an override that says *which* field, with the value left out.
 *
 * Every row names its key with a different word (e.g. `key`, `god`, `element`,
 * `slot`, `resource`, `trait`, `field`, `talent`) bc at the call site
 * `{ path: "godPool", god: "Hera" }` reads and `{ path: "godPool", key: "Hera" }`
 * doesn't. This is the one place that has to flatten them back out :salute: :salute:.
 */
export function overrideKeyOf(o: FactOverride): string {
  switch (o.path) {
    case "held":
      return o.key;
    case "godPool":
      return o.god;
    case "elements":
      return o.element;
    case "slots":
      return o.slot;
    case "resources":
      return o.resource;
    case "bans":
      return o.trait;
    case "equipped":
      return o.field;
    case "talents":
      return o.talent;
  }
}

/**
 * The canonical address of the field an override holds, so that overriding the
 * same field twice replaces instead of accumulates.
 *
 * Path is first and separated so two paths can never produce one key; no path
 * name is a prefix of another, and the identifiers after the colon are the
 * game's own strings and never a path name plus a colon.
 */
export function factKey(o: FactOverride): string {
  return fieldKey(o.path, overrideKeyOf(o));
}

/** The same address, built from the two parts a caller usually has. */
export function fieldKey(path: OverridePath, key: string): string {
  return `${path}:${key}`;
}

/**
 * Every field currently held by hand, addressed by `factKey`.
 *
 * This is a map instead of a list because "override this field again" has to
 * replace, and also bc the question a view asks most often is whether one named
 * field is hand-held (that's the entire "diverges from live" marker, and it's
 * per field instead of some mode that the whole run is in).
 */
export interface OverlayState {
  overrides: Map<string, FactOverride>;
}

export function emptyOverlay(): OverlayState {
  return { overrides: new Map() };
}

export function overlayOf(overrides: Iterable<FactOverride>): OverlayState {
  const state = emptyOverlay();
  for (const o of overrides) state.overrides.set(factKey(o), o);
  return state;
}

/**
 * The facts the UI and evaluation actually read: what the source reports, with
 * the user's hand-edits laid over the fields they name.
 *
 * Identity is load-bearing here and is the easiest thing to get wrong. Every
 * write in a source hands out a whole new facts object with the collections it
 * didn't touch shared, so a consumer can memoize on identity; a merge that
 * built a fresh object every time would make every one of those memos miss, and
 * one that wrote into the source's own collections would make them all hit and
 * be wrong. So two rules hold below: **an empty overlay returns the source
 * object itself**, and a non-empty one copies only the collections some
 * override actually addresses. The caller is expected to cache the result and
 * recompute it only when the source facts or the overlay change; this function
 * is pure and says nothing about how often it runs :salute: :salute:.
 *
 * Returning the source unchanged when nothing is overridden is also what makes
 * the round trip exact instead of merely equal: set an override, clear it, and
 * what comes back is the object the source handed over, not a copy of it.
 */
export function mergeFacts(source: RunFacts, overlay: OverlayState): RunFacts {
  if (overlay.overrides.size === 0) return source;

  let held = source.held;
  let godPool = source.godPool;
  let elements = source.elements;
  let slots = source.slots;
  let resources = source.resources;
  let bans = source.bans;
  let equipped = source.equipped;
  let talents: Map<TalentId, TalentSelection> | null = null;

  /** Copies `equipped` once, whichever of its two paths asked first. */
  function ownEquipped(): void {
    if (equipped === source.equipped) equipped = { ...equipped };
  }

  for (const o of overlay.overrides.values()) {
    switch (o.path) {
      case "held": {
        if (held === source.held) held = new Map(held);
        if (o.value === null) held.delete(o.key);
        else held.set(o.key, o.value);
        break;
      }

      case "godPool": {
        if (godPool === source.godPool) godPool = new Set(godPool);
        if (o.present) godPool.add(o.god);
        else godPool.delete(o.god);
        break;
      }

      /**
       * Set literally, including zero. A source normalizes a count of zero away
       * bc a stored zero is noise in a record; here the override *is* the
       * user's statement about the field, and turning a stated zero into an
       * absent key would be this layer deciding that the two are the same.
       * They're the same to the one atom that reads the count, which is a fact
       * about evaluation instead of about the field.
       */
      case "elements": {
        if (elements === source.elements) elements = new Map(elements);
        elements.set(o.element, o.value);
        break;
      }

      /**
       * `null` here is a value and not an absence; the slot exists and is
       * empty, which is the same thing a migration writes when it keeps a slot
       * whose occupant has gone. The `equipped` row's `null` a few cases down
       * means the opposite, and the two are in fact worth keeping straight.
       */
      case "slots": {
        if (slots === source.slots) slots = new Map(slots);
        slots.set(o.slot, o.value);
        break;
      }

      case "resources": {
        if (resources === source.resources) resources = new Map(resources);
        resources.set(o.resource, o.value);
        break;
      }

      case "bans": {
        if (bans === source.bans) bans = new Set(bans);
        if (o.present) bans.add(o.trait);
        else bans.delete(o.trait);
        break;
      }

      /**
       * `null` is "nothing equipped", which an optional field spells as absent
       * instead of a null sitting in it. Writing the null through would
       * leave a weapon slot holding a value that isn't a weapon, which every
       * reader would then have to know to ignore lol.
       */
      case "equipped": {
        ownEquipped();
        if (o.value === null) delete equipped[o.field];
        else equipped[o.field] = o.value;
        break;
      }

      case "talents": {
        talents ??= new Map(source.equipped.talents ?? []);
        if (o.selection === null) talents.delete(o.talent);
        else talents.set(o.talent, o.selection);
        break;
      }
    }
  }

  if (talents !== null) {
    ownEquipped();
    /**
     * A run nobody asked about keeps its absent map. Overriding a talent and
     * then clearing that one entry must not leave an *empty* map behind where
     * the source had none; absent is "nobody asked" and empty is "asked, and
     * none is selected", which is a permanent Impossible for every trait those
     * rows gate. Manufacturing the second out of the first is ermm the one
     * mistake that this whole three-state shape exists to prevent lol.
     */
    if (talents.size === 0 && source.equipped.talents === undefined) delete equipped.talents;
    else equipped.talents = talents;
  }

  return {
    game: source.game,
    dataVersion: source.dataVersion,
    held,
    godPool,
    elements,
    slots,
    equipped,
    resources,
    bans,
  };
}
