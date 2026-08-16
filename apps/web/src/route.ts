import { useSyncExternalStore } from "react";

/**
 * Where the site's two pages live in the URL.
 *
 * A hash rather than a path, because the product ships as a static bundle on a
 * host with no configuration: a path route 404s on a cold load unless somebody
 * wires a rewrite, and "no server configuration" is the whole of how this is
 * meant to be published.
 *
 * The app keeps the bare URL and the site page sits behind the hash, which is
 * the way round that leaves an installed app opening on the run. The hash reads
 * `about` and not `home` because the bar's first tab is already Home, and one
 * word for two surfaces is how a reader ends up at the wrong one.
 */
export type Route = "app" | "about";

export const ABOUT_HASH = "#/about";

export function routeFor(hash: string): Route {
  return hash === ABOUT_HASH ? "about" : "app";
}

/** Read off the document rather than kept beside it: the URL is the state. */
export function useRoute(): Route {
  return useSyncExternalStore(
    (notify) => {
      window.addEventListener("hashchange", notify);
      return () => window.removeEventListener("hashchange", notify);
    },
    () => routeFor(window.location.hash),
    () => "app" as const,
  );
}
