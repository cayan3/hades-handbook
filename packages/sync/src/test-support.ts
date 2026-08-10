import type { TraitRecord } from "@repo/catalog";
import type { GameId, RunFacts, RunState, TraitId } from "@repo/core";
import type { MirrorRow, SyncCatalog } from "./catalog-view.js";
import { emptyRun } from "./persisted.js";

/**
 * A catalog that's actually erm small enough to read lol.
 *
 * The migration pass is the code that has to answer "is this id still in the
 * catalog", so its tests need to name ids that are *not*. Hunting through
 * six hundred shipped records for one the extraction just happens never to have
 * emitted is both tedious and fragile since yk the next extraction might emit it.
 * Stating the world explicitly makes the absent ids absent by construction yay.
 */
export function testCatalog(overrides: Partial<SyncCatalog> = {}): SyncCatalog {
  return {
    game: "hades2",
    dataVersion: "build-1",
    traits: {},
    gods: new Set(),
    keepsakes: new Set(),
    slots: new Set(),
    talents: new Set(),
    mirrorRows: [],
    ...overrides,
  };
}

/**
 * A trait record with everything the migration and the manual source read, and
 * nothing else filled in other than what the schema requires.
 */
export function testTrait(id: TraitId, overrides: Partial<TraitRecord> = {}): TraitRecord {
  return {
    id,
    god: null,
    godKind: null,
    name: id,
    descriptionRef: null,
    icon: null,
    boonCategory: "StandardOlympian",
    slot: null,
    rarity: ["Common"],
    duoGods: null,
    exclusiveGroup: null,
    elementAffinity: null,
    prereq: null,
    prereqSource: null,
    tier: null,
    blockedBy: null,
    activation: null,
    aspectConflicts: null,
    source: "Scripts/Test.lua:1",
    ...overrides,
  };
}

/** Builds a trait table out of records, keyed the way the catalog keys them. */
export function traitTable(...records: TraitRecord[]): Record<TraitId, TraitRecord> {
  const table: Record<TraitId, TraitRecord> = {};
  for (const record of records) table[record.id] = record;
  return table;
}

export function testRow(id: string, a: string, b: string): MirrorRow {
  return { id, members: [a, b] };
}

/** An empty run stamped with a build of the caller's choosing. */
export function runOn(game: GameId, dataVersion: string): RunState {
  return emptyRun(game, dataVersion);
}

/**
 * Facts with only the fields a test cares about filled in.
 *
 * This is whole instead of partial because the merge shares the collections
 * nothing addressed, so a test asserting that has to be able to hold the *same* empty
 * map the source handed over (which a builder handing back a fresh one per
 * call wouldn't be able to express).
 */
export function testFacts(over: Partial<RunFacts> = {}): RunFacts {
  return { ...emptyRun("hades2", "build-1").facts, ...over };
}
