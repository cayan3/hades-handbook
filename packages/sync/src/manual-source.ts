import type {
  AspectId,
  Element,
  GameId,
  GodId,
  KeepsakeId,
  Rarity,
  ResourceId,
  RunFacts,
  RunState,
  TalentId,
  TraitId,
} from "@repo/core";
import { type SyncCatalog, shippedCatalog } from "./catalog-view.js";
import { migrate } from "./migrate.js";
import { type StoredRun, emptyRun, fromPersisted, toPersisted } from "./persisted.js";
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

  /** Marks a boon held, with everything that implies. */
  mark(trait: TraitId, options?: MarkOptions): void;

  /** A mis-tap: the boon was never taken. */
  remove(trait: TraitId): void;

  /** The boon was taken and then lost in game. */
  purge(trait: TraitId): void;

  /** Records a god as having given this run a reward, without naming a boon. */
  addGod(god: GodId): void;

  equipWeapon(weapon: string | null): void;
  equipAspect(aspect: AspectId | null): void;
  equipKeepsake(keepsake: KeepsakeId | null): void;

  /** Answers one Mirror row: a member, or `null` for "none selected". */
  answerMirrorRow(row: string, selected: TalentId | null): void;

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
  const stored: StoredRun =
    loaded === null
      ? { state: emptyRun(game, catalog.dataVersion), quarantine: [] }
      : fromPersisted(loaded);

  const outcome = migrate(stored.state, catalog);
  const quarantine = [...stored.quarantine, ...outcome.quarantine];

  const notice: MigrationNotice | null =
    outcome.quarantine.length === 0
      ? null
      : {
          count: outcome.quarantine.length,
          entries: outcome.quarantine,
          playedOn: stored.state.facts.dataVersion,
          now: catalog.dataVersion,
        };

  return createSource(catalog, store, outcome.state, quarantine, notice);
}

