/**
 * The pure domain package.
 *
 * Given everything true about a run and a requirement, return what is still
 * needed, that it is met, or that it is impossible this run. Everything the
 * product shows is a view over that answer.
 *
 * This package is pure: no IO, no rendering, no clock, no game branching. It
 * imports nothing else in the repo, which the import-boundary lint rule
 * enforces — npm's flat node_modules would otherwise let it drift.
 *
 * The two things it cannot answer alone — what a game's pool rules are, and who
 * belongs to a named set — arrive as interfaces declared here and implemented
 * further out.
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
