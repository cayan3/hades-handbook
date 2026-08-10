/**
 * THROWAWAY SCAFFOLDING, together with everything that reads it. It exists so
 * the stack choice could be proved end to end — real requirement, real catalog
 * records, real game rules, a real render — rather than argued about. The
 * component library builds its own fixtures; delete this with the sketch.
 *
 * Hand-written facts, deliberately: nothing here opens a store or a run-state
 * source. Wiring the real platform is a later session, and keeping this one
 * unable to reach it is what made the scaffold cheap to throw away.
 *
 * The subject is a Hades I trait rather than a Hades II one, and choosing it
 * took a measurement worth leaving behind. Impossible is derived from the
 * prerequisite alone, so producing one means finding a requirement some run can
 * make unsatisfiable — and across the shipped Hades II data there is no such
 * trait at all: of the 100 records carrying a prerequisite, every branch bottoms
 * out in held traits, element counts or keepsakes, and no combination of held
 * traits blocks a whole branch. Hades I has sixteen, and all sixteen are the
 * same case: a Mirror talent the player did not take. That is the honest
 * Impossible to draw, and it is a run-long verdict rather than a passing one.
 */

import { traitsFor } from "@repo/catalog";
import type { BoonState, RunFacts, TalentId, TalentSelection, TraitId } from "@repo/core";

/** Lightning Rod: a Mirror talent, an Artemis boon, and a Zeus boon. */
export const SUBJECT = "AmmoBoltTrait" as TraitId;

const TALENT = "AmmoMetaUpgrade" as TalentId;
const ARTEMIS_BOON = "ArtemisWeaponTrait" as TraitId;
const ZEUS_BOON = "ZeusWeaponTrait" as TraitId;

export function prereqOf(trait: TraitId) {
  const record = traitsFor("hades1")[trait];
  if (record?.prereq == null) throw new Error(`no prerequisite for ${trait}`);
  return record.prereq;
}

export function nameOf(trait: TraitId): string {
  return traitsFor("hades1")[trait]?.name ?? trait;
}

function facts(over: Partial<RunFacts> = {}): RunFacts {
  return {
    game: "hades1",
    dataVersion: "fixture",
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

function run(talent: TalentSelection | null, ...held: readonly TraitId[]): RunFacts {
  return facts({
    held: new Map(held.map((t) => [t, { rarity: "Common" as const, level: 1 }])),
    // A talent nobody has been asked about is left out of the map rather than
    // written in as a no, which is the difference between "not yet" and a
    // verdict that lasts the whole run.
    equipped: talent === null ? {} : { talents: new Map([[TALENT, talent]]) },
  });
}

/** One run per state, each the shortest run that produces it. */
export const FIXTURES: ReadonlyArray<{ state: BoonState; facts: RunFacts }> = [
  { state: "Obtained", facts: run("selected", SUBJECT) },
  { state: "Available", facts: run("selected", ARTEMIS_BOON, ZEUS_BOON) },
  { state: "Pending", facts: run("selected", ARTEMIS_BOON) },
  { state: "Locked", facts: run(null) },
  { state: "Impossible", facts: run("notSelected") },
];
