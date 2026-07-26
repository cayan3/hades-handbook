/**
 * The pure domain package.
 *
 * Given everything true abt a run & a requirement, return: what's still
 * needed, that it's already met, or that it's impossible this run.
 * What's displayed by the UI is just a player-digestible view over that answer.
 *
 * This package is pure (yippee), i.e. no IO, no rendering, no clock,
 * no game branching, no imports from anywhere in the repo. The "no imports from
 * anything else in the repo" characteristic is enforced by the import-boundary
 * lint rule enforces (w/o it, it would go unenforced since npm's flat
 * node_modules wouldn't catch it).
 *
 * There are two things that this package can't answer alone: 1) what a game's
 * pool rules are, and 2) which traits belong to a named set. Both things arrive as
 * interfaces declared here & are actually implemented further out.
 */

export type {
  Element,
  GameId,
  GodId,
  GroupId,
  AspectId,
  KeepsakeId,
  Rarity,
  ResourceId,
  SetId,
  SlotId,
  TraitId,
} from "./ids.js";
export type { Requirement } from "./requirement.js";
export type { HeldTrait, RunFacts, RunIntent, RunState } from "./run-state.js";
export type { Reason, Status } from "./status.js";
export type { GameRules } from "./game-rules.js";
export type { CatalogLookups } from "./catalog-lookups.js";
export { evaluate } from "./evaluate.js";
export { anyLeafStarted, boonState } from "./boon-state.js";
export type { BoonState } from "./boon-state.js";
