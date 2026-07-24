import type {
  AspectId,
  Element,
  GameId,
  GodId,
  KeepsakeId,
  Rarity,
  ResourceId,
  SlotId,
  TraitId,
} from "./ids.js";

/**
 * Everything true about the current run, split by provenance.
 *
 * One flat shape for both games. The split is not organisational: it *is* the
 * conflict policy for external run-state sources. A source writes `facts` and
 * never touches `intent`, and evaluation reads `facts` only — which makes
 * "what the user plans cannot change what is satisfiable" a type guarantee
 * rather than a convention.
 */
export interface RunState {
  facts: RunFacts;
  intent: RunIntent;
}

/** Game-derived run state. An external source may overwrite any of this. */
export interface RunFacts {
  game: GameId;
  /** Which extracted data snapshot these ids belong to. */
  dataVersion: string;

  held: Map<TraitId, HeldTrait>;
  /**
   * Gods the run has actually taken a reward from. Stored, not derived from
   * `held`: a keepsake-forced or offered-but-declined god has no held boon, and
   * purging a god's only boon does not free the slot — the game records the
   * pickup and never undoes it.
   */
  godPool: Set<GodId>;
  /** Empty for hades1. */
  elements: Map<Element, number>;
  slots: Map<SlotId, TraitId | null>;
  loadout: { weapon?: string; aspect?: AspectId; keepsake?: KeepsakeId };
  resources: Map<ResourceId, number>;
  /** Modelled and honoured by evaluation; never populated in v1. */
  bans: Set<TraitId>;
  /**
   * How far into the run we are, as 1-based counters — ordering is all that
   * matters, so never region *names*, which differ per game and would make this
   * type game-aware. Absent when the source cannot supply it.
   *
   * The god-pool cap is soft: an absent god's keepsake pulls that god in past
   * it, and keepsakes are swappable each region, so how many keepsake
   * opportunities remain is what decides whether a god is genuinely
   * unreachable. With no progress, treat a god as still reachable — wrongly
   * declaring one unreachable is the most damaging error this engine can make.
   */
  progress?: { region: number; chamber: number };
}

/** `level` 1 = base. Rarity is state, not drop probability. */
export interface HeldTrait {
  rarity: Rarity;
  level: number;
}

/** User-authored state. Never written by an external run-state source. */
export interface RunIntent {
  /** Pinned targets. A pinned target *is* its progress-tracking entry. */
  pins: Set<TraitId>;
  planned: Map<TraitId, "tentative" | "planned">;
  notes: Map<TraitId, string>;
}
