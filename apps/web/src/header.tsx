import type { GameId } from "@repo/core";
import { Help, Shortcuts, isHelpKey, isShortcutsKey } from "@repo/ui";
import { type ReactNode, useEffect, useState } from "react";
import { GAME_HASH, HOME_HASH } from "./route.js";

/**
 * The one header every page wears, and the only place the two how-does-this-work
 * dialogs live — so they are reachable from a page with no run as well as from
 * one with a run in it.
 *
 * The run-wide controls arrive as children rather than as props: they act on a
 * session, which a page without a game does not have.
 */
export function SiteHeader({
  game,
  children,
}: {
  /** Null on a page that is not one game's, which changes what the end holds. */
  readonly game: GameId | null;
  readonly children?: ReactNode;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);

  useEffect(() => {
    const press = (event: globalThis.KeyboardEvent) => {
      if (isHelpKey(event)) {
        event.preventDefault();
        setHelpOpen(true);
      } else if (isShortcutsKey(event)) {
        event.preventDefault();
        setKeysOpen(true);
      }
    };
    document.addEventListener("keydown", press);
    return () => document.removeEventListener("keydown", press);
  }, []);

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

      {!helpOpen ? null : <Help onClose={() => setHelpOpen(false)} />}
      {!keysOpen ? null : <Shortcuts onClose={() => setKeysOpen(false)} />}
    </>
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
