/**
 * Extracted game data, a hand-maintained overlay for what the game doesn't
 * (seem to) encode, and the schema that validates the combination of the two
 * at build time.
 *
 * Also, the home of the static lookups (e.g. set membership, a god's boons,
 * whether a boon/trait is a core boon, a boon's prerequisite(s)). As
 * pure reads with no dependence on run facts, they belong here instead of in
 * the game-rules seam.
 *
 * Not implemented yet: schema, overlay, and the icon & text resolvers. The
 * normalized data itself is under `data/` and is loaded by `data.ts`.
 */

export { dataFor, gameData } from "./data.js";
export type { GameData, GameKey } from "./data.js";
