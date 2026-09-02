import type { GameId } from "@repo/core";
import { Help, PausePanel, Shortcuts, isHelpKey, isShortcutsKey } from "@repo/ui";
import { type ReactNode, useEffect, useState } from "react";
import { GAME_HASH, HOME_HASH } from "./route.js";

/**
 * The one header every page wears, and the only place the how-does-this-work
 * dialogs and the pause panel live — so they are reachable from a page with no
 * run as well as from one with a run in it.
 *
 * The run-wide controls arrive as children rather than as props: they act on a
 * session, which a page without a game does not have. The way to the save
 * screen is a prop instead, being a destination rather than something done to
 * a run, and it is what tells this header there is a game to pause.
 */
export function SiteHeader({
  game,
  onSaveSlots,
  children,
}: {
  /** Null on a page that is not one game's, which changes what the end holds. */
  readonly game: GameId | null;
  /**
   * The way to the save screen, on a game's page and absent everywhere else.
   * Its absence is what withholds the menu: a page with no game has nothing to
   * pause and two of the panel's four rows would lead nowhere.
   */
  readonly onSaveSlots?: () => void;
  readonly children?: ReactNode;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  /** Whether there is a game to pause, which is all the Escape binding needs. */
  const pausable = onSaveSlots !== undefined;

  useEffect(() => {
    const press = (event: globalThis.KeyboardEvent) => {
      if (isHelpKey(event)) {
        event.preventDefault();
        setHelpOpen(true);
      } else if (isShortcutsKey(event)) {
        event.preventDefault();
        setKeysOpen(true);
      } else {
        return;
      }
      // The key hands over rather than stacking, which is what the panel's own
      // Help row does: two scrims read as one dialog behind another, and both
      // would answer the same Escape.
      setPauseOpen(false);
    };
    document.addEventListener("keydown", press);
    return () => document.removeEventListener("keydown", press);
  }, []);

  /**
   * Escape opens the menu where nothing else is open — the second way in, the
   * control being the first, since a phone has no Escape at all.
   *
   * What is open is read off the document rather than tracked: everything that
   * takes this key listens here too and is still mounted when this runs, so a
   * query answers it without a flag anybody has to keep in step.
   */
  useEffect(() => {
    if (!pausable || pauseOpen) return;
    const press = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector(OPEN_ALREADY) !== null) return;
      setPauseOpen(true);
    };
    document.addEventListener("keydown", press);
    return () => document.removeEventListener("keydown", press);
    // On whether the prop is there rather than on the prop: this never calls it,
    // and the callback is rebuilt every render, so naming it would re-subscribe
    // the listener on every one.
  }, [pausable, pauseOpen]);

  return (
    <>
      <header className="app__head" data-game={game ?? undefined}>
        {/* The name leads to the site's own front page, which is what a
            product's name leads to everywhere else on the web. It takes the
            colour of whichever game is being read, so the page says which one
            it is before anything else on it does. */}
        <h1>
          <a className="app__name" href={HOME_HASH}>
            Hades Handbook
          </a>
        </h1>

        {game === null ? null : (
          /* The game being read comes first, so the mark that opens onto "you're
             here" is the one against the title and the other reads as the way
             out of it. */
          <nav className="app__games" aria-label="Game">
            {([game, game === "hades1" ? "hades2" : "hades1"] as const).map((id) => (
              <GameMark key={id} game={id} current={id === game} />
            ))}
          </nav>
        )}

        <div className="app__headend">
          {children}
          {onSaveSlots === undefined ? null : <MenuControl onOpen={() => setPauseOpen(true)} />}
          {game !== null ? null : <OpenHandbook />}
          {/* Game-agnostic, so it is on every page where the controls beside it
              are on none. */}
          <button
            type="button"
            className="app__help"
            aria-label="How to use this Handbook"
            onClick={() => setHelpOpen(true)}
          >
            <span aria-hidden="true">?</span>
          </button>
        </div>
      </header>

      {!pauseOpen || onSaveSlots === undefined ? null : (
        <PausePanel
          onContinue={() => setPauseOpen(false)}
          /* Closed as Help opens, in one update — so the panel's own focus
             hand-back runs first and Help returns to the same control. */
          onHelp={() => {
            setPauseOpen(false);
            setHelpOpen(true);
          }}
          onSaveSlots={() => {
            setPauseOpen(false);
            onSaveSlots();
          }}
          onHome={() => {
            setPauseOpen(false);
            window.location.hash = HOME_HASH;
          }}
        />
      )}
      {!helpOpen ? null : <Help onClose={() => setHelpOpen(false)} />}
      {!keysOpen ? null : <Shortcuts onClose={() => setKeysOpen(false)} />}
    </>
  );
}

/**
 * Everything that already answers Escape: any modal, and the Goals panel, which
 * is not one. The menu is the last thing this key means, so it opens only where
 * this finds nothing.
 */
const OPEN_ALREADY = '[role="dialog"], .app__goals';

/**
 * The way into the menu, carrying no text — the header's run cluster is three
 * controls wide on a phone and a fourth word crowds the two that say something.
 *
 * **Three stacked bars**, which is the glyph everyone already reads as a menu.
 * That is what it now opens: it was drawn as the save slots side by side while
 * it went straight to the save screen, and stacking them then would have
 * promised a menu that was not there.
 */
function MenuControl({ onOpen }: { readonly onOpen: () => void }) {
  return (
    <button type="button" className="app__menu" title="Menu" onClick={onOpen}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
        focusable="false"
      >
        <line x1="4" y1="6.5" x2="20" y2="6.5" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="17.5" x2="20" y2="17.5" />
      </svg>
      <span className="visually-hidden">Menu</span>
    </button>
  );
}

/**
 * One game, as its numeral. At rest it is a square in that game's colour;
 * hovering opens it to the right, and the rule sits exactly where the square's
 * edge was because the revealed half begins at that edge.
 */
function GameMark({ game, current }: { readonly game: GameId; readonly current: boolean }) {
  const name = game === "hades1" ? "Hades" : "Hades II";

  return (
    <a
      className="app__mark"
      data-game={game}
      data-current={current ? "true" : undefined}
      href={GAME_HASH[game]}
      aria-current={current ? "page" : undefined}
      // The visible half reads as a sentence and the hidden half is clipped
      // rather than removed, so the link says what it is in one piece instead.
      aria-label={current ? `${name} — you are here` : `Switch to ${name}`}
    >
      <span className="app__marknum" aria-hidden="true">
        {game === "hades1" ? "I" : "II"}
      </span>
      <span className="app__markmore" aria-hidden="true">
        <span className="app__markbar">|</span>
        {current ? "You're here!" : `Switch to ${name}`}
      </span>
    </a>
  );
}

/**
 * The way in from a page that is not a game's. It opens leftward — the right
 * edge is pinned and the label slides over — because it sits at the end of the
 * header and there is nothing to its right to push into.
 */
function OpenHandbook() {
  return (
    <span className="app__open">
      <span className="app__opentext">Open the Handbook</span>
      <span className="app__openmore">
        <span aria-hidden="true">→</span>
        {/* The games' own names, which is what every other surface calls them —
            "Hades I" is nobody's name for the first one. */}
        <a className="app__opengame" data-game="hades1" href={GAME_HASH.hades1}>
          Hades
        </a>
        <span aria-hidden="true">|</span>
        <a className="app__opengame" data-game="hades2" href={GAME_HASH.hades2}>
          Hades II
        </a>
      </span>
    </span>
  );
}
