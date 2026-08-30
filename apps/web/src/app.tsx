import { createLookups, traitsFor, weaponFor, weaponsFor } from "@repo/catalog";
import type { GameId, Rarity, RunFacts, RunState, TraitId } from "@repo/core";
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
  Hub,
  HubGlyph,
  Loadout,
  type LoadoutEntry,
  NodePresentation,
  RunOverview,
  SaveScreen,
  NoticeBar,
  type NodeSource,
  OTHER_TAB_BODY,
  OTHER_TAB_TITLE,
  STORAGE_ERROR_BODY,
  STORAGE_ERROR_TITLE,
  UNREADABLE_RUN_BODY,
  UNREADABLE_RUN_TITLE,
  UndoToast,
  WeaponArt,
  bestNextPick,
  createNodeCache,
  createNodeSource,
  deriveNodeDetail,
  displacementLines,
  editSentence,
  finishedRun,
  godColour,
  godGraph,
  godStep,
  graphTraits,
  weaponGraph,
  migrationMessage,
  useHoverDisclosure,
} from "@repo/ui";
import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { HOME_HASH, useRoute } from "./route.js";
import {
  attempt,
  useCondition,
  useFacts,
  useIntent,
  useOtherTabOpen,
  useRunSession,
} from "./session.js";
import { SiteHeader } from "./header.js";
import { GettingStarted, Home } from "./home.js";

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

/**
 * The Loadout's column, which is the list above plus the equipped form.
 *
 * Hades II draws the weapon at the top of its tray, so `Aspect` leads there.
 * Hades I puts it first in the expanded panel instead, which it gets by leading
 * the entry list rather than by being a slot. Separate from `CORE_SLOTS`
 * because that list also ranks boons on a god page, where no boon has this slot.
 */
const LOADOUT_SLOTS: Readonly<Record<GameId, readonly string[]>> = {
  hades1: CORE_SLOTS.hades1,
  hades2: ["Aspect", ...CORE_SLOTS.hades2],
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
  /**
   * The bar as it stood the last time a god was added by hand, that god on the
   * end. Only the hand-added half needs recording: everything else arrived by
   * being met, and the pool is already in that order.
   */
  readonly order: readonly string[];
}

const NO_TABS: Curated = { added: new Set(), removed: new Set(), order: [] };

/**
 * The god tabs, in the order they arrived on the bar.
 *
 * `order` first, then whatever the run has met that is not in it — a `Set`
 * iterates in insertion order, so `godPool` is already the order the gods were
 * met in. Alphabetical was the old rule and it put a god the run had just met
 * into the middle of the bar, where nothing pointed at the tab that changed.
 */
function barOrder(known: readonly string[], pool: ReadonlySet<string>, curated: Curated): string[] {
  const real = new Set(known);
  return [...new Set([...curated.order, ...pool, ...curated.added])].filter(
    (name) =>
      real.has(name) && (pool.has(name) || curated.added.has(name)) && !curated.removed.has(name),
  );
}

/**
 * What the bar has selected, and it is a sum rather than a god id with a
 * reserved value in it: `godIconFor`, the picker's list of gods not on the bar
 * and every pool question are all keyed by a god's name, and a pseudo-god would
 * reach all three.
 */
type Selection =
  | { readonly kind: "hub" }
  | { readonly kind: "god"; readonly god: string }
  | { readonly kind: "weapon"; readonly weapon: string };

const HUB: Selection = { kind: "hub" };

function sameTab(a: Selection, b: Selection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "god") return b.kind === "god" && b.god === a.god;
  if (a.kind === "weapon") return b.kind === "weapon" && b.weapon === a.weapon;
  return true;
}

export interface AppProps {
  readonly store: RunStore;
  readonly presence: TabPresence | null;
  /** False where storage was refused, which is a thing to say rather than hide. */
  readonly persistent: boolean;
}

/**
 * The router, and the only component that opens no run.
 *
 * A game's session lives one level down so that Home and Getting started cost
 * nothing to visit: neither reads a run, and a hook here would open one for a
 * page with nothing to put it in.
 */
