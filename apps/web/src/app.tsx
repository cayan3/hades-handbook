import { createLookups, keepsakesFor, traitsFor } from "@repo/catalog";
import type { GameId, Rarity, RunFacts, TraitId } from "@repo/core";
import { createRules as hades1Rules } from "@repo/rules-hades1";
import { createRules as hades2Rules } from "@repo/rules-hades2";
import type { RunSession, RunStore, TabPresence } from "@repo/sync";
import {
  ActionSheet,
  type BoonActions,
  type Goal,
  GoalsPanel,
  Loadout,
  type LoadoutEntry,
  NoticeBar,
  NodePresentation,
  type NodeSource,
  OTHER_TAB_BODY,
  OTHER_TAB_TITLE,
  STORAGE_ERROR_BODY,
  STORAGE_ERROR_TITLE,
  TierBands,
  UNREADABLE_RUN_BODY,
  UNREADABLE_RUN_TITLE,
  UndoToast,
  createNodeCache,
  createNodeSource,
  deriveNodeDetail,
  editSentence,
  migrationMessage,
} from "@repo/ui";
import { useCallback, useMemo, useState } from "react";
import {
  attempt,
  useCondition,
  useFacts,
  useIntent,
  useOtherTabOpen,
  useRunSession,
} from "./session.js";

/**
 * The two layout profiles, over one run.
 *
 * Goals is the phone's home and the desktop's third column, and it and the
 * Loadout are the accessible path: everything the god page shows as a graph is
 * reachable in one of those two as a list. That is not a nicety here — the
 * graph is diamonds on a canvas, which is the least reachable shape this
 * product has.
 */

const RULES = {
  hades1: hades1Rules,
  hades2: hades2Rules,
} as const;

/** Built once per game: the records and lookups are fixed for a snapshot. */
function nodeSourceFor(game: GameId): NodeSource {
  return createNodeSource(game, RULES[game](), createLookups(game), traitsFor(game));
}

export interface AppProps {
  readonly store: RunStore;
  readonly presence: TabPresence | null;
  /** False where storage was refused, which is a thing to say rather than hide. */
  readonly persistent: boolean;
}

export function App({ store, presence, persistent }: AppProps) {
  const [game, setGame] = useState<GameId>("hades2");
  const state = useRunSession(game, store);

  if (state.kind === "opening") return <p className="app__loading">Opening your run…</p>;
  if (state.kind === "failed") {
    return (
      <main className="app">
        <NoticeBar
          tone="alert"
          title="The Handbook couldn't open your run."
          body={state.cause.message}
        />
      </main>
    );
  }

  return (
    <Run
      // Keyed on the game so that switching one starts every surface over
      // rather than showing one game's run under the other's catalog for a
      // frame.
      key={game}
      game={game}
      onGame={setGame}
      session={state.session}
      presence={presence}
      persistent={persistent}
    />
  );
}

