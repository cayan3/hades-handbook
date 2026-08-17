import type { GameId } from "@repo/core";
import { useSyncExternalStore } from "react";

/**
 * Where the site's pages live in the URL.
 *
 * A hash rather than a path, because the product ships as a static bundle on a
 * host with no configuration: a path route 404s on a cold load unless somebody
 * wires a rewrite, and "no server configuration" is the whole of how this is
 * meant to be published.
 *
 * Home is the bare URL now that it has content — the games sit behind their own
 * hashes, which is what lets a player link to one and what makes the save screen
 * a door rather than a state.
 */
export type Route =
  | { readonly kind: "home" }
  | { readonly kind: "getting-started" }
  | { readonly kind: "game"; readonly game: GameId };

export const GAME_HASH: Readonly<Record<GameId, string>> = {
  hades1: "#/hades1",
  hades2: "#/hades2",
};

export const GETTING_STARTED_HASH = "#/getting-started";
/** Home is also every hash this app does not know, so this is the one it writes. */
export const HOME_HASH = "#/";

/**
 * One object per route, returned rather than rebuilt. `useSyncExternalStore`
 * compares snapshots by identity, so a fresh object per read is an infinite
 * render loop rather than a wasted allocation.
 */
const HOME: Route = { kind: "home" };
const GETTING_STARTED: Route = { kind: "getting-started" };
const GAME: Readonly<Record<GameId, Route>> = {
  hades1: { kind: "game", game: "hades1" },
  hades2: { kind: "game", game: "hades2" },
};

/**
 * Anything unrecognised is Home rather than a not-found page: the only links
 * into this app are its own, so a hash it does not know is a stale bookmark or
 * somebody's typo, and the front page is a better answer than an error.
 */
export function routeFor(hash: string): Route {
  if (hash === GETTING_STARTED_HASH) return GETTING_STARTED;
  for (const game of ["hades1", "hades2"] as const) {
    if (hash === GAME_HASH[game]) return GAME[game];
  }
  return HOME;
}

/** Read off the document rather than kept beside it: the URL is the state. */
export function useRoute(): Route {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener("hashchange", notify);
      return () => window.removeEventListener("hashchange", notify);
    },
    () => routeFor(window.location.hash),
    () => HOME,
  );
}