export function App({ store, presence, persistent }: AppProps) {
  const route = useRoute();
  /**
   * The curated bars, held here rather than in `Run` because `Run` is keyed on
   * the game and a switch remounts it — which used to take the whole bar with
   * it. A tab stays until it is removed by hand, and each game keeps its own.
   */
  const [curated, setCurated] = useState<Record<GameId, Curated>>({
    hades1: NO_TABS,
    hades2: NO_TABS,
  });

  if (route.kind === "home") return <Home />;
  if (route.kind === "getting-started") return <GettingStarted />;

  const game = route.game;
  return (
    <GameApp
      game={game}
      store={store}
      presence={presence}
      persistent={persistent}
      curated={curated[game]}
      onCurated={(next) => setCurated({ ...curated, [game]: next })}
    />
  );
}

/** One game's run, opened for as long as its route is the one being read. */
function GameApp({
  game,
  store,
  presence,
  persistent,
  curated,
  onCurated,
}: {
  readonly game: GameId;
  readonly store: RunStore;
  readonly presence: TabPresence | null;
  readonly persistent: boolean;
  readonly curated: Curated;
  readonly onCurated: (curated: Curated) => void;
}) {
  /**
   * Whether the save screen is still to be answered. Held here rather than in
   * `Run`, which is keyed on the game and so remounts on a switch: entering a
   * game from outside is a door, and moving between the two is not.
   */
  const [choosing, setChoosing] = useState(true);
  const state = useRunSession(game, store);

  /* Both of these wear the header, or a run that will not open is a page with
     no way off it — which it was until the header became something every page
     has.

     `state.game !== game` is the switch: the prop moves a render before the
     hook does, so this is the frame where the open session still belongs to the
     game being left. Rendering through it hands one game's session to the
     other's surfaces, whose catalog has not loaded. */
  if (state.kind === "opening" || (state.kind === "open" && state.game !== game)) {
    return (
      <div className="app">
        <SiteHeader game={game} />
        <p className="app__loading">Opening your run…</p>
      </div>
    );
  }
  if (state.kind === "failed") {
    return (
      <div className="app">
        <SiteHeader game={game} />
        <main>
          <NoticeBar
            tone="alert"
            title="The Handbook couldn't open your run."
            body={state.cause.message}
          />
        </main>
      </div>
    );
  }

  return (
    <Run
      // Keyed on the game so that switching one starts every surface over
      // rather than showing one game's run under the other's catalog for a
      // frame.
      key={game}
      game={game}
      session={state.session}
      presence={presence}
      persistent={persistent && state.persistent}
      curated={curated}
      onCurated={onCurated}
      choosing={choosing}
      onChosen={() => setChoosing(false)}
      onReturnToDoor={() => setChoosing(true)}
    />
  );
}

