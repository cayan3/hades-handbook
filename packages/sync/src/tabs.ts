import type { Unsub } from "./port.js";

/**
 * The messaging channel two tabs of the same site share, described structurally
 * for the same reason IndexedDB is, i.e. that no browser types are in scope
 * anywhere in this workspace, and taking the channel as a parameter is what
 * lets a test open two "tabs" without an actual yk browser lol.
 */
export interface BroadcastChannelLike {
  postMessage(message: unknown): void;
  /**
   * `any` because a parameter position is contravariant: the real `onmessage`
   * is `(ev: MessageEvent) => any`, and the `{ data: unknown }` we actually
   * read is not assignable to `MessageEvent`, so declaring what we read is what
   * refuses the real channel. Widened here and narrowed again where it is
   * assigned, so the code inside stays typed. Required rather than optional,
   * unlike the store's handlers: nothing ever fires this without an event.
   */
  onmessage: ((event: any) => void) | null;
  close(): void;
}

/**
 * Just enough of a timer API to run a heartbeat :salute: :salute:. The handle
 * is opaque bc the browser and the test runner disagree about what one even is
 * rip, and nothing here needs to know anyway.
 */
export interface Timers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface TabPresence {
  /** Whether another tab of this site is open right now. */
  readonly otherTabOpen: boolean;
  /** Called whenever that answer changes (not when it only repeats). */
  subscribe(cb: (otherTabOpen: boolean) => void): Unsub;
  close(): void;
}

export interface TabPresenceOptions {
  channel: BroadcastChannelLike;
  timers: Timers;
  /** Milliseconds; something a tab can be trusted to still be alive within. */
  now(): number;
  /**
   * Distinguishes this tab from the others. Supplied instead of generated so
   * that this file needs no source of randomness and a test can name its tabs.
   */
  tabId: string;
  heartbeatMs?: number;
}

interface Heartbeat {
  kind: "hades-handbook/tab";
  tabId: string;
}

function isHeartbeat(data: unknown): data is Heartbeat {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as Partial<Heartbeat>).kind === "hades-handbook/tab" &&
    typeof (data as Partial<Heartbeat>).tabId === "string"
  );
}

const DEFAULT_HEARTBEAT_MS = 2000;

/**
 * Notices when the same run is open in more than one tab.
 *
 * Storage is shared across every tab on the origin and writes are last one
 * wins, so two tabs editing one run will quietly overwrite each other. v1 of
 * this project doesn't coordinate those writes; instead, it tells the user,
 * which is the difference between losing an hour of a run and just yk choosing
 * which tab to close lol.
 *
 * This is a heartbeat instead of a single announcement on open bc the useful
 * signal is "another tab is open *now*". A tab that announces itself and is
 * then closed would leave a warning that never goes away, and a warning that's
 * sometimes wrong is one users that learn to dismiss without even erm reading
 * meep. Presence expires if nothing is heard for two beats (since one missed
 * beat is a busy tab while two is a tab that's actually yk gone :salute: :salute:).
 */
export function createTabPresence(options: TabPresenceOptions): TabPresence {
  const { channel, timers, now, tabId } = options;
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const expireAfter = heartbeatMs * 2;

  const lastSeen = new Map<string, number>();
  const listeners = new Set<(otherTabOpen: boolean) => void>();
  let otherTabOpen = false;
  let closed = false;

  function recompute(): void {
    const cutoff = now() - expireAfter;
    for (const [id, seen] of lastSeen) if (seen <= cutoff) lastSeen.delete(id);
    const next = lastSeen.size > 0;
    if (next === otherTabOpen) return;
    otherTabOpen = next;
    for (const listener of listeners) listener(next);
  }

  function beat(): void {
    channel.postMessage({ kind: "hades-handbook/tab", tabId } satisfies Heartbeat);
  }

  channel.onmessage = (event: { data: unknown }) => {
    if (closed || !isHeartbeat(event.data) || event.data.tabId === tabId) return;
    lastSeen.set(event.data.tabId, now());
    recompute();
  };

  /**
   * Beat once immediately so a tab opening beside an existing one is noticed
   * by that one within a message instead of within a beat. The reverse
   * direction is covered by the existing tab's own next beat :nod: :nod:.
   */
  beat();
  const handle = timers.setInterval(() => {
    beat();
    recompute();
  }, heartbeatMs);

  return {
    get otherTabOpen() {
      return otherTabOpen;
    },

    subscribe(cb: (otherTabOpen: boolean) => void): Unsub {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },

    close(): void {
      closed = true;
      timers.clearInterval(handle);
      channel.onmessage = null;
      channel.close();
      listeners.clear();
    },
  };
}
