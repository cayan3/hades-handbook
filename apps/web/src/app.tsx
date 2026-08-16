import { createLookups, traitsFor } from "@repo/catalog";
import type { GameId, Rarity, RunFacts, TraitId } from "@repo/core";
import { createRules as hades1Rules } from "@repo/rules-hades1";
import { createRules as hades2Rules } from "@repo/rules-hades2";
import type { RunSession, RunStore, TabPresence } from "@repo/sync";
import {
  ActionSheet,
  type BoonActions,
  type Goal,
  GodArt,
  GodPage,
  GodPicker,
  GoalsPanel,
  Loadout,
  type LoadoutEntry,
  NodePresentation,
  NoticeBar,
  type NodeSource,
  OTHER_TAB_BODY,
  OTHER_TAB_TITLE,
  STORAGE_ERROR_BODY,
  STORAGE_ERROR_TITLE,
  Shortcuts,
  UNREADABLE_RUN_BODY,
  UNREADABLE_RUN_TITLE,
  UndoToast,
  bestNextPick,
  createNodeCache,
  createNodeSource,
  deriveNodeDetail,
  displacementLines,
  editSentence,
  godColour,
  godGraph,
  godStep,
  graphTraits,
  isHelpKey,
  migrationMessage,
  useHoverDisclosure,
} from "@repo/ui";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
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

/**
 * The slots a collapsed Loadout shows, in the order it shows them — the boons
 * every run has one of, which is what makes a column of them a build at a
 * glance.
 *
 * **The order is the game's own and the column is read by position**, so it is
 * fixed rather than derived: Attack, Special, Cast, Dash or Sprint, then the
 * fifth each game calls something different — Call in the first, Magick in the
 * second, with the Hex after it.
 *
 * Written out per game because the games differ and neither says so in data:
 * measured, Hades I files boons under Melee, Secondary, Ranged, Rush, Shout and
 * Assist, and Hades II under Melee, Secondary, Ranged, Rush, Mana and Spell.
 * `Assist` is the Companion rather than a boon slot, and `Keepsake` and
 * `Aspect` are the equipped kit, so none of the three is here.
 */
const CORE_SLOTS: Readonly<Record<GameId, readonly string[]>> = {
  hades1: ["Melee", "Secondary", "Ranged", "Rush", "Shout"],
  hades2: ["Melee", "Secondary", "Ranged", "Rush", "Mana", "Spell"],
};

/** Built once per game: the records and lookups are fixed for a snapshot. */
function nodeSourceFor(game: GameId): NodeSource {
  return createNodeSource(game, RULES[game](), createLookups(game), traitsFor(game));
}

/**
 * The player's own edits to one game's god bar: gods added for planning, and
 * tabs taken back out by hand. Two sets rather than one list because the bar is
 * derived — a pooled god's tab is not stored anywhere, so removing one has to be
 * recorded as a removal rather than as an absence.
 *
 * **Per game**, because the bars are different bars. Eleven gods appear in both,
 * and a tab added while reading one game is not a tab asked for in the other.
 */
interface Curated {
  readonly added: ReadonlySet<string>;
  readonly removed: ReadonlySet<string>;
}

const NO_TABS: Curated = { added: new Set(), removed: new Set() };

export interface AppProps {
  readonly store: RunStore;
  readonly presence: TabPresence | null;
  /** False where storage was refused, which is a thing to say rather than hide. */
  readonly persistent: boolean;
}

export function App({ store, presence, persistent }: AppProps) {
  const [game, setGame] = useState<GameId>("hades2");
  const state = useRunSession(game, store);
  /**
   * The curated bars, held here rather than in `Run` because `Run` is keyed on
   * the game and a switch remounts it — which used to take the whole bar with
   * it. A tab stays until it is removed by hand, and each game keeps its own.
   */
  const [curated, setCurated] = useState<Record<GameId, Curated>>({
    hades1: NO_TABS,
    hades2: NO_TABS,
  });

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
      persistent={persistent && state.persistent}
      curated={curated[game]}
      onCurated={(next) => setCurated({ ...curated, [game]: next })}
    />
  );
}

