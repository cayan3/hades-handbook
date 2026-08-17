import type {
  AspectId,
  Element,
  GameId,
  GodId,
  HeldTrait,
  KeepsakeId,
  Rarity,
  ResourceId,
  RunFacts,
  RunIntent,
  RunState,
  TalentId,
  TalentSelection,
  TraitId,
} from "@repo/core";
import { type SyncCatalog, shippedCatalog } from "./catalog-view.js";
import { migrate, scanOverrides } from "./migrate.js";
import type { FactOverride } from "./overrides.js";
import {
  type PersistedNotice,
  type StoredRun,
  emptyRun,
  fromPersisted,
  toPersisted,
} from "./persisted.js";
import type { RunStateSource, Unsub } from "./port.js";
import type { QuarantinedEntry } from "./quarantine.js";
import { type RunStore, createMemoryStore } from "./store.js";

/**
 * What a load could not carry forward, and how many things that was.
 *
 * Deliberately not a sentence. Wording is the view's, and putting a string here
 * would mean this package deciding how an apology reads and in what language.
 */
export interface MigrationNotice {
  count: number;
  entries: readonly QuarantinedEntry[];
  /** The build the run was played on, which is what the notice is about. */
  playedOn: string;
  /** The build now shipped. */
  now: string;
}

/**
 * How a boon was taken, for the rare case where the caller knows.
 *
 * Both default rather than being required, because the common gesture is a tap
 * that means "I have this" and demanding a rarity would put a dialog in front
 * of the one interaction that has to stay instant.
 */
export interface MarkOptions {
  rarity?: Rarity;
  level?: number;
}

/**
 * What a correction says about the pool.
 *
 * Unset, the pool is worked out: a god stays where anything else still holds
 * them there. `fromPool` is the one control that names the pool in its own
 * label saying so outright, which no inference may then talk it out of.
 */
export interface RemoveOptions {
  fromPool?: boolean;
}

/**
 * Which writer made the last edit, named after the writer itself so that
 * nothing here has to invent a second vocabulary for the same fifteen gestures.
 */
export type EditAction =
  | "mark"
  | "remove"
  | "purge"
  | "addGod"
  | "equipWeapon"
  | "equipAspect"
  | "equipKeepsake"
  | "answerMirrorRow"
  | "answerTalent"
  | "setElement"
  | "setResource"
  | "pin"
  | "unpin"
  | "plan"
  | "unplan"
  | "setNote"
  | "acceptMigration";

/**
 * The last thing that happened, in enough detail for a view to word an offer to
 * undo it and no more.
 *
 * Deliberately not a sentence, for the same reason the migration notice is not
 * one: a string here would be this package deciding how "Marked Storm Lightning
 * — Undo" reads and in what language. `subject` is whatever the gesture named —
 * a trait, a god, a Mirror row, an element — or null where it named nothing,
 * which is what unequipping looks like.
 */
export interface UndoableEdit {
  action: EditAction;
  subject: string | null;
}

/**
 * What the source has to say about itself, as against about the run.
 *
 * Each of these was a getter and nothing else, which made every one of them
 * unobservable: `storageError` is assigned inside a chained write with no user
 * gesture behind it, and accepting a migration notice moves no fact, so a view
 * showing either would have gone on showing the old answer forever. The port
 * carries facts and the second subscription carries intent; this is the third
 * thing, and it is the one a view spends most of its chrome on.
 *
 * One object replaced whole rather than five getters, so a consumer can hold it
 * and compare identity the way it already does with the facts.
 */
export interface SourceCondition {
  /** What the load could not carry forward, until the user accepts it. */
  readonly migrationNotice: MigrationNotice | null;
  /** Why a stored run was set aside, when one was. */
  readonly unreadableRun: Error | null;
  /** The last write that did not get through, cleared by one that does. */
  readonly storageError: Error | null;
  /** Everything set aside across every load of this run. */
  readonly quarantine: readonly QuarantinedEntry[];
  /** What `undo()` would take back, or null when there is nothing. */
  readonly lastEdit: UndoableEdit | null;
}

/**
 * Manual entry: the whole product, and the only source in v1.
 *
 * Everything is a user tap, so this is also the only place that maintains the
 * bookkeeping the engine deliberately does not. Evaluation reads facts exactly
 * as given — it will not infer that holding a boon of Hera puts Hera in the
 * pool, and it will not notice that a second Attack boon replaced the first.
 * Both of those are real facts about a run, and both are written here.
 */
export interface ManualSource extends RunStateSource {
  /** Facts and intent together. Views that only evaluate want `getFacts()`. */
  getState(): RunState;

  /**
   * Called when pins, plans or notes change. A second subscription rather than
   * a widening of the port: the port is facts-only *because* of the provenance
   * split, so intent cannot arrive through it, and a Goals view watching pins
   * had no way to hear about one.
   *
   * The facts subscription no longer fires for these. It used to, with the same
   * facts object it had already handed out — a wake-up carrying no news, which
   * cost every memoized consumer a miss and told the one listener that cared
   * nothing at all.
   */
  subscribeIntent(cb: (intent: RunIntent) => void): Unsub;

  /** The five things above, together, replaced whole whenever one moves. */
  getCondition(): SourceCondition;

  /** Called when it does. */
  subscribeCondition(cb: (condition: SourceCondition) => void): Unsub;

  /** Everything a load set aside, still recoverable. */
  readonly quarantine: readonly QuarantinedEntry[];

  /**
   * Set once by a load that could not match everything, and cleared by
   * `acceptMigration`. Null on an ordinary load.
   */
  readonly migrationNotice: MigrationNotice | null;

  /**
   * The user's "carry on anyway": clears the notice and stamps the run with the
   * shipped build, so the next load stops re-checking ids that are not coming
   * back. The quarantined entries stay where they are.
   */
  acceptMigration(): void;

  /**
   * Why the stored run could not be decoded, when it could not be. The run was
   * set aside rather than deleted and a fresh one took its place, so this is
   * the difference between a player being told their save was unreadable and a
   * player finding an empty run with no explanation. Null on an ordinary load.
   */
  readonly unreadableRun: Error | null;

