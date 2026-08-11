import {
  type RunStore,
  type TabPresence,
  type Timers,
  createIdbStore,
  createMemoryStore,
  createTabPresence,
} from "@repo/sync";

/**
 * Where the browser is allowed to exist.
 *
 * Every package below this one describes the platform structurally and takes it
 * as a parameter, which is what keeps a clock and a database out of the pure
 * half where no lint could see them. This file is the other end of that: the
 * one place that reaches for a global, and the one place a second host — a
 * test, a desktop shell, a server render — would replace.
 */

/**
 * Storage, or an honest substitute for it.
 *
 * Only the outright-absent case can be answered here. Wrapping the factory opens
 * nothing — a browser that has taken storage away says so by *rejecting* the
 * first `open`, which the session catches and this cannot. A private window is
 * usually not that case: Chrome gives incognito a real IndexedDB, thrown away
 * when the window closes.
 */
export function browserStore(): { store: RunStore; persistent: boolean } {
  if (globalThis.indexedDB == null) return { store: createMemoryStore(), persistent: false };
  return { store: createIdbStore(globalThis.indexedDB), persistent: true };
}

/**
 * The multi-tab warning, which is the whole mitigation for two tabs sharing one
 * database and writing last-one-wins.
 *
 * Null where the browser has no `BroadcastChannel` — the warning is then absent
 * rather than wrong, which is the right way round: a page claiming to watch for
 * something it cannot see is worse than one that says nothing.
 */
export function tabPresence(tabId: string): TabPresence | null {
  if (globalThis.BroadcastChannel === undefined) return null;

  const timers: Timers = {
    setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
    clearInterval: (handle) => {
      globalThis.clearInterval(handle as ReturnType<typeof setInterval>);
    },
  };
  return createTabPresence({
    channel: new globalThis.BroadcastChannel("hades-handbook"),
    timers,
    now: () => Date.now(),
    tabId,
  });
}

/** Distinguishes this tab from the others, and needs nothing better than this. */
export function newTabId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Registers the service worker and reloads once when a new one takes over.
 *
 * The precache holds the built shell — scripts, stylesheet, page, manifest — and
 * both games' catalogs are compiled into those scripts, so a data change is a
 * bundle change and reaches an installed copy the way a code change does. What
 * it cannot do on its own is reach the copy already open: the running worker
 * keeps serving what it precached, so a page can go on rendering a run against
 * data the player cannot see. That happened three times while these components
 * were being built, each time looking like a fix that had not shipped, and the
 * cure was clearing caches by hand.
 *
 * So the worker takes over immediately and this reloads once when it does.
 * Guarded, because `controllerchange` also fires the first time a worker claims
 * an uncontrolled page and an unguarded reload there is a loop with no way out.
 * The run is in IndexedDB and survives it.
 */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator)) return;

  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Nothing was controlling this page, so nothing it is showing is stale.
    if (reloading || navigator.serviceWorker.controller === null) return;
    reloading = true;
    globalThis.location.reload();
  });

  globalThis.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