function createSource(
  catalog: SyncCatalog,
  store: RunStore,
  initial: RunState,
  initialQuarantine: readonly QuarantinedEntry[],
  initialNotice: MigrationNotice | null,
): ManualSource {
  let state = initial;
  let quarantine = initialQuarantine;
  let notice = initialNotice;
  const listeners = new Set<(facts: RunFacts) => void>();

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

  function persist(): void {
    const snapshot = toPersisted({ state, quarantine });
    writes = writes.then(async () => {
      try {
        await store.save(catalog.game, "active", snapshot);
        storageError = null;
      } catch (cause) {
        storageError = cause instanceof Error ? cause : new Error(String(cause));
      }
    });
  }

  /**
   * Every edit lands as a whole new facts object, with the collections it did
   * not touch shared rather than copied. Consumers can then tell "something
   * changed" from object identity, which is what makes memoizing evaluation on
   * the facts sound; mutating in place would leave every cache holding a stale
   * answer that still looks current.
   */
  function commit(facts: RunFacts, intent = state.intent): void {
    state = { facts, intent };
    persist();
    for (const listener of listeners) listener(facts);
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

    acceptMigration(): void {
      notice = null;
      commit({ ...state.facts, dataVersion: catalog.dataVersion });
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

      const displaced = found.slot === null ? undefined : state.facts.slots.get(found.slot);

      const held = new Map(state.facts.held);
      if (displaced !== undefined && displaced !== null && displaced !== trait) {
        held.delete(displaced);
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
     */
    remove(trait: TraitId): void {
      if (!state.facts.held.has(trait)) return;
      const found = Object.hasOwn(catalog.traits, trait) ? catalog.traits[trait] : undefined;
      const { held, slots } = drop(trait);

      const godPool = new Set(state.facts.godPool);
      const god = found?.god ?? null;
      if (god !== null && !stillHoldsBoonOf(held, god)) godPool.delete(god);

      commit({ ...state.facts, held, slots, godPool });
    },

    /**
     * The boon was taken and is gone. The pool is untouched: the game's own
     * record of which gods have given this run a reward is not rewritten when
     * one of those rewards is lost, and a purge therefore never frees a slot.
     */
    purge(trait: TraitId): void {
      if (!state.facts.held.has(trait)) return;
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
      if (state.facts.godPool.has(god)) return;
      commit({ ...state.facts, godPool: new Set(state.facts.godPool).add(god) });
    },

    /** Unchecked: the catalog ships no weapon table to check against. */
    equipWeapon(weapon: string | null): void {
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
     */
    equipAspect(aspect: AspectId | null): void {
      if (aspect !== null) record(aspect);
      const equipped = { ...state.facts.equipped };
      if (aspect === null) delete equipped.aspect;
      else equipped.aspect = aspect;
      commit({ ...state.facts, equipped });
    },

    equipKeepsake(keepsake: KeepsakeId | null): void {
      if (keepsake !== null && !catalog.keepsakes.has(keepsake)) {
        throw new Error(`no keepsake "${keepsake}" in the ${catalog.game} catalog`);
      }
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

      const talents = new Map(state.facts.equipped.talents ?? []);
      for (const member of found.members) {
        talents.set(member, member === selected ? "selected" : "notSelected");
      }
      commit({ ...state.facts, equipped: { ...state.facts.equipped, talents } });
    },

    setElement(element: Element, count: number): void {
      const elements = new Map(state.facts.elements);
      if (count === 0) elements.delete(element);
      else elements.set(element, count);
      commit({ ...state.facts, elements });
    },

    setResource(resource: ResourceId, amount: number): void {
      const resources = new Map(state.facts.resources);
      if (amount === 0) resources.delete(resource);
      else resources.set(resource, amount);
      commit({ ...state.facts, resources });
    },

    pin(trait: TraitId): void {
      record(trait);
      commit(state.facts, { ...state.intent, pins: new Set(state.intent.pins).add(trait) });
    },

    unpin(trait: TraitId): void {
      const pins = new Set(state.intent.pins);
      pins.delete(trait);
      commit(state.facts, { ...state.intent, pins });
    },

    plan(trait: TraitId): void {
      record(trait);
      commit(state.facts, { ...state.intent, planned: new Set(state.intent.planned).add(trait) });
    },

    unplan(trait: TraitId): void {
      const planned = new Set(state.intent.planned);
      planned.delete(trait);
      commit(state.facts, { ...state.intent, planned });
    },

    setNote(trait: TraitId, text: string): void {
      const notes = new Map(state.intent.notes);
      if (text === "") notes.delete(trait);
      else notes.set(trait, text);
      commit(state.facts, { ...state.intent, notes });
    },

    /**
     * The finished run moves into the second record and a fresh one takes its
     * place. Quarantine does not travel with it: those entries belong to the
     * run they came out of, and carrying them into a run that never had them
     * would produce a notice about ids the new run never held.
     */
    async finishRun(): Promise<void> {
      const finished = toPersisted({ state, quarantine });
      state = emptyRun(catalog.game, catalog.dataVersion);
      quarantine = [];
      notice = null;
      const fresh = toPersisted({ state, quarantine });
      writes = writes.then(async () => {
        try {
          await store.save(catalog.game, "last", finished);
          await store.save(catalog.game, "active", fresh);
          storageError = null;
        } catch (cause) {
          storageError = cause instanceof Error ? cause : new Error(String(cause));
        }
      });
      await writes;
      for (const listener of listeners) listener(state.facts);
      if (storageError !== null) throw storageError;
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
 * Run progress — region and chamber — is not collected, and there is
 * deliberately no method above that sets it.
 *
 * It has exactly one consumer in the whole model: the question of whether a god
 * can still be forced into a full pool late in a run. That question is asked by
 * one requirement atom which no shipped catalog produces, in either game, so
 * the counter would today buy a precision nothing can reach. Against that it
 * costs a phone-first player a number to maintain by hand for the length of
 * every run, with no other surface reading it and no feedback when it drifts —
 * and the half of it that is a chamber count is read by nothing at all, in any
 * game, even in principle.
 *
 * The engine already handles its absence, and handles it in the safe direction:
 * with no progress recorded a god reads as still reachable rather than as a
 * dead end, which is the answer that never costs a player a build they could
 * have finished.
 *
 * A bridge fed by the game gets the counter for free and may write it. That is
 * the case this field stays optional for. It is not a reason for manual entry
 * to ask.
 */
