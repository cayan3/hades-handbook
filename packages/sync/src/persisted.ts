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
import type { FactOverride } from "./overrides.js";
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
  /**
   * The fields the user is holding by hand, so that planning survives a reload
   * the way the run itself does.
   *
   * Kept beside the facts rather than inside them, which is the split the whole
   * layer rests on: these are not things that happened, they are things the
   * user is trying out over what happened, and merging the two here would lose
   * the only record of which is which. Handed back untouched by whoever loads
   * the run — nothing on this side reads an override or knows what one means.
   */
  overrides?: FactOverride[];
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
 * The last three are optional so that a caller building a record by hand —
 * every test here, and the fresh run a load starts — says only what it means.
 * Absent reads back as "nothing owed", "no such god" and "nothing held by
 * hand", which is what an older record written before these existed also means.
 */
export interface StoredRun {
  state: RunState;
  quarantine: readonly QuarantinedEntry[];
  pendingNotice?: PersistedNotice | null;
  rewardedWithoutBoon?: ReadonlySet<GodId>;
  overrides?: readonly FactOverride[];
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
    // All three are written only when they carry something, so an ordinary
    // run's record looks exactly as it did before any of them existed — which
    // is the same thing that lets a record written by an older build be read
    // here without a store version between them.
    ...(run.pendingNotice == null ? {} : { pendingNotice: run.pendingNotice }),
    ...(run.rewardedWithoutBoon === undefined || run.rewardedWithoutBoon.size === 0
      ? {}
      : { godsRewardedWithoutBoon: [...run.rewardedWithoutBoon] }),
    ...(run.overrides === undefined || run.overrides.length === 0
      ? {}
      : { overrides: [...run.overrides] }),
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
  "overrides",
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

/**
 * Checks the fields the user is holding by hand.
 *
 * Held to a stricter standard than the quarantine beside it, and the difference
 * is the whole reason: a quarantined value is set aside and handed to nobody,
 * while an override's value is merged into the facts and read by evaluation on
 * the next frame. A count that came back a string would not throw anywhere —
 * evaluation is total — it would quietly answer a comparison wrong, which is
 * the failure that costs a session to find. So the value is checked here, where
 * the record is still a record, rather than trusted at the point where being
 * wrong is invisible.
 *
 * Absent means none, on the same terms as the quarantine: it is a shape this
 * build can read, and it is what every record written before overrides existed
 * says.
 */
function isHeldTrait(v: unknown): boolean {
  if (typeof v !== "object" || v === null) return false;
  const held = v as Record<string, unknown>;
  return typeof held.level === "number" && typeof held.rarity === "string";
}

/**
 * Checks the held boons, which had the same hole an override's value had, in the
 * field evaluation reads most.
 *
 * A `[id, {}]` pair decoded straight into the map, and `evaluate` compares
 * `held.level` against a requirement's minimum — so the boon read as unheld for
 * `hasTrait` while every set-shaped question about the same run counted it. One
 * run answering two ways, with nothing throwing anywhere.
 *
 * Refusing the record is only affordable because a refusal is now survivable and
 * explained: it is set aside, a fresh run starts, and the load says so on screen.
 * `mark` is the only writer of this map and builds the record itself, so what
 * gets refused here was corrupted or came from somewhere else.
 */
function readHeld(raw: unknown): [TraitId, HeldTrait][] {
  if (!Array.isArray(raw)) throw new Error("stored run's held boons are not a list");
  for (const entry of raw as unknown[]) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") {
      throw new Error("stored run holds a boon with no id");
    }
    if (!isHeldTrait(entry[1])) {
      throw new Error(`stored run holds "${String(entry[0])}" with no level or rarity`);
    }
  }
  return raw as [TraitId, HeldTrait][];
}

function readOverrides(raw: unknown): FactOverride[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error("stored overrides are not a list");

  for (const entry of raw as unknown[]) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("stored overrides hold an entry that is not an object");
    }
    const o = entry as Record<string, unknown>;
    const refuse = (why: string): never => {
      throw new Error(`stored override ${String(o.path)} ${why}`);
    };

    const id = (field: string): void => {
      if (typeof o[field] !== "string") refuse(`names no ${field}`);
    };
    const value = (ok: (v: unknown) => boolean): void => {
      if (!ok(o.value)) refuse("carries a value of the wrong shape");
    };

    switch (o.path) {
      /**
       * The one arm whose value is a record rather than a scalar, and the only
       * one that decides a verdict. Evaluation compares `level` against a
       * requirement's minimum, so a level that came back missing or as a string
       * makes that comparison false and the boon reads as unheld — while every
       * set-shaped question about the same run still counts it. That is one run
       * answering "you have a boon of this god" and "you have this boon" two
       * different ways, which is the shape of wrongness this whole function was
       * written to stop and was the one arm not doing it.
       *
       * `rarity` is checked as a string and no further. Nothing in evaluation
       * reads it, so a wrong one costs a display colour rather than an answer,
       * and the closed set lives in `core` as a type with no runtime value —
       * a copy of the list here would turn the next rarity added there into a
       * record this build refuses to open.
       */
      case "held":
        id("key");
        value((v) => v === null || isHeldTrait(v));
        break;
      case "godPool":
        id("god");
        if (typeof o.present !== "boolean") refuse("does not say whether the god is in");
        break;
      case "bans":
        id("trait");
        if (typeof o.present !== "boolean") refuse("does not say whether the trait is in");
        break;
      case "elements":
        id("element");
        value((v) => typeof v === "number");
        break;
      case "resources":
        id("resource");
        value((v) => typeof v === "number");
        break;
      case "slots":
        id("slot");
        value((v) => v === null || typeof v === "string");
        break;
      case "equipped":
        if (o.field !== "weapon" && o.field !== "aspect" && o.field !== "keepsake") {
          refuse("names no field of the equipped kit");
        }
        value((v) => v === null || typeof v === "string");
        break;
      case "talents":
        id("talent");
        if (o.selection !== null && o.selection !== "selected" && o.selection !== "notSelected") {
          refuse("carries a selection that is neither answer nor absence");
        }
        break;
      default:
        throw new Error(`stored overrides name an unknown field: ${String(o.path)}`);
    }
  }

  return raw as FactOverride[];
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
        held: new Map(readHeld(facts.held)),
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
    overrides: readOverrides(raw.overrides),
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