function Run({
  game,
  onGame,
  session,
  presence,
  persistent,
  curated,
  onCurated,
}: {
  readonly game: GameId;
  readonly onGame: (game: GameId) => void;
  readonly session: RunSession;
  readonly presence: TabPresence | null;
  readonly persistent: boolean;
  readonly curated: Curated;
  readonly onCurated: (curated: Curated) => void;
}) {
  const facts = useFacts(session);
  const intent = useIntent(session);
  const condition = useCondition(session);
  const otherTabOpen = useOtherTabOpen(presence);

  const [opened, setOpened] = useState<TraitId | null>(null);
  const [fault, setFault] = useState<Error | null>(null);
  const [dismissedEdit, setDismissedEdit] = useState<unknown>(null);
  /** What the last mark pushed out of the run, for the toast to say beside it. */
  const [cost, setCost] = useState<readonly string[]>([]);
  const [god, setGod] = useState<string | null>(null);
  /**
   * Closed by default. It used to open by default, on the argument that Goals
   * is the phone's home and half the accessible path — but the panel is fixed
   * over the right-hand edge and the run is keyed on the game, so switching
   * games threw it back open over whatever was underneath. A surface that
   * arrives uninvited is worse than one you ask for, and the header's control
   * carries the pinned count, so it says how much is behind it.
   */
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [loadoutOpen, setLoadoutOpen] = useState(false);
  /** The command set written out. Opened with `?`, and by nothing else. */
  const [helpOpen, setHelpOpen] = useState(false);
  /**
   * The Goal Cards clicked open. Held here rather than in the panel because the
   * panel is unmounted while it is closed, and a card that forgot it was open
   * every time the panel was put away would be a click undone by looking away.
   */
  const [heldGoals, setHeldGoals] = useState<ReadonlySet<TraitId>>(new Set());

  const source = useMemo(() => nodeSourceFor(game), [game]);
  const tabs = useMemo(() => godTabs(source), [source]);

  /**
   * Adding a god puts the tab up and goes there, and takes them off the removed
   * set — asking for a god you dismissed is asking for the tab back.
   */
  const pickGods = useCallback(
    (names: readonly string[]) => {
      const added = new Set(curated.added);
      const removed = new Set(curated.removed);
      for (const name of names) {
        added.add(name);
        removed.delete(name);
      }
      onCurated({ added, removed });
      if (names.length === 1 && names[0] !== undefined) setGod(names[0]);
    },
    [curated, onCurated],
  );

  /**
   * Taking a tab down is the player's and is the only thing that can: the rule
   * has always read "sticky until the user removes it" and nothing had ever been
   * able to. Recorded rather than derived, because the pool half of the bar is
   * derived — a god still in the pool would put their own tab straight back.
   */
  const dropGod = useCallback(
    (name: string) => {
      const added = new Set(curated.added);
      added.delete(name);
      onCurated({ added, removed: new Set(curated.removed).add(name) });
      // The tab being read is held up by `showing`, so dropping it has to let
      // the selection fall back or it removes nothing.
      setGod((now) => (now === name ? null : now));
    },
    [curated, onCurated],
  );

  /**
   * The first god is always here, so the bar is never empty on a run that has
   * met nobody — and so that the tab a player starts on does not vanish the
   * moment they look at a second god, which is what happens if the only reason
   * it was there was that it was selected.
   */
  const offered = tabs.filter(
    (name) => facts.godPool.has(name) || curated.added.has(name) || name === tabs[0],
  );
  const kept = offered.filter((name) => !curated.removed.has(name));
  // Never empty: a bar with no tabs has nothing to select and no way back.
  const shownTabs = kept.length > 0 ? kept : offered.slice(0, 1);
  const unshown = tabs.filter((name) => !shownTabs.includes(name));

  /**
   * The god being read, and it is picked *from the bar* rather than beside it.
   * Deriving the two independently made the selection hold its own tab up: a
   * removal could not take down the tab you were looking at, because being
   * looked at was one of the reasons a tab was there.
   */
  const showing = (god !== null && shownTabs.includes(god) ? god : shownTabs[0]) ?? "";
  // One cache for the whole page. What makes keying it on facts identity sound
  // is a property of the layer below, and is written down there.
  const cache = useMemo(() => createNodeCache(source), [source]);
  const view = useCallback((trait: TraitId) => cache.viewOf(trait, facts), [cache, facts]);
  // The page's shape and the page's state, derived together because the
  // connectors carry path status and that is a fact about the run.
  const graph = useMemo(
    () => godGraph(source, showing, facts, CORE_SLOTS[game]),
    [source, showing, facts, game],
  );
  const boonViews = useMemo(
    () => new Map(graphTraits(graph).map((trait) => [trait, view(trait)])),
    [graph, view],
  );

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

  /**
   * The two gestures a boon carries on the page itself.
   *
   * A click marks what the run does not have and opens the sheet on what it
   * does; there is no popup in front of marking, because marking is what a
   * player does dozens of times a run. Setting a goal is the secondary gesture
   * and arrives as a context menu, which is a right-click on a pointer and a
   * long press on a touch screen — one handler for both.
   */
  const markOrOpen = useCallback(
    (trait: TraitId) => {
      /**
       * What the mark is about to cost, worked out before it happens because
       * afterwards the slot holds something else.
       *
       * This is the displacement annotation, arriving beside the undo rather
       * than as a warning ahead of the tap. There is no ahead — marking is one
       * tap — and it was never a choice anyway: a control that could refuse a
       * displacement would be refusing ordinary play. Computed here rather than
       * carried on the node because the half worth reading walks the player's
       * pins, and pins are intent, which is not in the node cache's key.
       */
      const displaced = deriveNodeDetail(source, view(trait), facts, intent.pins).displaces;
      setCost(displaced === null ? [] : displacementLines(displaced));
      write(() => session.source.mark(trait));
    },
    [session, write, source, view, facts, intent],
  );
  const toggleGoal = useCallback(
    (trait: TraitId) =>
      write(() =>
        intent.pins.has(trait) ? session.source.unpin(trait) : session.source.pin(trait),
      ),
    [session, write, intent],
  );

  /**
   * The two commands that act on the page rather than on whatever has focus, so
   * they are listened for on the document: a handler on the page body would miss
   * every press made while focus was inside a panel or a dialog.
   *
   * `[` and `]` step the god bar. Bracket keys rather than letters because the
   * quick-add's search box is coming and every unmodified letter spent here is
   * one it cannot type — the guard against typing is in the predicate either
   * way, which is what makes a document-level binding safe at all.
   */
  useEffect(() => {
    const press = (event: globalThis.KeyboardEvent) => {
      if (isHelpKey(event)) {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }
      const way = godStep(event);
      if (way === null) return;
      const at = shownTabs.indexOf(showing);
      const next = shownTabs[Math.min(shownTabs.length - 1, Math.max(0, at + way))];
      if (next === undefined || next === showing) return;
      event.preventDefault();
      setGod(next);
    };
    document.addEventListener("keydown", press);
    return () => document.removeEventListener("keydown", press);
  }, [shownTabs, showing]);

  /**
   * The Goals panel closes on a click outside it and on Escape.
   *
   * It lies over the right-hand end of the page, so the gesture people reach for
   * is clicking off it — the same one the **Action Sheet**'s shade already takes.
   * The panel is not a dialog and takes no shade of its own, since the page under
   * it stays live.
   *
   * **The control that opens it is excluded, and deleting that exclusion is how
   * this got shipped broken once.** A discrete click flushes the effect that
   * registers this listener while the same click is still travelling to the
   * document, so without the exclusion the opening click reaches here and closes
   * the panel again — it never opened at all. The runner flushes effects at the
   * end of `act` instead, so a mutation there shows nothing.
   *
   * A dialog over the panel is the second exclusion: the sheet listens on the
   * document too, and Escape belongs to whatever is on top.
   */
  useEffect(() => {
    if (!goalsOpen) return;
    const away = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      // The scrim covers both dialogs, and a click on it or inside it belongs to
      // them — including the close control, whose subtree React has already
      // detached by the time this runs, `closest` still walking it.
      if (target.closest(".app__goals, .app__goalstoggle, .sheet-scrim") !== null) return;
      setGoalsOpen(false);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector('[role="dialog"]') !== null) return;
      setGoalsOpen(false);
    };
    document.addEventListener("click", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("click", away);
      document.removeEventListener("keydown", escape);
    };
  }, [goalsOpen]);

  const goals: Goal[] = [...intent.pins].map((trait) => ({
    view: view(trait),
    detail: deriveNodeDetail(source, view(trait), facts, intent.pins),
  }));

  /**
   * The boon that is a step toward the most pins at once, which is the one thing
   * the Goals panel says that is about the goals *together* rather than about
   * any one of them.
   *
   * Derived here because it needs the catalog and the run, both of which live at
   * this layer; the panel takes an answer. Null far more often than not: it is
   * silent until two goals want the same boon.
   */
  const best = bestNextPick(
    source,
    [...intent.pins],
    facts,
    (trait) => view(trait).state,
  );

  const entries: LoadoutEntry[] = [...facts.held.keys()].map((trait) => ({
    view: view(trait),
    slot: source.records[trait]?.slot ?? null,
    overridden: session.layer.isOverridden("held", trait),
  }));

  const openedView = opened === null ? null : view(opened);

  /*
   * The art ships, so the real-art ladder is what the product is.
   *
   * There was a header checkbox here for a while, from the round where the art
   * set was two placeholder files and every icon was a grey box. The set is
   * complete now, and a control letting a player turn the artwork off was never
   * a feature anyone asked for — it was a way to look at the other ladder while
   * the first one had nothing to draw.
   *
   * The fallback ladder itself stays and is not deprecated: it is the path by
   * which the art comes down if it ever has to, and it is one line from here.
   * What went is a player's ability to choose between them.
   */
  return (
    <NodePresentation ladder="real-art" game={game}>
      <div className="app">
        <header className="app__head">
          <h1>Hades Handbook</h1>
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
          {/* In the header rather than pinned to the panel, so the control that
              opens it cannot sit on top of anything at a narrow width. */}
          <button
            type="button"
            className="app__goalstoggle"
            aria-expanded={goalsOpen}
            onClick={() => setGoalsOpen(!goalsOpen)}
          >
            Goals{goals.length === 0 ? "" : ` (${goals.length})`}
          </button>
          <EndRun
            onFinish={() => session.finishRun()}
            onClear={() => session.clearRun()}
            onFault={setFault}
          />
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

        {/* The bar starts where the boons do rather than where the page does:
            the column beside it belongs to the Loadout, and what goes above
            that column is the equipped kit rather than a god. Empty until it
            has something to hold, so the two section headings still line up. */}
        <nav className="app__gods" aria-label="God">
          <div className="app__godbar">
              {shownTabs.map((name) => (
                <span key={name} className="app__godslot">
                <button
                  type="button"
                  className="app__godtab"
                  aria-current={name === showing ? "page" : undefined}
                  /**
                   * In the pool is a fact about the run and shows on the tab;
                   * it never decides whether the tab is there. The glow is the
                   * god's own colour, which is the channel hue already means
                   * everywhere else — a row of tabs glowing one shared colour
                   * would be spending the identity channel on nothing.
                   *
                   * Nothing about goals reaches this: a pinned goal, or a god
                   * added to plan with, leaves a tab exactly as it was.
                   */
                  data-pooled={facts.godPool.has(name)}
                  style={{ "--god": godColour(name) } as CSSProperties}
                  title={name}
                  // The glow is the one channel a reader gets nothing of, so
                  // being in the pool goes in the name. On the label rather than
                  // in the hidden text below because the tab's own text is what
                  // the picker and the bar are read by.
                  aria-label={facts.godPool.has(name) ? `${name} — in your pool` : undefined}
                  onClick={() => setGod(name)}
                >
                  {/* The symbol and nothing drawn beside it, so the bar reads
                      as shapes. The name is still the control's accessible name
                      and its `title`, which is what a symbol nobody recognises —
                      or has, Hades having none in either set — falls back to. */}
                  <GodArt game={game} god={name} className="app__godart" />
                  <span className="visually-hidden">{name}</span>
                </button>
                {/* Its own control rather than a gesture on the tab, since the
                    tab's click already means "read this god". Drawn only under
                    the pointer, because a bar of crosses is a bar about
                    removing things. */}
                <button
                  type="button"
                  className="app__goddrop"
                  aria-label={`Remove the ${name} tab`}
                  onClick={() => dropGod(name)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </span>
              ))}
              {unshown.length === 0 ? null : (
                /**
                 * Every god at once is seventeen tabs wrapping over three rows,
                 * which is a list rather than navigation. So the bar carries the
                 * gods this run has actually met plus whatever the player added
                 * for planning, and the rest arrive through here.
                 *
                 * Two controls for one job and the stylesheet shows whichever
                 * the device can work: a hovered list where there is a pointer,
                 * the platform's select where there is not, one in the tab order.
                 */
                <>
                  <GodPicker
                    gods={unshown}
                    onPick={(name) => pickGods([name])}
                    onPickAll={() => pickGods(unshown)}
                  />
                  <label className="app__addgod">
                    <span className="visually-hidden">Add a god to plan with</span>
                    <select
                      value=""
                      onChange={(event) => pickGods([event.target.value])}
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
                </>
              )}
          </div>
        </nav>

        <main className="app__body">
          {/* Left: what the run holds. Right of it: what it could hold. Goals
              is a panel over the right-hand edge rather than a third column,
              so the number of columns does not change with the window. */}
          {/* A tile holds its card open beside the grid rather than opening a
              sheet over it: reading what you hold is what this panel is for,
              and covering the grid to read one entry is the thing it must not
              do. Which cards are open is the panel's own business; what is in
              one is derived here, where the catalog and the engine are. */}
          <Loadout
            entries={entries}
            coreSlots={CORE_SLOTS[game]}
            equipped={equippedItems(facts)}
            // A total over the panel: which element a boon counts toward is on
            // the node in the God View, and how many the run has is this.
            elements={facts.elements}
            expanded={loadoutOpen}
            onExpanded={setLoadoutOpen}
            detailOf={(trait) => deriveNodeDetail(source, view(trait), facts, intent.pins)}
            actions={actions}
          />

          <section className="app__ladder">
            <h2>Boons</h2>
            <GodPage
              graph={graph}
              views={boonViews}
              nameOf={source.naming.trait}
              pinned={intent.pins}
              onMark={markOrOpen}
              onOpen={setOpened}
              onGoal={toggleGoal}
            />
            {/* Under the thing it is about, not above it: it is a first-visit
                explanation and it stops being read long before it stops being
                on the page. */}
            <p className="app__hint">
              Tap a boon to mark it as taken. Long-press, or right-click, to set
              it as a goal. Tapping one you already hold opens its details.
            </p>
          </section>
        </main>

        {!goalsOpen ? null : (
          <aside className="app__goals">
            {/* Its own way out. The panel covers the right-hand end of the
                header, which is where the control that opened it lives, so
                without this there is no way to put it away. */}
            <button
              type="button"
              className="app__goalsclose"
              onClick={() => setGoalsOpen(false)}
            >
              Close
            </button>
            <GoalsPanel
              goals={goals}
              /* The goals it serves by name rather than by count: "a step
                 toward 2 of these" is a number a player then has to go and
                 resolve against the list underneath it. */
              bestNextPick={
                best === null
                  ? null
                  : { ...view(best.trait), serves: best.goals.map(source.naming.trait) }
              }
              heldOpen={heldGoals}
              onHeldOpen={(trait) =>
                setHeldGoals((now) => {
                  const next = new Set(now);
                  // A toggle: the control that opened a card is the one that
                  // closes it, which is the rule the Loadout's cards follow.
                  if (!next.delete(trait as TraitId)) next.add(trait as TraitId);
                  return next;
                })
              }
              onOpen={setOpened}
              onGoal={toggleGoal}
            />
          </aside>
        )}

        {condition.lastEdit === null || condition.lastEdit === dismissedEdit ? null : (
          <UndoToast
            what={editSentence(condition.lastEdit, source.naming)}
            cost={condition.lastEdit.action === "mark" ? cost : []}
            onUndo={() => write(() => session.source.undo())}
            onDismiss={() => setDismissedEdit(condition.lastEdit)}
          />
        )}

        {!helpOpen ? null : <Shortcuts onClose={() => setHelpOpen(false)} />}

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
 * Ending a run, and the one other way out of it.
 *
 * One control rather than two: the ordinary end is the button, and throwing the
 * run away without filing it is revealed under the pointer. The destructive half
 * is then a variant of the gesture rather than a second control of equal weight
 * standing beside it.
 */
function EndRun({
  onFinish,
  onClear,
  onFault,
}: {
  readonly onFinish: () => Promise<void>;
  readonly onClear: () => Promise<void>;
  readonly onFault: (cause: Error) => void;
}) {
  const { open, opener, wrapper, close } = useHoverDisclosure();

  // Both verbs belong to the session, never to the source: the source's would
  // empty the run and leave the overlay laying a finished run's hand-edits over
  // the fresh one.
  const run = (act: () => Promise<void>) => {
    close();
    void act().catch((cause: unknown) => {
      onFault(cause instanceof Error ? cause : new Error(String(cause)));
    });
  };

  return (
    <div className="app__end" {...wrapper}>
      <button type="button" ref={opener} className="app__finish" onClick={() => run(onFinish)}>
        End run
      </button>
      {!open ? null : (
        <ul className="app__endmenu">
          <li>
            {/* Files nothing, so the run is in no record afterwards and the undo
                offer goes with it. Red because it is the variant, and it is the
                one gesture on the page that nothing takes back. */}
            <button type="button" className="app__skip" onClick={() => run(onClear)}>
              Skip summary
            </button>
          </li>
        </ul>
      )}
    </div>
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
 * Every god this game's records attribute a boon to.
 *
 * Every god is always present, which is the sticky-tab rule got for free: the
 * pool changes what a tab *looks* like and never whether it is there, so
 * navigation cannot reshuffle under somebody because a boon was removed.
 */
function godTabs(source: NodeSource): string[] {
  const gods = new Set<string>();
  for (const record of Object.values(source.records)) {
    if (record.god !== null) gods.add(record.god);
  }
  return [...gods].sort((a, b) => a.localeCompare(b));
}
