/**
 * Extracted game data, a hand-maintained overlay for what the game doesn't
 * (seem to) encode, and the schema that validates the combination of the two
 * at build time.
 *
 * Also the home of the static lookups (e.g. a god's boons, whether a boon/trait
 * is a core boon, a boon's prerequisite(s)). As pure reads with no dependence
 * on any run facts, they belong here instead of in like the game-rules seam.
 *
 * The normalized data itself is under `data/` and is loaded by `data.ts`.
 * `data.ts` hands it back verbatim; `traits.ts` is the one that folds the
 * overlay in, and is what anything reading a trait record should go through.
 *
 * Validation is purposefully kept (almost all) somewhere else. Anything
 * that can be answered just from the extracted data is checked while the data
 * is being produced bc that's the only place that can actually refuse to
 * produce a bad snapshot instead of just shipping one and like finding out
 * later rip. The single check that *can't* go there is the overlay, which is
 * run here instead (the overlay isn't an extractor input, so
 * nothing on that side can actually see whether or not an overlay entry still
 * names a trait that exists).
 */

export { dataFor, gameData } from "./data.js";
export type { GameData, GameKey } from "./data.js";
export { createLookups } from "./lookups.js";
export { forcingKeepsakes, keepsakesFor } from "./keepsakes.js";
export { poolGods } from "./gods.js";
export { iconFor, keepsakeNameFor, nameFor, textFor } from "./assets.js";
export { overlayFor } from "./overlay.js";
export type { Overlay, TraitOverlay } from "./overlay.js";
export { refusedTraits, traitsFor } from "./traits.js";
export type {
  BuildFailure,
  GodRecord,
  KeepsakeRecord,
  SetRecord,
  TraitRecord,
} from "./schema.js";
