import { describe, expect, it } from "vitest";
import { type BroadcastChannelLike, type Timers, createTabPresence } from "./tabs.js";

/**
 * A message bus that every fake channel joins hehe, so two "tabs" can actually
 * yk talk to each other yippee yippee. Real `BroadcastChannel` doesn't deliver
 * a tab its own messages, and neither does this (a channel that heard itself
 * would report every single tab as having company; which is tbh kind of sad
 * :pensive: pensive: poor lil guy(s) :pensive: :pensive:).
 */
class Bus {
  private readonly channels = new Set<FakeChannel>();

  open(): BroadcastChannelLike {
    const channel = new FakeChannel(this);
    this.channels.add(channel);
    return channel;
  }

  deliver(from: FakeChannel, message: unknown): void {
    for (const channel of this.channels) {
      if (channel !== from) channel.receive(message);
    }
  }

  leave(channel: FakeChannel): void {
    this.channels.delete(channel);
  }
}

class FakeChannel implements BroadcastChannelLike {
  onmessage: ((event: { data: unknown }) => void) | null = null;

  constructor(private readonly bus: Bus) {}

  postMessage(message: unknown): void {
    this.bus.deliver(this, message);
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: message });
  }

  close(): void {
    this.bus.leave(this);
  }
}

/**
 * A clock and a timer wheel driven by hand. Fake timers would work too; this
 * way the test says exactly how much time passed and in what order beats fire,
 * which is yk the whole of what the expiry rule turns on lol.
 */
class Clock implements Timers {
  private millis = 0;
  private readonly ticks = new Map<object, { fn: () => void; every: number; next: number }>();

  now = (): number => this.millis;

  setInterval(fn: () => void, every: number): unknown {
    const handle = {};
    this.ticks.set(handle, { fn, every, next: this.millis + every });
    return handle;
  }

  clearInterval(handle: unknown): void {
    this.ticks.delete(handle as object);
  }

  advance(by: number): void {
    const until = this.millis + by;
    for (;;) {
      let due: { fn: () => void; every: number; next: number } | undefined;
      for (const tick of this.ticks.values()) {
        if (tick.next <= until && (due === undefined || tick.next < due.next)) due = tick;
      }
      if (due === undefined) break;
      this.millis = due.next;
      due.next += due.every;
      due.fn();
    }
    this.millis = until;
  }
}

function tab(bus: Bus, clock: Clock, tabId: string) {
  return createTabPresence({
    channel: bus.open(),
    timers: clock,
    now: clock.now,
    tabId,
    heartbeatMs: 100,
  });
}

describe("a single tab", () => {
  it("reports no company", () => {
    const bus = new Bus();
    const clock = new Clock();

    const only = tab(bus, clock, "a");
    clock.advance(500);

    expect(only.otherTabOpen).toBe(false);
  });
});

describe("a second tab opening", () => {
  it("is noticed by the first one straight away", () => {
    const bus = new Bus();
    const clock = new Clock();
    const first = tab(bus, clock, "a");

    const second = tab(bus, clock, "b");

    // The opening tab beats immediately, so the tab already there hears it
    // within a message instead of within a beat.
    expect(first.otherTabOpen).toBe(true);
    expect(second.otherTabOpen).toBe(false);
  });

  it("notices the first one on its next beat", () => {
    const bus = new Bus();
    const clock = new Clock();
    tab(bus, clock, "a");
    const second = tab(bus, clock, "b");

    clock.advance(100);

    expect(second.otherTabOpen).toBe(true);
  });

  it("tells subscribers, once per change and not per beat", () => {
    const bus = new Bus();
    const clock = new Clock();
    const first = tab(bus, clock, "a");
    const seen: boolean[] = [];
    first.subscribe((open) => seen.push(open));

    tab(bus, clock, "b");
    clock.advance(500);

    expect(seen).toEqual([true]);
  });
});

describe("a message that is not a heartbeat", () => {
  /**
   * The channel arrives as a parameter, so this file doesn't own the name it
   * was opened under and can't assume that it's the only thing talking on it.
   * The `kind` tag is everything that separates a tab from anything else the
   * app might broadcast later; without it, one unrelated message carrying a
   * string field registers a tab that erm doesn't exist rip, and the user is
   * told to close a window they don't actually have open lol.
   */
  it("registers no company", () => {
    const bus = new Bus();
    const clock = new Clock();
    const only = tab(bus, clock, "a");
    const stranger = bus.open();

    stranger.postMessage({ tabId: "b" });
    stranger.postMessage({ kind: "something/else", tabId: "b" });
    stranger.postMessage({ kind: "hades-handbook/tab" });
    stranger.postMessage({ kind: "hades-handbook/tab", tabId: 7 });
    stranger.postMessage("hello");
    stranger.postMessage(null);

    expect(only.otherTabOpen).toBe(false);
  });
});

describe("a tab that goes away", () => {
  /**
   * Presence has to expire, or a tab that was closed would leave a warning
   * for the rest of the session (and a warning that's sometimes wrong would
   * make users learn to dismiss without actually yk reading them lol). This is
   * two missed beats instead of one, so a busy tab isn't mistaken for a tab
   * that's actually yk closed.
   */
  it("stops counting as company after two missed beats", () => {
    const bus = new Bus();
    const clock = new Clock();
    const first = tab(bus, clock, "a");
    const second = tab(bus, clock, "b");
    clock.advance(100);
    expect(first.otherTabOpen).toBe(true);

    second.close();
    clock.advance(100);
    expect(first.otherTabOpen).toBe(true);

    clock.advance(200);
    expect(first.otherTabOpen).toBe(false);
  });

  it("stops beating and listening once closed", () => {
    const bus = new Bus();
    const clock = new Clock();
    const first = tab(bus, clock, "a");

    first.close();
    tab(bus, clock, "b");
    clock.advance(500);

    expect(first.otherTabOpen).toBe(false);
  });
});

describe("three tabs", () => {
  it("keep reporting company while any one of them is still there", () => {
    const bus = new Bus();
    const clock = new Clock();
    const first = tab(bus, clock, "a");
    const second = tab(bus, clock, "b");
    tab(bus, clock, "c");
    clock.advance(100);

    second.close();
    clock.advance(300);

    expect(first.otherTabOpen).toBe(true);
  });
});
