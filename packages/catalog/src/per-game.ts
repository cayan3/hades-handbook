import type { GameKey } from "./game-data.js";

/**
 * A table derived from one game's snapshot, built on the first ask.
 *
 * Four of these — the merged trait records, the pool gods, the forcing
 * keepsakes and the weapon table — used to be built for both games as their
 * module loaded, and that is where the split first failed: importing the
 * catalog at all reached data nobody had fetched yet, so the throw fired from
 * an import rather than from a render.
 *
 * Still built once and handed back by identity, which is what every one of
 * those comments says it needs: a snapshot fixes the answer, and the callers
 * are renders and feasibility questions asking over and over.
 */
export function perGame<T>(build: (game: GameKey) => T): (game: GameKey) => T {
  const made = new Map<GameKey, T>();
  return (game) => {
    if (!made.has(game)) made.set(game, build(game));
    return made.get(game) as T;
  };
}
