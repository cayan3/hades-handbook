import type {
  CatalogLookups,
  GameRules,
  HeldTrait,
  Rarity,
  Reason,
  RunFacts,
  TraitId,
} from "@repo/core";
import type { Naming } from "./naming.js";

/**
 * Test apparatus, not exported from the package.
 *
 * The rules stub answers feasibility without reading the facts, which is wrong in
 * the way a stub should be: a test that wants a boon blocked says so rather than
 * building the run that would block it. The real implementations have their own
 * tests, next to the game data they are about.
 *
 * The naming stub keeps the text tests off the shipped catalog. A sentence about
 * a boon called "Storm Lightning" reads as an assertion about the sentence; the
 * same one over six hundred real records reads as one about the extraction.
 */

export function makeFacts(over: Partial<RunFacts> = {}): RunFacts {
  return {
    game: "hades1",
    dataVersion: "test",
    held: new Map(),
    godPool: new Set(),
    elements: new Map(),
    slots: new Map(),
    equipped: {},
    resources: new Map(),
    bans: new Set(),
    ...over,
  };
}

/** `"A"` holds A as a Common; `["A", "Epic"]` holds it as an Epic. */
export function held(
  ...traits: ReadonlyArray<TraitId | readonly [TraitId, Rarity]>
): Map<TraitId, HeldTrait> {
  const map = new Map<TraitId, HeldTrait>();
  for (const entry of traits) {
    const [trait, rarity] = typeof entry === "string" ? ([entry, "Common"] as const) : entry;
    map.set(trait, { rarity, level: 1 });
  }
  return map;
}

export interface StubRules {
  readonly blocked?: ReadonlyMap<TraitId, Reason>;
  readonly poolFull?: boolean;
}

export function stubRules(cfg: StubRules = {}): GameRules {
  return {
    poolCapacity: () => 4,
    isGodPoolFull: () => cfg.poolFull ?? false,
    isBlocked: (trait) => cfg.blocked?.get(trait) ?? null,
  };
}

export function stubLookups(
  gods: Readonly<Record<string, readonly TraitId[]>> = {},
): CatalogLookups {
  return { boonsOfGod: (god) => gods[god] ?? [] };
}

/** Names that say plainly which id space they came from. */
export const stubNaming: Naming = {
  trait: (id) => `trait:${id}`,
  god: (id) => `god:${id}`,
  keepsake: (id) => `keepsake:${id}`,
  talent: (id) => `talent:${id}`,
  aspect: (id) => `aspect:${id}`,
};