function Run({
  game,
  session,
  presence,
  persistent,
  curated,
  onCurated,
  choosing,
  onChosen,
  onReturnToDoor,
}: {
  readonly game: GameId;
  readonly session: RunSession;
  readonly presence: TabPresence | null;
  readonly persistent: boolean;
  readonly curated: Curated;
  readonly onCurated: (curated: Curated) => void;
  readonly choosing: boolean;
  readonly onChosen: () => void;
  /** Puts the door back up, which is where a finished summary lets go. */
  readonly onReturnToDoor: () => void;
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
  /** Hub until something is picked, which is the whole of what it is for. */
  const [selected, setSelected] = useState<Selection>(HUB);
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
  /**
   * The Goal Cards clicked open. Held here rather than in the panel because the
   * panel is unmounted while it is closed, and a card that forgot it was open
   * every time the panel was put away would be a click undone by looking away.
   */
  const [heldGoals, setHeldGoals] = useState<ReadonlySet<TraitId>>(new Set());
  /**
   * The run filed last, and whether its summary is open over the page.
   *
   * Read off the record rather than kept from the run that was just ended: the
   * record is what survives a reload, and reading it back is the only thing
   * that says it is any good. `filed` is bumped by the run boundary so the load
   * runs again — one effect for both the first read and every later one.
   */
  const [lastRun, setLastRun] = useState<RunState | null>(null);
  const [filed, setFiled] = useState(0);
  /**
   * Whether the summary is open, and what closing it goes back to.
   *
   * Two entrances and they let go in different places. Reached by ending a run,
   * closing lands on the door — which is where a player who just finished is
   * deciding what to do next. Reached from the header mid-run, closing puts
   * them back in the run they were reading, and throwing up the door there
   * would be the summary taking the game away from them.
   */
  const [reviewing, setReviewing] = useState<"door" | "run" | null>(null);

  const source = useMemo(() => nodeSourceFor(game), [game]);
  const tabs = useMemo(() => godTabs(source), [source]);

  /*
   * A record that will not decode is reported rather than swallowed: the run
   * that was played is gone either way, and saying so is the difference between
   * a defect and a mystery. `live` guards the switch a player can make while
   * this is in flight.
   */
  useEffect(() => {
    let live = true;
    session.source.lastRun().then(
      (run) => {
        if (live) setLastRun(run);
      },
      (cause: unknown) => {
        if (!live) return;
        setLastRun(null);
        setFault(cause instanceof Error ? cause : new Error(String(cause)));
      },
    );
    return () => {
      live = false;
    };
  }, [session, filed]);

  /** The finished run as the overview draws it, worked out once per record. */
  const lastOverview = useMemo(
    () => (lastRun === null ? null : finishedRun(source, lastRun, CORE_SLOTS[game])),
    [source, lastRun, game],
  );

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
      // Rightmost, which is what "added" means here — and the bar it is appended
      // to is the filtered one, so a god taken down earlier does not come back
      // in the place they used to hold.
      const order = [...new Set([...barOrder(tabs, facts.godPool, curated), ...names])];
      onCurated({ added, removed, order });
      const only = names.length === 1 ? names[0] : undefined;
      if (only !== undefined) setSelected({ kind: "god", god: only });
    },
    [curated, onCurated, tabs, facts.godPool],
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
      // `order` keeps the name, which costs nothing: the bar filters on the
      // removed set, and the next hand-added god rebuilds `order` from what is
      // actually up.
      onCurated({ added, removed: new Set(curated.removed).add(name), order: curated.order });
      // The tab being read is held up by `showing`, so dropping it has to let
      // the selection fall back or it removes nothing. Hub rather than another
      // god: it is the one tab that is certainly still there.
      setSelected((now) => (now.kind === "god" && now.god === name ? HUB : now));
    },
    [curated, onCurated],
  );

  /**
   * The gods this run has met plus the ones the player added, and nothing else.
   *
   * The first god used to be here unconditionally so the bar could not empty,
   * and the Hub retires that: it is always the first tab, so a run that has met
   * nobody shows the Hub alone rather than an arbitrary god who cannot be taken
   * down and is replaced by somebody else on the first mark.
   */
  const shownTabs = barOrder(tabs, facts.godPool, curated);
  // The picker's list is a different question — which gods you could add — and
  // that one has no arrival order to be in, so it stays alphabetical.
  const unshown = tabs.filter((name) => !shownTabs.includes(name));

  /**
   * The bar itself, Hub first. Pinning it here rather than conditioning it on
   * the run is what makes "the bar is never empty" structural, and it is what
   * the brackets step onto.
   */
  /**
   * The weapons, which need no curating: six per game and every run is played
   * with one, so the whole set is on the bar and there is nothing for a picker
   * to hold. They come after the gods rather than before because the gods are
   * what a run collects and this is what it was started with.
   */
  const weapons = weaponsFor(game);

  const bar: readonly Selection[] = [
    HUB,
    ...shownTabs.map((god) => ({ kind: "god", god }) as const),
    ...weapons.map((weapon) => ({ kind: "weapon", weapon: weapon.id }) as const),
  ];

  /**
   * What is being read, and it is picked *from the bar* rather than beside it.
   * Deriving the two independently made the selection hold its own tab up: a
   * removal could not take down the tab you were looking at, because being
   * looked at was one of the reasons a tab was there.
   */
  const showing = bar.find((tab) => sameTab(tab, selected)) ?? HUB;
  const showingGod = showing.kind === "god" ? showing.god : null;
  const showingWeapon = showing.kind === "weapon" ? showing.weapon : null;
  // One cache for the whole page. What makes keying it on facts identity sound
  // is a property of the layer below, and is written down there.
  const cache = useMemo(() => createNodeCache(source), [source]);
  const view = useCallback((trait: TraitId) => cache.viewOf(trait, facts), [cache, facts]);
  // The page's shape and the page's state, derived together because the
  // connectors carry path status and that is a fact about the run. Null is
  // exactly Hub, which draws no graph — keyed on the god's name rather than on
  // the selection, an object being a fresh one every render.
  const page = useMemo(() => {
    if (showingGod !== null) {
      return { god: showingGod, graph: godGraph(source, showingGod, facts, CORE_SLOTS[game]) };
    }
    if (showingWeapon !== null) {
      return {
        god: null,
        graph: weaponGraph(source, showingWeapon, facts, CORE_SLOTS[game]),
      };
    }
    return null;
  }, [source, showingGod, showingWeapon, facts, game]);
  const boonViews = useMemo(
    () =>
      new Map((page === null ? [] : graphTraits(page.graph)).map((trait) => [trait, view(trait)])),
    [page, view],
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
      remove: (trait: TraitId, options?: { readonly fromPool?: boolean }) =>
        write(() =>
          // A form is taken off rather than removed: it never entered `held`,
          // so `remove` would look for it there and find nothing.
          source.records[trait]?.slot === "Aspect"
            ? session.source.equipAspect(null)
            : session.source.remove(trait, options),
        ),
      purge: (trait: TraitId) => write(() => session.source.purge(trait)),
      pin: (trait: TraitId) => write(() => session.source.pin(trait)),
      unpin: (trait: TraitId) => write(() => session.source.unpin(trait)),
      clearOverride: (trait: TraitId) => write(() => session.layer.clearOverride("held", trait)),
    }),
    [session, write, source],
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
       * A weapon form is equipped, not held, so marking one throws — which is
       * what a player met when this page first drew its forms as ordinary
       * nodes. An equipped form then reads as Obtained, so the next tap opens
       * its sheet like any other, and taking it off is a control there.
       */
      if (source.records[trait]?.slot === "Aspect") {
        const already = facts.equipped.aspect === trait;
        setCost([]);
        write(() => session.source.equipAspect(already ? null : trait));
        return;
      }
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
   * The command that acts on the page rather than on whatever has focus, so it
   * is listened for on the document: a handler on the page body would miss every
   * press made while focus was inside a panel or a dialog. The two that open a
   * dialog belong to the header, which every page wears.
   *
   * `[` and `]` step the whole bar, Hub included: it is a tab, so stepping off
   * the first god has somewhere to go. Bracket keys rather than letters because
   * the quick-add's search box is coming and every unmodified letter spent here
   * is one it cannot type — the guard against typing is in the predicate either
   * way, which is what makes a document-level binding safe at all.
   */
  useEffect(() => {
    const press = (event: globalThis.KeyboardEvent) => {
      const way = godStep(event);
      if (way === null) return;
      const at = bar.findIndex((tab) => sameTab(tab, showing));
      const next = bar[Math.min(bar.length - 1, Math.max(0, at + way))];
      if (next === undefined || sameTab(next, showing)) return;
      event.preventDefault();
      setSelected(next);
    };
    document.addEventListener("keydown", press);
    return () => document.removeEventListener("keydown", press);
  }, [bar, showing]);

  /**
   * The Goals panel closes on a click outside it and on Escape.
   *
   * It lies over the right-hand end of the page, so the gesture people reach for
   * is clicking off it — the same one the **Action Sheet**'s shade already takes.
   * The panel is not a dialog and takes no shade of its own, since the page under
   * it stays live.
   *
   * **Every control that opens it is excluded, and deleting that exclusion is
   * how this got shipped broken once.** A discrete click flushes the effect that
   * registers this listener while the same click is still travelling to the
   * document, so without the exclusion the opening click reaches here and closes
   * the panel again — it never opened at all. The runner flushes effects at the
   * end of `act` instead, so a mutation there shows nothing. Hub's own control
   * is a second opener and needs the same exemption for the same reason.
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
      const opener = ".app__goalstoggle, .hub__opengoals";
      if (target.closest(`.app__goals, ${opener}, .sheet-scrim`) !== null) return;
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

  /**
   * The equipped form leads the list, which is where both games draw it: at the
   * top of Hades II's core column, and as the first tile of Hades I's expanded
   * panel. It is a trait record like any other, so it needs no special tile —
   * only a position.
   */
  const form = facts.equipped.aspect;
  if (form !== undefined && source.records[form] !== undefined) {
    entries.unshift({ view: view(form), slot: "Aspect", overridden: false });
  }

  const openedView = opened === null ? null : view(opened);

  /**
   * Whether there is a run here at all. A pin and no boons still counts:
   * somebody put it there.
   *
   * Two controls ask. The save screen's first slot shows what there is to
   * resume, and ending a run files it as the last one — which must not happen
   * for an empty run, since it would sit in front of the run it is meant to
   * remember.
   */
  const started = facts.held.size > 0 || intent.pins.size > 0;
  const stored = !started
    ? null
    : { held: facts.held.size, gods: facts.godPool.size, goals: intent.pins.size };

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
        <SiteHeader game={game}>
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
            started={started}
            /* Takes the boundary control's own place on a run with nothing to
               end, rather than standing beside it: there is one slot in the
               header for what acts on the run, and a disabled End run is not
               using it. */
            onReview={lastOverview === null ? null : () => setReviewing("run")}
            // The summary opens on the record, not on the run that was just in
            // memory — so what a player is shown is what was actually filed.
            onFinish={() =>
              session.finishRun().then(() => {
                setFiled((at) => at + 1);
                setReviewing("door");
              })
            }
            onClear={() => session.clearRun()}
            onFault={setFault}
          />
        </SiteHeader>

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
              {/* Pinned first, and outside the list the gods are drawn from —
                  which is what makes "never removable" structural rather than a
                  condition somebody has to remember. It carries no × because
                  removal is about the tabs a player put up. */}
              <button
                type="button"
                className="app__godtab app__hubtab"
                aria-current={showing.kind === "hub" ? "page" : undefined}
                title="Hub"
                onClick={() => setSelected(HUB)}
              >
                <HubGlyph className="app__godart" />
                <span className="visually-hidden">Hub</span>
              </button>
              {shownTabs.map((name) => (
                <span key={name} className="app__godslot">
                <button
                  type="button"
                  className="app__godtab"
                  aria-current={name === showingGod ? "page" : undefined}
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
                  onClick={() => setSelected({ kind: "god", god: name })}
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
              {/* One per weapon, after the gods and never removable: the set is
                  closed and every run is played with one of them, so there is
                  nothing here for a player to curate and no picker to hold what
                  is left over. No hue — a weapon is not a god, and an invented
                  colour would read as identity. */}
              {weapons.map((weapon) => (
                <button
                  key={weapon.id}
                  type="button"
                  className="app__godtab app__weapontab"
                  aria-current={weapon.id === showingWeapon ? "page" : undefined}
                  data-equipped={facts.equipped.weapon === weapon.id}
                  title={weapon.name ?? weapon.id}
                  // Which weapon the run is played with is a fact about the run
                  // and shows on the tab the way the pool does on a god's, so
                  // it goes in the name for a reader who gets no styling.
                  aria-label={
                    facts.equipped.weapon === weapon.id
                      ? `${weapon.name ?? weapon.id} — your weapon`
                      : undefined
                  }
                  onClick={() => setSelected({ kind: "weapon", weapon: weapon.id })}
                >
                  {/* The weapon drawn as its default form — the only picture
                      of a weapon either game keeps. Same as a god tab: the
                      shape is the control, and the name is what it is called
                      rather than what it draws. */}
                  <WeaponArt game={game} weapon={weapon.id} className="app__godart" />
                  <span className="visually-hidden">{weapon.name ?? weapon.id}</span>
                </button>
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
            coreSlots={LOADOUT_SLOTS[game]}
            equipped={equippedItems(facts, game, source)}
            // A total over the panel: which element a boon counts toward is on
            // the node in the God View, and how many the run has is this.
            elements={facts.elements}
            expanded={loadoutOpen}
            onExpanded={setLoadoutOpen}
            detailOf={(trait) => deriveNodeDetail(source, view(trait), facts, intent.pins)}
            actions={actions}
          />

          {/* The two things this column can be. A null page is exactly Hub,
              which is a tab rather than a god and so has no graph. */}
          {page === null ? (
            /* No heading of its own: the tab that opened it is the label, and
               the two regions inside carry their own. */
            <section className="app__ladder">
              <Hub
                held={facts.held.size}
                pooled={[...facts.godPool]}
                goals={goals}
                onGod={(name) => setSelected({ kind: "god", god: name })}
                onGoals={() => setGoalsOpen(true)}
              />
            </section>
          ) : (
            <section className="app__ladder">
              {/* A weapon page carries no boon: what is on it is the forms the
                  weapon can take and the hammer upgrades it is offered. */}
              <h2>{page.god === null ? "Aspects and hammers" : "Boons"}</h2>
              <GodPage
                graph={page.graph}
                views={boonViews}
                nameOf={source.naming.trait}
                pinned={intent.pins}
                onMark={markOrOpen}
                onOpen={setOpened}
                onGoal={toggleGoal}
              />
            </section>
          )}
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

        {/* Instead of the door rather than over it: reviewing the last run is
            reached from the save screen, and closing goes back to it. Two
            shades stacked would be one dialog behind another with no way of
            reading which is which. */}
        {reviewing === null || lastOverview === null ? null : (
          <RunOverview
            run={lastOverview}
            onClose={() => {
              const back = reviewing;
              setReviewing(null);
              if (back === "door") onReturnToDoor();
            }}
            /* Only on a run with nothing in it. There is one active slot, so
               adopting the filed run over a run somebody is playing would
               overwrite it with no record left anywhere — and a fresh run is
               where a player wants this anyway, having just ended one. */
            onReopen={
              started
                ? undefined
                : () => {
                    void session
                      .resumeLastRun()
                      .then(() => {
                        setFiled((at) => at + 1);
                        setReviewing(null);
                        onChosen();
                      })
                      .catch((cause: unknown) => {
                        setFault(cause instanceof Error ? cause : new Error(String(cause)));
                      });
                  }
            }
          />
        )}

        {/* The door, over the page rather than in front of it: dismissing it
            is the same as continuing, which is what makes Escape safe here. */}
        {!choosing || reviewing !== null ? null : (
          <SaveScreen
            run={stored}
            onResume={onChosen}
            onNew={() => {
              // Filed rather than discarded: a run somebody is leaving behind
              // is still the run they played, and that is what `last` is for.
              if (started) {
                void session
                  .finishRun()
                  // The record this files is what the summary reads, so the
                  // read has to run again — without it the door and the header
                  // go on offering the run *before* this one until a reload.
                  .then(() => setFiled((at) => at + 1))
                  .catch((cause: unknown) => {
                    setFault(cause instanceof Error ? cause : new Error(String(cause)));
                  });
              }
              // The bar goes with the run: a god added to plan with belongs to
              // the run they were added for, and the pool half empties itself.
              onCurated(NO_TABS);
              setSelected(HUB);
              onChosen();
            }}
            onLeave={() => {
              window.location.hash = HOME_HASH;
            }}
            onReviewLast={lastOverview === null ? null : () => setReviewing("door")}
            lastRun={
              lastOverview === null
                ? null
                : {
                    held: lastOverview.held,
                    gods: lastOverview.gods,
                    goals: lastOverview.goals,
                  }
            }
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
 * Ending a run, and the one other way out of it.
 *
 * One control rather than two: the ordinary end is the button, and throwing the
 * run away without filing it is revealed under the pointer. The destructive half
 * is then a variant of the gesture rather than a second control of equal weight
 * standing beside it.
 */
function EndRun({
  started,
  onFinish,
  onClear,
  onFault,
  onReview,
}: {
  /** False before the run holds anything; see below. */
  readonly started: boolean;
  readonly onFinish: () => Promise<void>;
  readonly onClear: () => Promise<void>;
  readonly onFault: (cause: Error) => void;
  /** Opens the summary of the run filed last, where there is one. */
  readonly onReview: (() => void) | null;
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

  /**
   * Both verbs are off until the run holds something.
   *
   * Ending an empty run files it as the last one, which overwrites the run a
   * player actually played — and the only way to reach that is by mistake,
   * since there is nothing to end. Skipping the summary goes with it: the menu
   * is not rendered, so hovering the wrapper cannot open it either.
   */
  /**
   * With nothing to end and a run already filed, this slot carries the way back
   * to that run's summary instead.
   *
   * One control in the header acts on the run, and a greyed-out End run is that
   * control saying nothing. The moment it has nothing to say is exactly the
   * moment the previous run is what a player is thinking about — they have just
   * finished it. Where nothing is filed either, the greyed control stays, since
   * *why* it is off is then the only thing there is to say.
   */
  if (!started && onReview !== null) {
    return (
      <div className="app__end">
        <button type="button" className="app__finish app__lastrun" onClick={onReview}>
          Last run
        </button>
      </div>
    );
  }

  return (
    <div className="app__end" {...wrapper}>
      <button
        type="button"
        ref={opener}
        className="app__finish"
        disabled={!started}
        title={started ? undefined : "Nothing to end yet — mark a boon first."}
        onClick={() => run(onFinish)}
      >
        End run
      </button>
      {!open || !started ? null : (
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
function equippedItems(
  facts: RunFacts,
  game: GameId,
  source: NodeSource,
): { label: string; value: string }[] {
  const items: { label: string; value: string }[] = [];
  const { weapon, aspect, keepsake } = facts.equipped;
  // Names rather than ids. Nothing wrote these fields until the weapon page
  // did, so the raw id had never been in front of anyone.
  if (weapon !== undefined) {
    items.push({ label: "Weapon", value: weaponFor(game, weapon)?.name ?? weapon });
  }
  if (aspect !== undefined) items.push({ label: "Aspect", value: source.naming.trait(aspect) });
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
