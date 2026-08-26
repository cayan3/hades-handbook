import type { GameData, GameKey } from "./game-data.js";

/**
 * The registry over the extracted snapshots, and the one place a game's data
 * is fetched.
 *
 * The files themselves live in a module per game, imported dynamically by
 * `loadGame` and by nothing else. That is the whole of the code split: a run
 * reads one game, so bundling both put the other game's ~34 or ~46 kB gzip in
 * front of every visitor, and the front page — the page a stranger lands on —
 * paid for both and read neither.
 *
 * **Everything downstream stays synchronous.** `traitsFor`, `godsFor`, the
 * asset resolver, both rules packages and the sync catalog view all call
 * `dataFor` in the middle of a render or an evaluation, so making that async
 * would have made the whole stack async to defer two files. The await happens
 * once, at the route, where the app is already waiting on a run to open.
 *
 * Purposefully untyped beyond `unknown` bc these files are the extractor's own
 * output shape, which isn't (yet) the shape we want for the app itself. There
 * are still some field names and nullability rules that differ, but reconciling
 * them is the schema's job so we shouldn't declare an interface for them here.
 * Big-picture-wise, the "loading" is what was literally missing, while the
 * "validating" of everything actually being correct is owned by the schema.
 *
 * The Codex descriptions are here now, and they arrive by the route that was
 * always the condition for shipping them: `textFor` exists, so withdrawing the
 * games' own prose is one function body rather than a sweep. Only the entries a
 * record points at are carried, and the markup is resolved at extraction time,
 * so what ships is prose rather than the whole help file.
 */

export type { GameData, GameKey } from "./game-data.js";

const loaded = new Map<GameKey, GameData>();
/** Kept so that two callers asking at once share one fetch rather than racing. */
const loading = new Map<GameKey, Promise<void>>();

/**
 * Fetches one game's snapshot, and is idempotent.
 *
 * A switch rather than a template literal in the import, which would have a
 * bundler match every sibling module by pattern and quietly widen the chunk
 * back out to whatever else the directory holds.
 */
export async function loadGame(game: GameKey): Promise<void> {
  if (loaded.has(game)) return;
  const already = loading.get(game);
  if (already !== undefined) return already;

  const fetching = (async () => {
    switch (game) {
      case "hades1": {
        const module = await import("./data-hades1.js");
        loaded.set(game, module.data);
        return;
      }
      case "hades2": {
        const module = await import("./data-hades2.js");
        loaded.set(game, module.data);
        return;
      }
    }
  })().finally(() => {
    loading.delete(game);
  });

  loading.set(game, fetching);
  return fetching;
}

/** Whether a game's snapshot is here, which is what a caller awaits on. */
export function isLoaded(game: GameKey): boolean {
  return loaded.has(game);
}

/**
 * One game's snapshot, or a throw.
 *
 * Throwing is the point. A code split's one failure that still looks like it
 * works is the half-load: hand back an empty table and every god has no boons,
 * every page draws nothing, and nothing anywhere reports a problem. So the
 * absence is loud, and it is a programming error rather than a thing a user can
 * cause — `loadGame` is awaited before any surface that reads this renders.
 */
export function dataFor(game: GameKey): GameData {
  const data = loaded.get(game);
  if (data === undefined) {
    throw new Error(`${game} data has not been loaded; await loadGame("${game}") first`);
  }
  return data;
}
