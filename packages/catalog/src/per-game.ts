import type { GameKey } from "./game-data.js";

/**
 * A table derived from one game's snapshot, built on the first ask.
 *
 * Five of these — the merged trait records, the pool gods, the forcing keepsakes,
 * the weapon table and `sync`'s catalog view — used to be built for both games as
 * their module loaded, which is where the split failed: importing the package at
 * all reached data nobody had fetched, so the throw came from an import rather
 * than a render. Still built once and handed back by identity, which is what
 * each of their own comments says it needs.
 *
 * Exported because the fifth one lives in another package and was found by
 * opening the app rather than by a test.
 */
export function perGame<T>(build: (game: GameKey) => T): (game: GameKey) => T {
  const made = new Map<GameKey, T>();
  return (game) => {
    if (!made.has(game)) made.set(game, build(game));
    return made.get(game) as T;
  };
}