  /**
   * The fields the user was holding by hand when this run was last stored,
   * brought forward by the same pass that brings the run forward and otherwise
   * handed back exactly as they went in.
   *
   * Nothing here reads one or knows what one means. They live in this record
   * because the record is where a run's storage is, and because one writer to
   * it is the only arrangement in which two halves of the same run cannot
   * overwrite each other.
   */
  readonly overrides: readonly FactOverride[];

  /** Stores the overrides now in force. Called by whoever owns the overlay. */
  putOverrides(overrides: readonly FactOverride[]): void;

  /**
   * The last edit, or null when there is nothing to take back — before the
   * first tap, after an undo, and after a run has ended.
   */
  readonly lastEdit: UndoableEdit | null;

  /**
   * Takes back the last edit, whether it wrote facts or intent. Does nothing
   * when there is none, and is not itself undoable: one level is the whole
   * offer, and a redo built on top of it would be the ordered history this
   * deliberately is not.
   */
  undo(): void;

  /** Marks a boon held, with everything that implies. */
  mark(trait: TraitId, options?: MarkOptions): void;

  /**
   * A mis-tap: the boon was never taken. The pool is worked out rather than
   * dictated — see the implementation for the four rules that leave a god in it
   * with no boon to show for it.
   *
   * `fromPool` makes it a dictation instead, for the one control that names the
   * pool in its own label. A player choosing that knows what the run did before.
   */
  remove(trait: TraitId, options?: RemoveOptions): void;

  /** The boon was taken and then lost in game. */
  purge(trait: TraitId): void;

  /** Records a god as having given this run a reward, without naming a boon. */
  addGod(god: GodId): void;

  equipWeapon(weapon: string | null): void;
  equipAspect(aspect: AspectId | null): void;
  equipKeepsake(keepsake: KeepsakeId | null): void;

  /** Answers one Mirror row: a member, or `null` for "none selected". */
  answerMirrorRow(row: string, selected: TalentId | null): void;

  /**
   * Answers one talent on its own: selected, not selected, or `null` to put it
   * back to nobody having been asked.
   *
   * The same question as `answerMirrorRow` reaching the same map, differing in
   * which set it checks the id against — and that is the whole of why it
   * exists. The row form checks `catalog.mirrorRows`, which no shipped catalog
   * populates, so it throws on every call; this checks `catalog.talents`, which
   * carries every talent some requirement gates on. The two collect the same
   * answer because the only row member outside that set is read by no
   * requirement, so never writing its key is invisible to evaluation.
   *
   * Rows remain the better surface where they exist — they match the Mirror's
   * own presentation and make "both members selected" unrepresentable — so this
   * is the way to ask while they do not, not a replacement for asking properly.
   */
  answerTalent(talent: TalentId, selection: TalentSelection | null): void;

  setElement(element: Element, count: number): void;
  setResource(resource: ResourceId, amount: number): void;

  pin(trait: TraitId): void;
  unpin(trait: TraitId): void;
  plan(trait: TraitId): void;
  unplan(trait: TraitId): void;
  setNote(trait: TraitId, text: string): void;

  /**
   * Ends the run: the current one becomes the previous one and a fresh run
   * starts. Two records is the whole of what is kept.
   */
  finishRun(): Promise<void>;

  /**
   * Throws the run away and starts a fresh one, **filing nothing** — which is
   * the difference from `finishRun` and the reason a caller has to mean it. A
   * run somebody abandoned is not one they finished, so it does not go in front
   * of the run they meant to keep.
   */
  clearRun(): Promise<void>;

  /**
   * The last storage failure, or null. A view showing this is the difference
   * between a run that is not being saved and a run that looks fine.
   */
  readonly storageError: Error | null;

  /**
   * Resolves once every edit made so far has reached the store, and rejects
   * with the last failure if one did not.
   */
  flush(): Promise<void>;
}

export interface OpenManualSourceOptions {
  game: GameId;
  /** Defaults to the shipped snapshot for the game. */
  catalog?: SyncCatalog;
  /** Defaults to a store that does not outlive the process. */
  store?: RunStore;
}

/**
 * Loads the active run, brings it forward to the shipped catalog, and hands
 * back a source over it.
 *
 * Nothing evaluates in here and nothing may: the whole point of running the
 * migration before the source exists is that no run with an unidentifiable id
 * in it is ever reachable through the port.
 */
export async function openManualSource(
  options: OpenManualSourceOptions,
): Promise<ManualSource> {
  const { game } = options;
  const catalog = options.catalog ?? shippedCatalog(game);
  const store = options.store ?? createMemoryStore();

  const loaded = await store.load(game, "active");
  const fresh = (): StoredRun => ({
    state: emptyRun(game, catalog.dataVersion),
    quarantine: [],
  });

  let stored: StoredRun;
  let unreadable: Error | null = null;
  if (loaded === null) {
    stored = fresh();
  } else {
    try {
      stored = fromPersisted(loaded);
    } catch (cause) {
      /**
       * Refusing to read the record is right. Refusing to start is not.
       *
       * Nothing clears the record, so a decoder that throws on the way in
       * throws again on every load after it, for as long as it exists — and
       * the player's only way out is clearing site data, which takes both runs
       * with it. So the record is set aside and a fresh run starts over the
       * top, which is the same bargain the id-level quarantine makes: keep
       * what cannot be understood, and let the rest of the product work.
       *
       * Set aside *first*. Starting fresh over a record that could not be
       * copied would be this build deleting the only version of a run on the
       * strength of not being able to read it, so a failure here fails the
       * load rather than being absorbed.
       */
      await store.save(game, "unreadable", loaded);
      unreadable = cause instanceof Error ? cause : new Error(String(cause));
      stored = fresh();
    }
  }

  const outcome = migrate(stored.state, catalog);
  /**
   * The overlay is scanned with the run, and it has to be: the merge lays it
   * back over the facts *after* the pass that cleaned them, so an override left
   * naming a renamed trait would put that id straight back into what
   * evaluation reads — past the one pass whose job is that no such id ever
   * reaches it.
   */
  const overlay = scanOverrides(stored.overrides ?? [], catalog);
  const setAside = [...outcome.quarantine, ...overlay.quarantine];
  const quarantine = [...stored.quarantine, ...setAside];

  /**
   * What is still owed carries across loads, because it cannot be re-derived.
   *
   * The pass that raises a notice is also the pass that removes the ids it is
   * about, so by the next load there is nothing left to notice — which is why
   * the owing has to be stored rather than recomputed, and why holding the
   * build stamp back instead did not work. Entries accumulate: two updates
   * before anyone acknowledges either is one notice about both, and `playedOn`
   * stays the build the run was on when the first of them turned up.
   */
  const carried = stored.pendingNotice ?? null;
  const owed = [...(carried?.entries ?? []), ...setAside];
  const pendingNotice: PersistedNotice | null =
    owed.length === 0
      ? null
      : { playedOn: carried?.playedOn ?? stored.state.facts.dataVersion, entries: owed };

  const source = createSource({
    catalog,
    store,
    state: outcome.state,
    quarantine,
    pendingNotice,
    rewardedWithoutBoon: stored.rewardedWithoutBoon ?? new Set(),
    overrides: overlay.overrides,
    unreadableRun: unreadable,
  });

  /**
   * A load that changed something writes it back before handing the source over.
   *
   * Without this the migration only ever reached storage on the back of the
   * user's next tap — which meant the stripped run was persisted while the
   * *reason* it was stripped was not, so the following load found a clean run
   * and re-stamped it with nobody having been told. Skipped when the load
   * changed nothing, so an ordinary start still costs no write.
   */
  const changed =
    setAside.length > 0 ||
    unreadable !== null ||
    outcome.state.facts.dataVersion !== stored.state.facts.dataVersion;
  if (changed) source.persistNow();

  return source;
}

