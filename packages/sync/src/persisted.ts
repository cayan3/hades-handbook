import type {
  Element,
  GameId,
  GodId,
  HeldTrait,
  KeepsakeId,
  ResourceId,
  RunState,
  SlotId,
  TalentId,
  TalentSelection,
  TraitId,
} from "@repo/core";
import type { QuarantinedEntry } from "./quarantine.js";

/**
 * The shape of the persisted run, and the constant that says which shape it is.
 *
 * This counts the *storage* shape and has nothing to do with the game build a
 * run was played on — that is `facts.dataVersion`, and the two move for
 * unrelated reasons. A game patch renames traits; a change here means the
 * fields themselves moved. Reading a record written by a newer store version is
 * refused rather than attempted, since the alternative is silently interpreting
 * fields that mean something else now.
 */
export const STORE_VERSION = 1;

/**
 * A run as it sits in storage: plain JSON, no Map, no Set, no undefined.
 *
 * Structured clone would carry a `Map` through IndexedDB directly, and that is
 * the tempting shortcut. It is refused because it makes the stored shape
 * whatever the in-memory types happen to be that week, which is the one thing
 * `STORE_VERSION` is supposed to be able to describe. Writing the conversion
 * out also means the decoder is the single place that can refuse a malformed
 * record, and it can be read to find out what is actually on disk.
 *
 * Entries are `[key, value]` pairs rather than objects because trait ids are
 * the game's own strings and a few of them would collide with `Object`'s own
 * property names if they were used as keys.
 */
export interface PersistedRun {
  storeVersion: number;
  facts: PersistedFacts;
  intent: PersistedIntent;
  /**
   * Everything earlier loads could not match, carried forward. Kept in the
   * record rather than in memory so that "recoverable" survives closing the
   * tab, which is the only kind of recoverable worth claiming.
   */
  quarantine: QuarantinedEntry[];
}

interface PersistedFacts {
  game: GameId;
  dataVersion: string;
  held: [TraitId, HeldTrait][];
  godPool: GodId[];
  elements: [Element, number][];
  slots: [SlotId, TraitId | null][];
  equipped: {
    weapon?: string;
    aspect?: string;
    keepsake?: KeepsakeId;
    talents?: [TalentId, TalentSelection][];
  };
  resources: [ResourceId, number][];
  bans: TraitId[];
}

interface PersistedIntent {
  pins: TraitId[];
  planned: TraitId[];
  notes: [TraitId, string][];
}

/** A run and the entries an earlier load set aside, which travel together. */
export interface StoredRun {
  state: RunState;
  quarantine: readonly QuarantinedEntry[];
}

export function toPersisted(run: StoredRun): PersistedRun {
  const { facts, intent } = run.state;

  /**
   * Optional fields are written only when they are actually set. An explicit
   * `undefined` and an absent key mean the same thing to JSON but not to the
   * model: an absent `talents` is "nobody asked", and reintroducing the key
   * with an empty value would turn that into "asked, and the answer was none",
   * which is permanent for the run.
   */
  const equipped: PersistedFacts["equipped"] = {};
  if (facts.equipped.weapon !== undefined) equipped.weapon = facts.equipped.weapon;
  if (facts.equipped.aspect !== undefined) equipped.aspect = facts.equipped.aspect;
  if (facts.equipped.keepsake !== undefined) equipped.keepsake = facts.equipped.keepsake;
  if (facts.equipped.talents !== undefined) equipped.talents = [...facts.equipped.talents];

  return {
    storeVersion: STORE_VERSION,
    facts: {
      game: facts.game,
      dataVersion: facts.dataVersion,
      held: [...facts.held],
      godPool: [...facts.godPool],
      elements: [...facts.elements],
      slots: [...facts.slots],
      equipped,
      resources: [...facts.resources],
      bans: [...facts.bans],
    },
    intent: {
      pins: [...intent.pins],
      planned: [...intent.planned],
      notes: [...intent.notes],
    },
    quarantine: [...run.quarantine],
  };
}

/**
 * Turns a stored record back into a run, or refuses.
 *
 * Refuses rather than repairs, in both directions. A record from a newer store
 * version cannot be read by definition, and a record whose fields are missing
 * or the wrong type is not a run that lost a field — it is a record this code
 * has no idea about, and coercing it would produce a plausible-looking run
 * assembled out of defaults. The caller decides what to tell the user; what
 * this must not do is quietly hand back something emptier than what was stored.
 */
export function fromPersisted(record: unknown): StoredRun {
  if (typeof record !== "object" || record === null) {
    throw new Error("stored run is not an object");
  }
  const raw = record as Partial<PersistedRun>;

  if (raw.storeVersion !== STORE_VERSION) {
    throw new Error(
      `stored run is store version ${String(raw.storeVersion)}, this build reads ${STORE_VERSION}`,
    );
  }

  const facts = raw.facts;
  const intent = raw.intent;
  if (facts === undefined || intent === undefined) {
    throw new Error("stored run is missing facts or intent");
  }
  if (facts.game !== "hades1" && facts.game !== "hades2") {
    throw new Error(`stored run names an unknown game: ${String(facts.game)}`);
  }

  const equipped: RunState["facts"]["equipped"] = {};
  if (facts.equipped.weapon !== undefined) equipped.weapon = facts.equipped.weapon;
  if (facts.equipped.aspect !== undefined) equipped.aspect = facts.equipped.aspect;
  if (facts.equipped.keepsake !== undefined) equipped.keepsake = facts.equipped.keepsake;
  if (facts.equipped.talents !== undefined) equipped.talents = new Map(facts.equipped.talents);

  return {
    state: {
      facts: {
        game: facts.game,
        dataVersion: facts.dataVersion,
        held: new Map(facts.held),
        godPool: new Set(facts.godPool),
        elements: new Map(facts.elements),
        slots: new Map(facts.slots),
        equipped,
        resources: new Map(facts.resources),
        bans: new Set(facts.bans),
      },
      intent: {
        pins: new Set(intent.pins),
        planned: new Set(intent.planned),
        notes: new Map(intent.notes),
      },
    },
    quarantine: raw.quarantine ?? [],
  };
}

/**
 * An empty run for one game, stamped with the catalog it was started against.
 *
 * `progress` is absent and there is no way to set it, which is deliberate and
 * is explained where the manual source refuses to collect it.
 */
export function emptyRun(game: GameId, dataVersion: string): RunState {
  return {
    facts: {
      game,
      dataVersion,
      held: new Map(),
      godPool: new Set(),
      elements: new Map(),
      slots: new Map(),
      equipped: {},
      resources: new Map(),
      bans: new Set(),
    },
    intent: {
      pins: new Set(),
      planned: new Set(),
      notes: new Map(),
    },
  };
}
