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
  /**
   * What a load still owes the user an explanation for, absent once they have
   * had it.
   *
   * Stored rather than re-derived, because it cannot be re-derived: the whole
   * point of the migration is that the offending ids are gone from the run by
   * the time it finishes, so the next load has nothing left to notice. Trying
   * to carry the owing in `facts.dataVersion` instead was the defect this
   * replaces — one field cannot mean both "which build this run was played on"
   * and "somebody still has to be told", because the first has to advance and
   * the second has to wait.
   */
  pendingNotice?: PersistedNotice;
  /**
   * Gods whose place in the pool does not depend on a boon being held: put
   * there directly, left behind by a purge, or left behind when a later boon
   * displaced theirs.
   *
   * A correction asks whether anything else still holds the god there, and
   * `held` is the wrong place to ask — every one of these was recorded
   * deliberately by a rule that says losing the boon does not undo the pickup.
   * Without this, correcting an unrelated mis-tap deleted them.
   */
  godsRewardedWithoutBoon?: GodId[];
}

/** A notice that has outlived the load that raised it. */
export interface PersistedNotice {
  /** The build the run was played on when the first unmatched id turned up. */
  playedOn: string;
  /** Everything still unacknowledged, across however many loads it took. */
  entries: QuarantinedEntry[];
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

/**
 * A run and the bookkeeping that travels with it.
 *
 * The last two are optional so that a caller building a record by hand — every
 * test here, and the fresh run a load starts — says only what it means. Absent
 * reads back as "nothing owed" and "no such god", which is what an older record
 * written before these existed also means.
 */
export interface StoredRun {
  state: RunState;
  quarantine: readonly QuarantinedEntry[];
  pendingNotice?: PersistedNotice | null;
  rewardedWithoutBoon?: ReadonlySet<GodId>;
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
    // Both written only when they carry something, so an ordinary run's record
    // looks exactly as it did before either existed.
    ...(run.pendingNotice == null ? {} : { pendingNotice: run.pendingNotice }),
    ...(run.rewardedWithoutBoon === undefined || run.rewardedWithoutBoon.size === 0
      ? {}
      : { godsRewardedWithoutBoon: [...run.rewardedWithoutBoon] }),
  };
}

const QUARANTINE_PATHS: ReadonlySet<string> = new Set([
  "held",
  "godPool",
  "slots",
  "bans",
  "equipped",
  "talents",
  "pins",
  "planned",
  "notes",
]);

/**
 * Checks the entries an earlier load set aside, which is the one field in the
 * record that exists to be read by something else later.
 *
 * Waved through, it is where this decoder would repair by omission. An entry
 * naming a path nothing recognises survives every reload, counts toward the
 * notice the user is shown, and can be restored by nobody — which is the shape
 * of the failure quarantine exists to prevent, reproduced inside quarantine
 * itself. Only the path and the key are checked: they are what says where a
 * value goes back, and a wrong one is unrecoverable in a way a malformed value
 * beside a good path is not.
 *
 * Absent is allowed and means none. That is a shape this build can read; a
 * present one of the wrong shape is not, and the two get different answers.
 */
function readQuarantine(raw: unknown): QuarantinedEntry[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error("stored quarantine is not a list");
  for (const entry of raw as unknown[]) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("stored quarantine holds an entry that is not an object");
    }
    const { path, key } = entry as { path?: unknown; key?: unknown };
    if (typeof path !== "string" || !QUARANTINE_PATHS.has(path)) {
      throw new Error(`stored quarantine names an unknown path: ${String(path)}`);
    }
    if (typeof key !== "string") {
      throw new Error(`stored quarantine holds a ${path} entry with no id`);
    }
  }
  return raw as QuarantinedEntry[];
}

/**
 * Checks a notice that outlived the load that raised it.
 *
 * Held to the same standard as the quarantine it names, and for a sharper
 * reason: this is the only record that somebody is still owed an explanation.
 * A malformed one read as absent would be the apology going missing quietly,
 * which is the failure the notice exists to prevent, one level up.
 */
function readNotice(raw: unknown): PersistedNotice | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object") throw new Error("stored notice is not an object");
  const { playedOn, entries } = raw as { playedOn?: unknown; entries?: unknown };
  if (typeof playedOn !== "string") {
    throw new Error("stored notice does not say which build the run was played on");
  }
  return { playedOn, entries: readQuarantine(entries) };
}

/** The god list is checked for the same reason the quarantine's keys are. */
function readGodList(raw: unknown): GodId[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error("stored god list is not a list");
  for (const god of raw as unknown[]) {
    if (typeof god !== "string") throw new Error("stored god list holds something that is not a name");
  }
  return raw as GodId[];
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
    quarantine: readQuarantine(raw.quarantine),
    pendingNotice: readNotice(raw.pendingNotice),
    rewardedWithoutBoon: new Set(readGodList(raw.godsRewardedWithoutBoon)),
  };
}

/** An empty run for one game, stamped with the catalog it was started against. */
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