interface SourceSeed {
  catalog: SyncCatalog;
  store: RunStore;
  state: RunState;
  quarantine: readonly QuarantinedEntry[];
  pendingNotice: PersistedNotice | null;
  rewardedWithoutBoon: ReadonlySet<GodId>;
  overrides: readonly FactOverride[];
  unreadableRun: Error | null;
}

function createSource(seed: SourceSeed): ManualSource & { persistNow(): void } {
  const { catalog, store, unreadableRun } = seed;
  let state = seed.state;
  let quarantine = seed.quarantine;
  let pending = seed.pendingNotice;
  let overrides = seed.overrides;
  let notice: MigrationNotice | null =
    pending === null
      ? null
      : {
          count: pending.entries.length,
          entries: pending.entries,
          playedOn: pending.playedOn,
          now: catalog.dataVersion,
        };
  /**
   * Gods the pool holds for a reason other than a boon currently in `held`.
   *
   * Written by the three rules that deliberately leave a god behind — recording
   * one directly, purging their boon, and displacing it with another — and read
   * only by the correction, which is the one removal entitled to take a god out
   * of the pool. Kept here rather than in `RunFacts` because it is bookkeeping
   * about how the pool was built, not a fact about the run, and nothing in the
   * engine has any business reading it.
   *
   * Replaced rather than added to, the way the facts collections are. Undo puts
   * back a state that was captured before an edit, and a set captured by
   * reference and then written into is not the set that was captured — it is
   * the current one wearing an old name, so the undo would restore facts from
   * before the edit beside provenance from after it.
   */
  let rewardedWithoutBoon: ReadonlySet<GodId> = seed.rewardedWithoutBoon;
  const listeners = new Set<(facts: RunFacts) => void>();
  const intentListeners = new Set<(intent: RunIntent) => void>();
  const conditionListeners = new Set<(condition: SourceCondition) => void>();

  /**
   * Writes are chained rather than fired off independently.
   *
   * Two saves of the same record started together can land in either order, and
   * the loser is a run one edit out of date that nothing will ever correct.
   * Chaining costs a tap nothing — the promise is never awaited by the caller —
   * and makes the last edit the last write.
   *
   * The chain must survive a failure, which is the part that is easy to get
   * wrong and impossible to notice. A rejected promise skips every `then` after
   * it, so chaining the naive way means one failed write — a quota prompt, a
   * private window, a database the browser took away — silently ends
   * persistence for the life of the page: edits keep being accepted, the screen
   * keeps looking right, and the run is gone at the next reload. So each link
   * absorbs its own failure and records it instead of poisoning the chain.
   *
   * Recorded rather than thrown, because the caller is a tap. Nobody awaits
   * `mark`, so a throw here would surface as an unhandled rejection and be seen
   * by no one; `storageError` is a fact about the run a view can show, and it
   * clears the moment a write gets through.
   */
  let writes: Promise<void> = Promise.resolve();
  let storageError: Error | null = null;

  /**
   * The snapshot is taken when the write runs, not when the tap happened.
   *
   * Taken at the tap it was a copy of a run that had since moved on, and the
   * one place that mattered was the run boundary. `finishRun` writes both
   * records and only then empties memory, so a tap made while those writes are
   * in flight used to capture the *finished* run and then land after them —
   * putting the run that just ended back into the `active` record, where the
   * next load reads it as the run in progress. Ending a run and having it
   * un-end is a strange enough thing to see that it is worth the ordering being
   * obvious rather than clever.
   *
   * Snapshotting late is also simply cheaper: a burst of taps chains a burst of
   * writes, and every one of them now stores the same final run instead of a
   * succession of states that overwrite each other anyway.
   *
   * The one write that must snapshot early is `finishRun`'s own, which has to
   * store the run as it was before it cleared it. That one still does.
   */
  function persist(): void {
    writes = writes.then(async () => {
      const snapshot = toPersisted({
        state,
        quarantine,
        pendingNotice: pending,
        rewardedWithoutBoon,
        overrides,
      });
      try {
        await store.save(catalog.game, "active", snapshot);
        storageError = null;
      } catch (cause) {
        storageError = cause instanceof Error ? cause : new Error(String(cause));
      }
      // Nobody awaited the tap that caused this, so this is the only way the
      // difference between a run that is saving and one that is not reaches a
      // screen.
      refreshCondition();
    });
  }

  /**
   * Publishes an edit — unless the edit turns out not to be one.
   *
   * Every edit lands as a whole new facts object, with the collections it did
   * not touch shared rather than copied. Consumers can then tell "something
   * changed" from object identity, which is what makes memoizing evaluation on
   * the facts sound; mutating in place would leave every cache holding a stale
   * answer that still looks current.
   *
   * Which is exactly why identity cannot answer "did anything move". Every
   * writer builds new objects, so `unpin` on a trait nobody pinned produces a
   * distinct run saying precisely what the old one said. Asked by value here
   * rather than by four early returns in the four writers that lacked one, so
   * that a writer added later gets the answer without having to remember it.
   * A no-op costs a walk of a few dozen entries; publishing one costs every
   * consumer a re-derive of a game's worth of nodes and, worse, spends the one
   * level of undo on a gesture that changed nothing, which puts the user's real
   * last edit out of reach.
   *
   * `alsoMoved` is for the writer that moves something no fact records — the
   * migration notice — where the facts cannot say whether anything happened.
   *
   * Facts and intent are announced separately because they are separate
   * subscriptions: a pin is invisible through the port by construction, and
   * waking every facts listener for one is a miss for all of them and news for
   * none.
   */
  function commit(facts: RunFacts, intent = state.intent, alsoMoved = false): void {
    const factsMoved = !sameFacts(facts, state.facts);
    const intentMoved = !sameIntent(intent, state.intent);
    if (!factsMoved && !intentMoved && !alsoMoved) {
      // The undo level goes back to whoever held it before this writer took it.
      undoable = previousEdit;
      return;
    }
    refreshCondition();

    // The unmoved half keeps its object, so a run that changed only its intent
    // hands back the facts a memo is already holding an answer for.
    state = {
      facts: factsMoved ? facts : state.facts,
      intent: intentMoved ? intent : state.intent,
    };
    persist();
    if (factsMoved) for (const listener of listeners) listener(state.facts);
    if (intentMoved) for (const listener of intentListeners) listener(state.intent);
  }

  /**
   * Everything an edit can move, held by reference.
   *
   * Undo is a restore rather than an inverse operation, and that is the whole
   * design. Marking a boon is not one write: it holds the trait, fills a slot,
   * pools a god and can displace whatever was in that slot, which itself leaves
   * a god standing in the pool with nothing to show for it. An inverse built
   * per writer would have to know all four, and the one it would forget is the
   * displaced boon — the case with no visible symptom until a requirement that
   * named it quietly stops being met. A snapshot cannot forget a field.
   *
   * Cheap because every one of these is replaced rather than written into, so
   * capturing the lot is five references and restoring them is five
   * assignments. It also restores *identity*, which means a consumer memoizing
   * on the facts object finds the entry it had before the edit still warm.
   */
  interface Snapshot {
    edit: UndoableEdit;
    state: RunState;
    quarantine: readonly QuarantinedEntry[];
    pending: PersistedNotice | null;
    notice: MigrationNotice | null;
    rewardedWithoutBoon: ReadonlySet<GodId>;
  }

  let undoable: Snapshot | null = null;
  /**
   * What `undoable` held before the writer now running captured its own, so
   * that a writer which turns out to have moved nothing can put it back.
   */
  let previousEdit: Snapshot | null = null;

  let condition: SourceCondition = {
    migrationNotice: notice,
    unreadableRun,
    storageError,
    quarantine,
    lastEdit: null,
  };

  /**
   * Rebuilds the condition if any of its five parts moved, and says so.
   *
   * Identity is enough to compare them: every one is replaced whole rather than
   * written into, so a new object is the only way any of them changes. Called
   * from everywhere that could move one, which is cheap precisely because it
   * checks — the alternative is remembering which of eleven call sites moves
   * which field.
   */
  function refreshCondition(): void {
    const lastEdit = undoable === null ? null : undoable.edit;
    if (
      condition.migrationNotice === notice &&
      condition.storageError === storageError &&
      condition.quarantine === quarantine &&
      condition.lastEdit === lastEdit
    ) {
      return;
    }
    condition = { migrationNotice: notice, unreadableRun, storageError, quarantine, lastEdit };
    for (const listener of conditionListeners) listener(condition);
  }

  /**
   * Captures the state one edit is about to change.
   *
   * Called after a writer's guards and before its first write, which is the
   * only placement that works: earlier and a refused write would leave an undo
   * offering to take back something that never happened, later and there is
   * nothing left to capture.
   *
   * The overlay is deliberately not captured. Taking a field in hand and
   * handing it back are already each other's inverse and each visible on the
   * field itself, so an undo that also rewound them would be taking back a
   * gesture the user can see they made, on the strength of a different one.
   */
  function beginEdit(action: EditAction, subject: string | null): void {
    previousEdit = undoable;
    undoable = {
      edit: { action, subject },
      state,
      quarantine,
      pending,
      notice,
      rewardedWithoutBoon,
    };
  }

  function record(trait: TraitId) {
    const found = Object.hasOwn(catalog.traits, trait) ? catalog.traits[trait] : undefined;
    if (found === undefined) {
      throw new Error(`no trait "${trait}" in the ${catalog.game} catalog`);
    }
    return found;
  }

  /**
   * Whether any held trait still belongs to this god. Asked after a mis-tap
   * correction, which is the one removal that takes a god back out of the pool.
   */
  function stillHoldsBoonOf(held: RunFacts["held"], god: GodId): boolean {
    for (const trait of held.keys()) {
      const found = Object.hasOwn(catalog.traits, trait) ? catalog.traits[trait] : undefined;
      if (found?.god === god) return true;
    }
    return false;
  }

  /**
   * Any god the loaded pool holds without a held boon to account for them is
   * standing on their own, whatever put them there.
   *
   * The migration is the case that needs this and cannot be handled at the
   * write: it removes a held boon and deliberately keeps its god, but the
   * record it removed is exactly the one the catalog can no longer identify,
   * so there is nothing left to ask which god it belonged to. Reading the pool
   * itself asks the question the other way round and gets a complete answer —
   * and doubles as a repair for any run stored before this was recorded.
   */
  const standing = new Set(rewardedWithoutBoon);
  for (const god of state.facts.godPool) {
    if (!stillHoldsBoonOf(state.facts.held, god)) standing.add(god);
  }
  rewardedWithoutBoon = standing;

  /** Removes a trait from `held` and empties whatever slot it was sitting in. */
  function drop(trait: TraitId): { held: RunFacts["held"]; slots: RunFacts["slots"] } {
    const held = new Map(state.facts.held);
    held.delete(trait);
    const slots = new Map(state.facts.slots);
    for (const [slot, occupant] of slots) if (occupant === trait) slots.set(slot, null);
    return { held, slots };
  }

  return {
    /**
     * Always connected. There is no transport to lose — the source of these
     * facts is the person holding the phone.
     */
    get status() {
      return "connected" as const;
    },

    get capabilities() {
      return { canWrite: true };
    },

    get quarantine() {
      return quarantine;
    },

    get migrationNotice() {
      return notice;
    },

    get unreadableRun() {
      return unreadableRun;
    },

    getFacts(): RunFacts {
      return state.facts;
    },

    getState(): RunState {
      return state;
    },

    subscribe(cb: (facts: RunFacts) => void): Unsub {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },

    subscribeIntent(cb: (intent: RunIntent) => void): Unsub {
      intentListeners.add(cb);
      return () => {
        intentListeners.delete(cb);
      };
    },

    getCondition(): SourceCondition {
      return condition;
    },

    subscribeCondition(cb: (next: SourceCondition) => void): Unsub {
      conditionListeners.add(cb);
      return () => {
        conditionListeners.delete(cb);
      };
    },

    /**
     * Clearing the notice is what makes it stop being owed, and that fact is
     * persisted here. It used to be inferred from the build stamp, which could
     * not work: the stamp advances on its own once the offending ids are gone,
     * so the notice went with it whether or not anybody had read it.
     */
    acceptMigration(): void {
      // Nothing owed and the stamp already current: no field moves, so there is
      // nothing to write, nothing to notify and nothing to offer to take back.
      // Left ungated this was the expensive kind of no-op — it handed every
      // consumer a fresh facts object saying exactly what the old one said, so
      // each of them re-derived a whole game's worth of state for nothing, and
      // it replaced the offer to undo the user's last real edit with an offer
      // to undo a gesture that changed nothing.
      if (notice === null && pending === null && state.facts.dataVersion === catalog.dataVersion) {
        return;
      }
      beginEdit("acceptMigration", null);
      notice = null;
      pending = null;
      // The stamp may already be current — a clean load after an unacknowledged
      // one advances it while the owing rides along — so the facts alone can
      // say nothing moved while the thing this writer exists for just did.
      commit({ ...state.facts, dataVersion: catalog.dataVersion }, state.intent, true);
    },

    persistNow(): void {
      persist();
    },

    get overrides() {
      return overrides;
    },

    /**
     * Stored and handed back, never interpreted. The overlay belongs to
     * whatever is laying it over this source; what belongs here is the one
     * writer to the record, since two halves of a run saving themselves
     * separately is how one of them gets lost.
     */
    putOverrides(next: readonly FactOverride[]): void {
      overrides = [...next];
      persist();
    },

    get lastEdit() {
      return undoable === null ? null : undoable.edit;
    },

    /**
     * Puts back everything the last edit moved — the facts, the intent, and the
     * bookkeeping beside them that no fact records.
     *
     * That last part is the half an undo written against the facts alone gets
     * wrong. A purge and a displacement both leave a god in the pool on the
     * strength of a reward that really was taken, and that reason lives outside
     * `RunFacts`; rewinding the facts without it would leave the god pooled
     * with the rule that explains them switched off, so the next unrelated
     * correction anywhere in the run would delete them.
     */
    undo(): void {
      if (undoable === null) return;
      const back = undoable;
      undoable = null;
      // Nothing left for a no-op commit to hand back: an undo is not itself
      // undoable, so there is no earlier offer waiting behind this one.
      previousEdit = null;

      quarantine = back.quarantine;
      pending = back.pending;
      notice = back.notice;
      rewardedWithoutBoon = back.rewardedWithoutBoon;
      // Always a move: an offer to take something back only exists because a
      // writer moved something, and for two of them — the accepted notice, a
      // god recorded into a pool already holding them — what moved is the
      // bookkeeping above rather than any fact.
      commit(back.state.facts, back.state.intent, true);
    },

    /**
     * Marking a boon held is three writes, not one.
     *
     * The boon itself, the god it came from, and — if it occupies a slot — the
     * boon it just displaced. A second Attack boon is not refused and does not
     * stack: it replaces what was there, and the replaced boon leaves the run
     * entirely, so it stops counting toward every requirement that named it.
     * The displaced boon's god *stays* in the pool, which is the same asymmetry
     * that separates a purge from a correction: the reward really was taken
     * from that god, and no amount of losing the boon afterwards undoes it.
     */
    mark(trait: TraitId, options: MarkOptions = {}): void {
      const found = record(trait);

      /**
       * A weapon form is equipped, never held. Recording one as a held trait is
       * the mistake that leaves every aspect conflict in the run inert, and it
       * is invisible when made — the run looks right and quietly stops
       * answering one of the two questions aspects exist for. Only Hades II
       * marks its forms, so this catches that game's half today and the other
       * game's as soon as the extraction marks them too.
       */
      if (found.slot === "Aspect") {
        throw new Error(`"${trait}" is a weapon form; equip it with equipAspect`);
      }
      beginEdit("mark", trait);

      const displaced = found.slot === null ? undefined : state.facts.slots.get(found.slot);

      const held = new Map(state.facts.held);
      if (displaced !== undefined && displaced !== null && displaced !== trait) {
        held.delete(displaced);
        // The displaced boon's god stays in the pool, so the pool now holds them
        // for a reason `held` no longer shows. Recorded, or the next correction
        // anywhere else in the run would take them back out.
        const gone = Object.hasOwn(catalog.traits, displaced)
          ? catalog.traits[displaced]?.god
          : undefined;
        if (gone != null) rewardedWithoutBoon = new Set(rewardedWithoutBoon).add(gone);
      }
      held.set(trait, {
        rarity: options.rarity ?? found.rarity[0] ?? "Common",
        level: options.level ?? 1,
      });

      const slots = new Map(state.facts.slots);
      if (found.slot !== null) slots.set(found.slot, trait);

      const godPool = new Set(state.facts.godPool);
      /**
       * No filtering by whether the god holds a pool slot. A Hermes boon really
       * was a reward taken from Hermes and the pool says so; the cap is counted
       * over the slot-taking part of the pool by the side that has the catalog
       * to say which those are. Filtering here would throw away a true fact to
       * protect an arithmetic that belongs to somebody else.
       */
      if (found.god !== null) godPool.add(found.god);

      commit({ ...state.facts, held, slots, godPool });
    },

    /**
     * A correction. The reward was never taken, so the god goes back out of the
     * pool if this was the only thing holding them there.
     *
     * "The only thing" is the whole difficulty, and `held` alone cannot answer
     * it. Three other rules deliberately leave a god in the pool with no boon to
     * show for it — recorded directly, purged, or displaced — and each of those
     * is a reward that really was taken. Asking `held` treats all three as
     * though they never happened, so correcting an unrelated mis-tap quietly
     * deleted them; the run then under-reports the pool, which reads as a god
     * nobody has met.
     */
    remove(trait: TraitId, options?: RemoveOptions): void {
      if (!state.facts.held.has(trait)) return;
      beginEdit("remove", trait);
      const found = Object.hasOwn(catalog.traits, trait) ? catalog.traits[trait] : undefined;
      const { held, slots } = drop(trait);

      const godPool = new Set(state.facts.godPool);
      const god = found?.god ?? null;
      // Asked for by name, the god goes whatever the run did before: the guard
      // below is an inference and this is an instruction. The standing reward
      // goes with them, or re-marking and correcting hits the same wall again.
      if (god !== null && options?.fromPool === true) {
        godPool.delete(god);
        if (rewardedWithoutBoon.has(god)) {
          const standing = new Set(rewardedWithoutBoon);
          standing.delete(god);
          rewardedWithoutBoon = standing;
        }
      } else if (god !== null && !stillHoldsBoonOf(held, god) && !rewardedWithoutBoon.has(god)) {
        godPool.delete(god);
      }

      commit({ ...state.facts, held, slots, godPool });
    },

    /**
     * The boon was taken and is gone. The pool is untouched: the game's own
     * record of which gods have given this run a reward is not rewritten when
     * one of those rewards is lost, and a purge therefore never frees a slot.
     */
    purge(trait: TraitId): void {
      if (!state.facts.held.has(trait)) return;
      beginEdit("purge", trait);
      const found = Object.hasOwn(catalog.traits, trait) ? catalog.traits[trait] : undefined;
      if (found?.god != null) rewardedWithoutBoon = new Set(rewardedWithoutBoon).add(found.god);
      const { held, slots } = drop(trait);
      commit({ ...state.facts, held, slots });
    },

    /**
     * For a god who gave a reward that is not a held boon — one forced in by a
     * keepsake, or offered and declined.
     *
     * Checked against the god table's keys, which is the only defence against
     * the mistake a god picker makes by default: the record inside each entry
     * carries a loot table id, building a pool out of those produces a pool
     * that matches no requirement and no member list, and nothing downstream
     * can tell that from a run that simply has not met anyone yet.
     */
    addGod(god: GodId): void {
      if (!catalog.gods.has(god)) {
        throw new Error(
          `"${god}" is not a god in the ${catalog.game} catalog; ` +
            "gods are addressed by the bare name, not by their loot table id",
        );
      }
      // Nothing in `held` will ever account for this one, so it is recorded as
      // standing on its own — otherwise the next correction removes it.
      const known = rewardedWithoutBoon.has(god);
      const pooled = state.facts.godPool.has(god);
      // Already there and already accounted for, so nothing moves.
      if (known && pooled) return;

      beginEdit("addGod", god);
      rewardedWithoutBoon = new Set(rewardedWithoutBoon).add(god);
      if (pooled) {
        persist();
        // No fact moved — the pool already named them — but the run now knows
        // why they are in it, and that is an edit to take back.
        refreshCondition();
        return;
      }
      commit({ ...state.facts, godPool: new Set(state.facts.godPool).add(god) });
    },

    /** Unchecked: the catalog ships no weapon table to check against. */
    equipWeapon(weapon: string | null): void {
      beginEdit("equipWeapon", weapon);
      const equipped = { ...state.facts.equipped };
      if (weapon === null) delete equipped.weapon;
      else equipped.weapon = weapon;
      commit({ ...state.facts, equipped });
    },

    /**
     * The equipped weapon form, and the only way one is ever recorded.
     *
     * Checked against the trait table because that is where a form lives in
     * both games — Hades II gives it a record of its own, and in Hades I a form
     * simply is an ordinary trait record.
     *
     * A boon is refused here for the same reason a form is refused by `mark`:
     * they are the two halves of one rule, and a boon written into this field
     * would sit where aspect conflicts are read from and match none of them —
     * wrong in the direction that produces no error and no verdict, just a
     * weapon form the run does not have. Only asked where the catalog says
     * which records are forms, since a catalog that marks none cannot tell a
     * form from a boon and neither can this.
     */
    equipAspect(aspect: AspectId | null): void {
      if (aspect !== null) {
        const found = record(aspect);
        if (catalog.slots.has("Aspect") && found.slot !== "Aspect") {
          throw new Error(`"${aspect}" is not a weapon form; a boon is recorded with mark`);
        }
      }
      beginEdit("equipAspect", aspect);
      const equipped = { ...state.facts.equipped };
      if (aspect === null) delete equipped.aspect;
      else equipped.aspect = aspect;
      commit({ ...state.facts, equipped });
    },

    equipKeepsake(keepsake: KeepsakeId | null): void {
      if (keepsake !== null && !catalog.keepsakes.has(keepsake)) {
        throw new Error(`no keepsake "${keepsake}" in the ${catalog.game} catalog`);
      }
      beginEdit("equipKeepsake", keepsake);
      const equipped = { ...state.facts.equipped };
      if (keepsake === null) delete equipped.keepsake;
      else equipped.keepsake = keepsake;
      commit({ ...state.facts, equipped });
    },

    /**
     * Writes *both* members of the row, always.
     *
     * A row resolves to one member or to none, and the answer holds for the
     * whole run, so the member that was not chosen is a definite no rather than
     * an open question. Writing only the chosen one would leave its partner
     * looking uncollected, which is merely imprecise. The opposite mistake is
     * the dangerous one — a "not selected" written for a row nobody was asked
     * about makes every trait that row gates impossible for the entire run —
     * which is why the answer comes from a question with three options and why
     * this method takes a row rather than a talent.
     */
    answerMirrorRow(row: string, selected: TalentId | null): void {
      const found = catalog.mirrorRows.find((candidate) => candidate.id === row);
      if (found === undefined) {
        throw new Error(`no Mirror row "${row}" in the ${catalog.game} catalog`);
      }
      if (selected !== null && !found.members.includes(selected)) {
        throw new Error(`"${selected}" is not a member of Mirror row "${row}"`);
      }
      beginEdit("answerMirrorRow", row);

      const talents = new Map(state.facts.equipped.talents ?? []);
      for (const member of found.members) {
        talents.set(member, member === selected ? "selected" : "notSelected");
      }
      commit({ ...state.facts, equipped: { ...state.facts.equipped, talents } });
    },

    /**
     * One talent at a time, which is what can actually be asked today.
     *
     * `null` puts the key back to absent rather than writing a definite no, and
     * the two have to stay tellable apart: absent is "nobody asked" and reads
     * as an open question, while `"notSelected"` is an answer that makes every
     * trait the talent gates impossible for the run.
     *
     * Which is why a map emptied by un-answering is deleted rather than left
     * empty. An empty map is the run-wide "asked, and none is selected", so
     * leaving one behind would turn a user taking back their last answer into
     * the strongest possible statement — the mistake the three-state shape
     * exists to prevent, arriving from the one direction that looks like
     * tidying up.
     */
    answerTalent(talent: TalentId, selection: TalentSelection | null): void {
      if (!catalog.talents.has(talent)) {
        throw new Error(`no talent "${talent}" in the ${catalog.game} catalog`);
      }
      beginEdit("answerTalent", talent);

      const talents = new Map(state.facts.equipped.talents ?? []);
      if (selection === null) talents.delete(talent);
      else talents.set(talent, selection);

      const equipped = { ...state.facts.equipped };
      if (talents.size === 0) delete equipped.talents;
      else equipped.talents = talents;
      commit({ ...state.facts, equipped });
    },

    setElement(element: Element, count: number): void {
      beginEdit("setElement", element);
      const elements = new Map(state.facts.elements);
      if (count === 0) elements.delete(element);
      else elements.set(element, count);
      commit({ ...state.facts, elements });
    },

    setResource(resource: ResourceId, amount: number): void {
      beginEdit("setResource", resource);
      const resources = new Map(state.facts.resources);
      if (amount === 0) resources.delete(resource);
      else resources.set(resource, amount);
      commit({ ...state.facts, resources });
    },

    pin(trait: TraitId): void {
      record(trait);
      beginEdit("pin", trait);
      commit(state.facts, { ...state.intent, pins: new Set(state.intent.pins).add(trait) });
    },

    unpin(trait: TraitId): void {
      beginEdit("unpin", trait);
      const pins = new Set(state.intent.pins);
      pins.delete(trait);
      commit(state.facts, { ...state.intent, pins });
    },

    plan(trait: TraitId): void {
      record(trait);
      beginEdit("plan", trait);
      commit(state.facts, { ...state.intent, planned: new Set(state.intent.planned).add(trait) });
    },

    unplan(trait: TraitId): void {
      beginEdit("unplan", trait);
      const planned = new Set(state.intent.planned);
      planned.delete(trait);
      commit(state.facts, { ...state.intent, planned });
    },

    /**
     * Checked on the way in, the way a pin and a plan are. A note is the only
     * thing in a run the player wrote themselves, so it is the worst one to
     * attach to an id the catalog cannot name: the next game update quarantines
     * it, and what is quarantined is the text.
     *
     * Clearing asks nothing. Removing a note about a trait that has gone is
     * exactly what somebody tidying up would want to do, and refusing it would
     * leave the entry with no way out.
     */
    setNote(trait: TraitId, text: string): void {
      // Checked before the edit is captured rather than inside the branch
      // below, so that a refused note leaves nothing to offer to take back.
      if (text !== "") record(trait);
      beginEdit("setNote", trait);
      const notes = new Map(state.intent.notes);
      if (text === "") {
        notes.delete(trait);
      } else {
        notes.set(trait, text);
      }
      commit(state.facts, { ...state.intent, notes });
    },

    /**
     * The finished run moves into the second record and a fresh one takes its
     * place. Quarantine does not travel into the fresh run: those entries
     * belong to the run they came out of, which is where they are written, and
     * carrying them forward would produce a notice about ids the new run never
     * held.
     *
     * Nothing in memory is cleared until both records are written. This is the
     * one edit that throws away what it is holding, so the usual "record the
     * failure and carry on" shape is not enough here: clearing first leaves the
     * run in exactly one place — the `active` record — and the next tap writes
     * the empty run over it. The run is then gone, having survived the failure
     * that was reported and not the one that was not.
     *
     * The finished record is written first for the same reason. If it fails
     * nothing has moved and the caller can retry; if the fresh one fails the
     * run is in both records and a retry converges. Neither order can lose it,
     * but only this one leaves a partial write easy to read.
     */
    async finishRun(): Promise<void> {
      const finished = toPersisted({
        state,
        quarantine,
        pendingNotice: pending,
        rewardedWithoutBoon,
        overrides,
      });
      const fresh = toPersisted({
        state: emptyRun(catalog.game, catalog.dataVersion),
        quarantine: [],
      });

      // Held on an object rather than a plain binding: the assignment happens
      // inside the chained callback, and reading `storageError` instead would
      // race an edit made while this was in flight.
      const failed: { cause: Error | null } = { cause: null };
      writes = writes.then(async () => {
        try {
          await store.save(catalog.game, "last", finished);
          await store.save(catalog.game, "active", fresh);
          storageError = null;
        } catch (cause) {
          failed.cause = cause instanceof Error ? cause : new Error(String(cause));
          storageError = failed.cause;
        }
        refreshCondition();
      });
      await writes;
      if (failed.cause !== null) throw failed.cause;

      state = emptyRun(catalog.game, catalog.dataVersion);
      quarantine = [];
      notice = null;
      pending = null;
      rewardedWithoutBoon = new Set();
      overrides = [];
      /**
       * Nothing from the finished run may be taken back into the fresh one.
       * The last edit belonged to a run that is now in the other record, and
       * restoring it here would put a boon somebody earned last night into a
       * run that has not started — while the record it came from still says
       * the run ended without it.
       */
      undoable = null;
      previousEdit = null;
      refreshCondition();
      // Announced directly rather than through `commit`, which would compare a
      // fresh run against the one just filed and find plenty moved anyway — but
      // this is not an edit and has no snapshot behind it. Both sides are told:
      // the fresh run's pins are as empty as its held boons.
      for (const listener of listeners) listener(state.facts);
      for (const listener of intentListeners) listener(state.intent);
    },

    /**
     * The same fresh run `finishRun` leaves behind, and one write instead of
     * two: `last` is untouched, so an abandoned run does not sit in front of the
     * run somebody meant to keep. Memory is cleared only after the write lands,
     * for the reason above — clearing first leaves the run in one record that
     * the next tap overwrites.
     */
    async clearRun(): Promise<void> {
      const fresh = toPersisted({
        state: emptyRun(catalog.game, catalog.dataVersion),
        quarantine: [],
      });

      const failed: { cause: Error | null } = { cause: null };
      writes = writes.then(async () => {
        try {
          await store.save(catalog.game, "active", fresh);
          storageError = null;
        } catch (cause) {
          failed.cause = cause instanceof Error ? cause : new Error(String(cause));
          storageError = failed.cause;
        }
        refreshCondition();
      });
      await writes;
      if (failed.cause !== null) throw failed.cause;

      state = emptyRun(catalog.game, catalog.dataVersion);
      quarantine = [];
      notice = null;
      pending = null;
      rewardedWithoutBoon = new Set();
      overrides = [];
      // Nothing survives, and an undo least of all: the run this edit took back
      // is in no record at all, so restoring one boon of it would be inventing
      // a run out of the one thing the user happened to do last.
      undoable = null;
      previousEdit = null;
      refreshCondition();
      for (const listener of listeners) listener(state.facts);
      for (const listener of intentListeners) listener(state.intent);
    },

    get storageError() {
      return storageError;
    },

    /**
     * Resolves once every edit made so far has reached the store, and rejects
     * with the last failure if one of them did not. Whoever wants to know
     * asks; nothing is thrown at the tap that caused it.
     */
    flush(): Promise<void> {
      return writes.then(() => {
        if (storageError !== null) throw storageError;
      });
    },
  };
}

