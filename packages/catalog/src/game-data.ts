/**
 * The shape one game's extracted snapshot arrives in.
 *
 * In a module of its own so the registry and the two per-game modules can all
 * name it without a cycle: the registry imports the games dynamically, so a
 * game importing the type back off the registry would be one — and the import
 * cruiser sees a type-only import like any other.
 */
export interface GameData {
  readonly boons: unknown;
  readonly gods: unknown;
  readonly keepsakes: unknown;
  /** Codex prose, keyed by the `descriptionRef` a trait record names. */
  readonly descriptions: unknown;
  /** Mirror talents and their rows. Hades I only; both empty in Hades II. */
  readonly talents: unknown;
  readonly mirrorRows: unknown;
  /** The six weapons, and which forms each offers. Both games. */
  readonly weapons: unknown;
  /** Which game build this snapshot came from; becomes `RunFacts.dataVersion`. */
  readonly version: unknown;
}

/**
 * Written out rather than derived from a table of both games, which is what it
 * used to be: the table is what the split exists to remove, and a key type
 * taken off it would have kept both games' data in the entry chunk to compute.
 */
export type GameKey = "hades1" | "hades2";
