import type { GameId, RunFacts, RunIntent } from "@repo/core";
import {
  type RunSession,
  type RunStore,
  type SourceCondition,
  type TabPresence,
  createMemoryStore,
  openRunSession,
} from "@repo/sync";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

/**
 * Where the run reaches React.
 *
 * The packages below describe a source as a subscription plus a getter, which
 * is exactly the pair `useSyncExternalStore` wants, so each of these is four
 * lines and none of them keeps a copy of anything. Copying run state into
 * component state is the mistake this shape exists to prevent: two answers to
 * one question, and the wrong one on screen whenever a write lands between
 * renders.
 *
 * The binding lives in the app rather than in the component library. The
 * library takes derived values and computes nothing, which is what lets its
 * sentences be tested without a store or a document; a hook that subscribes
 * would be the first thing in there that needs both.
 */

/** The run facts a view reads: the source's, with hand-held fields laid over. */
export function useFacts(session: RunSession): RunFacts {
  return useSyncExternalStore(
    // Through the *layer*, never the source. Reading the source directly is the
    // one mistake that makes hand-held fields silently stop working: everything
    // still renders, and the overrides simply never appear in an answer.
    useCallback((notify) => session.layer.subscribe(notify), [session]),
    useCallback(() => session.layer.getFacts(), [session]),
  );
}

/** Pins, plans and notes, which the port cannot carry and a second one does. */
export function useIntent(session: RunSession): RunIntent {
  return useSyncExternalStore(
    useCallback((notify) => session.source.subscribeIntent(notify), [session]),
    useCallback(() => session.source.getState().intent, [session]),
  );
}

/** What the source has to say about itself: notices, failures, the last edit. */
export function useCondition(session: RunSession): SourceCondition {
  return useSyncExternalStore(
    useCallback((notify) => session.source.subscribeCondition(notify), [session]),
    useCallback(() => session.source.getCondition(), [session]),
  );
}

/** Whether the same origin has another tab open, which is last-write-wins. */
export function useOtherTabOpen(presence: TabPresence | null): boolean {
  return useSyncExternalStore(
    useCallback(
      (notify) => (presence === null ? () => {} : presence.subscribe(() => notify())),
      [presence],
    ),
    useCallback(() => presence?.otherTabOpen ?? false, [presence]),
  );
}

/** A session being opened, open, or refused before it opened. */
export type SessionState =
  | { readonly kind: "opening" }
  | {
      readonly kind: "open";
      readonly session: RunSession;
      /** False when the store refused and this run lives in memory only. */
      readonly persistent: boolean;
    }
  | { readonly kind: "failed"; readonly cause: Error };

/**
 * Opens the run for a game and closes it again when the game changes.
 *
 * One call does the wiring: the source and the overlay over it are opened
 * together and ended together, because the run *boundary* is the thing neither
 * of them can own alone.
 *
 * The stale guard is not decoration. Opening is asynchronous and a player can
 * switch games while a load is in flight, at which point two sessions exist and
 * the slower one would win by arriving last — over a run belonging to the other
 * game.
 */
export function useRunSession(game: GameId, store: RunStore): SessionState {
  const [state, setState] = useState<SessionState>({ kind: "opening" });

  useEffect(() => {
    let current = true;
    let opened: RunSession | null = null;
    setState({ kind: "opening" });

    /**
     * A store that refuses gets a run in memory rather than a dead page.
     *
     * The first `load` is where a browser says it will not give us storage — a
     * private window in some browsers, blocked cookies, an evicted origin — and
     * it says it by rejecting, so nothing earlier can catch it. Refusing to
     * start is the wrong answer to that: the whole product works without a
     * store, it just does not survive a reload, and this is the same bargain
     * the quarantine makes one level down. It is loud rather than silent,
     * because the caller shows a notice for exactly this.
     */
    void openRunSession({ game, store })
      .then((session) => ({ session, persistent: true }))
      .catch(() => openRunSession({ game, store: createMemoryStore() }).then(
        (session) => ({ session, persistent: false }),
      ))
      .then(
        ({ session, persistent }) => {
          if (!current) {
            session.close();
            return;
          }
          opened = session;
          setState({ kind: "open", session, persistent });
        },
        (cause: unknown) => {
          if (!current) return;
          setState({
            kind: "failed",
            cause: cause instanceof Error ? cause : new Error(String(cause)),
          });
        },
      );

    return () => {
      current = false;
      opened?.close();
    };
  }, [game, store]);

  return state;
}

/**
 * Runs a write and keeps the exception off the screen.
 *
 * The write-side guards throw deliberately: every id a view can hand them came
 * off a catalog-driven list, so one the catalog does not have is a programming
 * error, and a guard that returned quietly would let a run fill with ids nothing
 * can name. But a throw out of a tap handler unmounts the tree, and losing the
 * page is a worse answer than losing the tap.
 *
 * So every write comes through here. The run is untouched — the guards all run
 * before the first write, which is what makes that true — the gesture is
 * dropped, and the fault is reported where somebody can quote it.
 */
export function attempt(report: (fault: Error) => void, write: () => void): void {
  try {
    write();
  } catch (cause) {
    report(cause instanceof Error ? cause : new Error(String(cause)));
  }
}