/**
 * Whether two runs say the same thing.
 *
 * Asked by value, because identity cannot answer it: a writer that moves
 * nothing still builds a new object and new collections. The walk is a few
 * dozen entries against a real run, which is nothing beside what publishing a
 * non-edit costs — a re-derive everywhere plus the undo level.
 */
function sameFacts(a: RunFacts, b: RunFacts): boolean {
  if (a === b) return true;
  return (
    a.game === b.game &&
    a.dataVersion === b.dataVersion &&
    sameMap(a.held, b.held, sameHeld) &&
    sameMap(a.elements, b.elements, identical) &&
    sameMap(a.slots, b.slots, identical) &&
    sameMap(a.resources, b.resources, identical) &&
    sameSet(a.godPool, b.godPool) &&
    sameSet(a.bans, b.bans) &&
    sameEquipped(a.equipped, b.equipped)
  );
}

function sameIntent(a: RunIntent, b: RunIntent): boolean {
  if (a === b) return true;
  return (
    sameSet(a.pins, b.pins) &&
    sameSet(a.planned, b.planned) &&
    sameMap(a.notes, b.notes, identical)
  );
}

/**
 * An absent talent map and an empty one are different answers — "nobody asked"
 * against "asked, and none is selected" — so they are compared before the
 * contents are.
 */