function Run({
  game,
  onGame,
  session,
  presence,
  persistent,
}: {
  readonly game: GameId;
  readonly onGame: (game: GameId) => void;
  readonly session: RunSession;
  readonly presence: TabPresence | null;
  readonly persistent: boolean;
}) {
  const facts = useFacts(session);
  const intent = useIntent(session);
  const condition = useCondition(session);
  const otherTabOpen = useOtherTabOpen(presence);

  const [opened, setOpened] = useState<TraitId | null>(null);
  const [fault, setFault] = useState<Error | null>(null);
  const [dismissedEdit, setDismissedEdit] = useState<unknown>(null);
  const [god, setGod] = useState<string | null>(null);
  /**
   * The fallback ladder is the default because **no art set is shipped**.
   *
   * The real-art ladder puts state on the frame and on what is done to the
   * artwork, on the argument that a fill would bury a detailed, already
   * colourful icon. With every icon resolving to the missing-art placeholder
   * there is no icon to bury and nothing for half the ladder to ride on: every
   * node is the same flat square, and the frame weights are being asked to
   * carry the whole ladder on their own. The fallback is the same five steps
   * built for exactly this — no image element at all, god colour back on the
   * node as the identity channel.
   *
   * A toggle rather than a detection, because whether a file loads is something
   * only the browser finds out, one image at a time, and a page that changed
   * ladder as art trickled in would be worse than either.
   */
  const [artwork, setArtwork] = useState(false);

  const source = useMemo(() => nodeSourceFor(game), [game]);
  const tabs = useMemo(() => godTabs(source), [source]);
  // Nobody has chosen, so show a god the run has met, or the first one.
  const showing = god ?? tabs.find((name) => facts.godPool.has(name)) ?? tabs[0] ?? NO_GOD;

  /**
   * Gods the player added for planning. Only ever grown, which is half of what
   * makes a tab sticky; the other half is that a pooled god's tab is derived
   * below rather than stored, so leaving the pool cannot take a tab away
   * either. Navigation must not reshuffle under somebody because a boon was
   * removed.
   */
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const addGodTab = useCallback((name: string) => {
    setAdded((before) => new Set(before).add(name));
  }, []);

  /**
   * The first god is always here, so the bar is never empty on a run that has
   * met nobody — and so that the tab a player starts on does not vanish the
   * moment they look at a second god, which is what happens if the only reason
   * it was there was that it was selected.
   */
  const shownTabs = tabs.filter(
    (name) =>
      facts.godPool.has(name) || added.has(name) || name === showing || name === tabs[0],
  );
  shownTabs.push(NO_GOD);
  const unshown = tabs.filter((name) => !shownTabs.includes(name));
  // One cache for the whole page, keyed on the facts object's identity — which
  // is sound because every writer replaces the object and shares the
  // collections it did not touch.
  const cache = useMemo(() => createNodeCache(source), [source]);
  const view = useCallback((trait: TraitId) => cache.viewOf(trait, facts), [cache, facts]);
  const boons = useMemo(() => boonsOf(source, game, showing), [source, game, showing]);

  const write = useCallback(
    (body: () => void) => {
      attempt(setFault, body);
    },
    [],
  );

  const actions: BoonActions = useMemo(
    () => ({
      mark: (trait: TraitId, rarity: Rarity | null) =>
        write(() => session.source.mark(trait, rarity === null ? {} : { rarity })),
      remove: (trait: TraitId) => write(() => session.source.remove(trait)),
      purge: (trait: TraitId) => write(() => session.source.purge(trait)),
      pin: (trait: TraitId) => write(() => session.source.pin(trait)),
      unpin: (trait: TraitId) => write(() => session.source.unpin(trait)),
      clearOverride: (trait: TraitId) => write(() => session.layer.clearOverride("held", trait)),
    }),
    [session, write],
  );

  const goals: Goal[] = [...intent.pins].map((trait) => ({
    view: view(trait),
    detail: deriveNodeDetail(source, view(trait), facts, intent.pins),
  }));

  const entries: LoadoutEntry[] = [...facts.held.keys()].map((trait) => ({
    view: view(trait),
    slot: source.records[trait]?.slot ?? null,
    overridden: session.layer.isOverridden("held", trait),
  }));

  const openedView = opened === null ? null : view(opened);

  return (
    <NodePresentation ladder={artwork ? "real-art" : "fallback"}>
      <div className="app">
        <header className="app__head">
          <h1>Hades Handbook</h1>
          <label className="app__artwork">
            <input
              type="checkbox"
              checked={artwork}
              onChange={(event) => setArtwork(event.target.checked)}
            />
            Artwork
          </label>
          <nav className="app__games" aria-label="Game">
            {(["hades1", "hades2"] as const).map((id) => (
              <button
                key={id}
                type="button"
                aria-current={id === game ? "page" : undefined}
                onClick={() => onGame(id)}
              >
                {id === "hades1" ? "Hades" : "Hades II"}
              </button>
            ))}
          </nav>
          <button
            type="button"
            className="app__finish"
            onClick={() => {
              // The session's, never the source's: the source's would empty the
              // run and leave the overlay laying a finished run's hand-edits
              // over the fresh one.
              void session.finishRun().catch((cause: unknown) => {
                setFault(cause instanceof Error ? cause : new Error(String(cause)));
              });
            }}
          >
            End run
          </button>
        </header>

        <Notices
          condition={condition}
          otherTabOpen={otherTabOpen}
          persistent={persistent}
          fault={fault}
          onAcceptMigration={() => write(() => session.source.acceptMigration())}
          onDismissFault={() => setFault(null)}
          onCheckStorage={() => {
            // The one caller of `flush`, and it is awaited. `void source.flush()`
            // would reproduce exactly the unhandled rejection that reporting
            // storage failures on the condition exists to avoid.
            session.source
              .flush()
              .then(
                () => setFault(null),
                (cause: unknown) =>
                  setFault(cause instanceof Error ? cause : new Error(String(cause))),
              );
          }}
        />

        <main className="app__body">
          <GoalsPanel goals={goals} onOpen={setOpened} />
          <Loadout
            entries={entries}
            equipped={equippedItems(facts)}
            onOpen={setOpened}
          />
          <section className="app__ladder">
            <h2>Boons</h2>
            <p className="app__hint">
              Tap a boon to see what it needs, mark it, or set it as a goal.
            </p>
            <nav className="app__gods" aria-label="God">
              {shownTabs.map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-current={name === showing ? "page" : undefined}
                  // In the pool is a fact about the run and shows on the tab;
                  // it never decides whether the tab is there.
                  data-pooled={facts.godPool.has(name)}
                  onClick={() => setGod(name)}
                >
                  {name}
                </button>
              ))}
              {unshown.length === 0 ? null : (
                /**
                 * Every god at once is seventeen tabs wrapping over three rows,
                 * which is a list rather than navigation. So the bar carries the
                 * gods this run has actually met plus whatever the player added
                 * for planning, and the rest arrive through here.
                 *
                 * A native select rather than a popover: it needs no focus
                 * management, no escape handling and no second dialog, and on a
                 * phone it is the control the platform already gives for exactly
                 * this.
                 */
                <label className="app__addgod">
                  <span className="visually-hidden">Add a god to plan with</span>
                  <select
                    value=""
                    onChange={(event) => {
                      addGodTab(event.target.value);
                      setGod(event.target.value);
                    }}
                  >
                    <option value="" disabled>
                      + god
                    </option>
                    {unshown.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </nav>
            <TierBands
              views={boons.map(view)}
              pinned={intent.pins}
              onOpen={setOpened}
            />
          </section>
        </main>

        {condition.lastEdit === null || condition.lastEdit === dismissedEdit ? null : (
          <UndoToast
            what={editSentence(condition.lastEdit, source.naming)}
            onUndo={() => write(() => session.source.undo())}
            onDismiss={() => setDismissedEdit(condition.lastEdit)}
          />
        )}

        {openedView === null || opened === null ? null : (
          <ActionSheet
            view={openedView}
            detail={deriveNodeDetail(source, openedView, facts, intent.pins)}
            pinned={intent.pins.has(opened)}
            overridden={session.layer.isOverridden("held", opened)}
            onClose={() => setOpened(null)}
            actions={actions}
          />
        )}
      </div>
    </NodePresentation>
  );
}

/**
 * Everything the source has to say, in one place above the run.
 *
 * Each of these was a field with no view, which is the same as not existing: a
 * player met an empty run with no explanation, or a run that had quietly
 * stopped saving, and nothing on the page said either.
 */
function Notices({
  condition,
  otherTabOpen,
  persistent,
  fault,
  onAcceptMigration,
  onDismissFault,
  onCheckStorage,
}: {
  readonly condition: ReturnType<typeof useCondition>;
  readonly otherTabOpen: boolean;
  readonly persistent: boolean;
  readonly fault: Error | null;
  readonly onAcceptMigration: () => void;
  readonly onDismissFault: () => void;
  readonly onCheckStorage: () => void;
}) {
  const notice = condition.migrationNotice;
  const migration = notice === null ? null : migrationMessage(notice.count, notice.entries);

  return (
    <div className="app__notices">
      {condition.unreadableRun === null ? null : (
        <NoticeBar tone="alert" title={UNREADABLE_RUN_TITLE} body={UNREADABLE_RUN_BODY}>
          <p className="notice__cause">{condition.unreadableRun.message}</p>
        </NoticeBar>
      )}

      {migration === null ? null : (
        <NoticeBar
          title={migration.title}
          body={migration.body}
          onDismiss={onAcceptMigration}
          dismissLabel="Carry on anyway"
        >
          {migration.notes.length === 0 ? null : (
            <ul className="notice__notes">
              {/* The player's own sentences, which are the one thing here worth
                  showing verbatim — the ids beside them are exactly the ones
                  the catalog can no longer put a name to. */}
              {migration.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </NoticeBar>
      )}

      {condition.storageError === null ? null : (
        <NoticeBar
          tone="alert"
          title={STORAGE_ERROR_TITLE}
          body={STORAGE_ERROR_BODY}
          onDismiss={onCheckStorage}
          dismissLabel="Check again"
        />
      )}

      {persistent ? null : (
        <NoticeBar
          title="This browser won't let the Handbook save."
          body="Everything works, and none of it will survive closing the tab. Storage is usually blocked in a private window."
        />
      )}

      {!otherTabOpen ? null : <NoticeBar title={OTHER_TAB_TITLE} body={OTHER_TAB_BODY} />}

      {fault === null ? null : (
        <NoticeBar
          tone="alert"
          title="That didn't work."
          body={fault.message}
          onDismiss={onDismissFault}
        />
      )}
    </div>
  );
}

/** The equipped kit, which is not the Loadout and sits beside it. */
function equippedItems(facts: RunFacts): { label: string; value: string }[] {
  const items: { label: string; value: string }[] = [];
  const { weapon, aspect, keepsake } = facts.equipped;
  if (weapon !== undefined) items.push({ label: "Weapon", value: weapon });
  if (aspect !== undefined) items.push({ label: "Aspect", value: aspect });
  if (keepsake !== undefined) items.push({ label: "Keepsake", value: keepsake });
  return items;
}

/**
 * Every god this game's records attribute a boon to, plus the bucket for the
 * ones they attribute to nobody — Duos, which answer to two gods, and the
 * weapon forms.
 *
 * Every god is always present, which is the sticky-tab rule got for free: the
 * pool changes what a tab *looks* like and never whether it is there, so
 * navigation cannot reshuffle under somebody because a boon was removed.
 */
const NO_GOD = "Duos & others";

function godTabs(source: NodeSource): string[] {
  const gods = new Set<string>();
  for (const record of Object.values(source.records)) {
    if (record.god !== null) gods.add(record.god);
  }
  return [...gods].sort((a, b) => a.localeCompare(b));
}

/**
 * One god's boons.
 *
 * The god page proper is a laid-out graph with connectors, junctions and bands,
 * and is a session of its own. This is the ordering rule underneath it — tier
 * bands, which are also the keyboard order — so that every boon is reachable
 * and markable now rather than after that page exists.
 */
function boonsOf(source: NodeSource, game: GameId, god: string): TraitId[] {
  const keepsakes = keepsakesFor(game);
  const shown: TraitId[] = [];
  for (const [id, record] of Object.entries(source.records)) {
    if (god === NO_GOD ? record.god !== null : record.god !== god) continue;
    if (!browsable(id, record, keepsakes)) continue;
    shown.push(id);
  }
  return shown;
}

/**
 * Whether a record belongs in a list somebody browses.
 *
 * Three exclusions, each for a different reason, and none of them is a claim
 * that the record is uninteresting — a held boon still renders whatever it is.
 *
 * **No display text.** Around a fifth of each game's records have no entry in
 * the localized bundle: debug entries, cut content, inheritance templates. The
 * name resolver rightly falls back to the id, which is the right answer for a
 * label on something already on screen and the wrong one for three hundred
 * rows of `BaseCurse` offered as boons to take.
 *
 * **Keepsakes**, which in Hades II are emitted as trait records under the same
 * id — the same overlap that makes one name resolver wrong for both spaces.
 * They are equipped, not taken.
 *
 * **Weapon forms.** A form goes in the equipped kit and `mark` refuses one
 * outright, so listing them beside boons would offer a gesture that is designed
 * to fail.
 */
function browsable(
  id: TraitId,
  record: { name: string | null; slot: string | null },
  keepsakes: Readonly<Record<string, unknown>>,
): boolean {
  return record.name !== null && record.slot !== "Aspect" && !Object.hasOwn(keepsakes, id);
}
