import type { RunFacts } from "@repo/core";

/**
 * The seam every consumer reads run state through.
 *
 * It is internal. Nothing about it reaches a user: manual entry is "open a URL"
 * and nothing else, and the port exists so that a later mod bridge is one new
 * class rather than a change to every view. That only holds while the rule
 * holds — components read facts from here, never from a module-level value some
 * source happens to write.
 *
 * Facts only. Pins, plans and notes are the user's own and no source produces
 * or overwrites them, which is what keeps "what I plan" from changing "what is
 * reachable". A source that could write intent would make that a convention
 * instead of a guarantee.
 */
export interface RunStateSource {
  /** Everything the source currently believes is true about the run. */
  getFacts(): RunFacts;

  /** Called on every change, with the facts as they now stand. */
  subscribe(cb: (facts: RunFacts) => void): Unsub;

  readonly status: SourceStatus;

  readonly capabilities: SourceCapabilities;
}

export type Unsub = () => void;

/**
 * Whether the source is currently producing facts.
 *
 * A manual source is always connected — it is the user, and the user is here.
 * The other two describe a bridge whose transport can drop, which is the only
 * reason this is not a boolean.
 */
export type SourceStatus = "connected" | "disconnected" | "error";

export interface SourceCapabilities {
  /**
   * Whether facts can be written back through this source. True for manual
   * entry, false for a bridge that only reports what the game says.
   */
  canWrite: boolean;
}