function sameEquipped(a: RunFacts["equipped"], b: RunFacts["equipped"]): boolean {
  if (a.weapon !== b.weapon || a.aspect !== b.aspect || a.keepsake !== b.keepsake) return false;
  if (a.talents === undefined || b.talents === undefined) return a.talents === b.talents;
  return sameMap(a.talents, b.talents, identical);
}

function sameMap<K, V>(
  a: ReadonlyMap<K, V>,
  b: ReadonlyMap<K, V>,
  same: (x: V, y: V) => boolean,
): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    const other = b.get(key);
    // `has` as well as `get`, since a stored value may legitimately be null —
    // an empty slot is a slot the run has.
    if (other === undefined && !b.has(key)) return false;
    if (!same(value, other as V)) return false;
  }
  return true;
}

function sameSet<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const member of a) if (!b.has(member)) return false;
  return true;
}

function identical<T>(x: T, y: T): boolean {
  return x === y;
}

function sameHeld(x: HeldTrait, y: HeldTrait): boolean {
  return x === y || (x.level === y.level && x.rarity === y.rarity);
}

/**
 * How far into a run the player is — region and chamber — is not collected, and
 * there is deliberately no method above that sets it and nowhere in the run
 * facts to put it.
 *
 * It only ever had one consumer: the question of whether a god could still be
 * forced into a full pool late in a run, asked by a requirement atom that no
 * shipped catalog produces in either game. Against a precision nothing could
 * reach, it cost a phone-first player a number to maintain by hand for the
 * length of every run, with no other surface reading it and no feedback when it
 * drifted. The engine now answers that question from the pool alone and hands
 * the keepsake route to the copy instead, so there is nothing left to ask for.
 *
 * A bridge fed by the game would get the counter for free, which is the case
 * for putting the field back if a catalog ever starts producing that atom. It
 * was never a case for manual entry to ask.
 */
