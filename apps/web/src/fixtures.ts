import { type TraitRecord, createLookups, traitsFor } from "@repo/catalog";
import type { RunFacts, TalentSelection, TraitId } from "@repo/core";
import { createRules as hades1Rules } from "@repo/rules-hades1";
import { createRules as hades2Rules } from "@repo/rules-hades2";
import { type NodeSource, createNodeSource } from "@repo/ui";

/**
 * Hand-written runs, and nothing that could produce one on its own.
 *
 * This session builds the component library and is judged on whether it reads
 * right, so the run state it reads is typed out here rather than loaded: no
 * store is opened, no run-state source exists, and there is nothing to
 * subscribe to. Wiring the real platform is the next session's whole job, and
 * keeping the seam intact is what stops a rendering problem and a persistence
 * problem arriving in the same diff.
 *
 * Everything below the facts is real — the shipped catalog, the shipped
 * requirement trees, both games' actual rules. So a state on this page is the
 * engine's answer about a made-up run, never a label somebody typed.
 */

/**
 * Lightning Rod: a Mirror talent, an Artemis boon and a Zeus boon.
 *
 * Chosen because it is the one shape in either game that can reach all five
 * states, which took a measurement worth leaving behind. **Impossible** is
 * derived from a boon's own feasibility and its prerequisite, and across the
 * shipped Hades II data no combination of held boons can make any prerequisite
 * unsatisfiable at all — of the hundred records that carry one, every branch
 * bottoms out in held traits, element counts or keepsakes. Hades I reaches it
 * sixteen times and all sixteen the same way: a Mirror talent the player did
 * not take, which is settled before the run starts and cannot change during it.
 */
export const LIGHTNING_ROD = "AmmoBoltTrait" as TraitId;
const TALENT = "AmmoMetaUpgrade";
const ARTEMIS_BOON = "ArtemisWeaponTrait" as TraitId;
const ZEUS_BOON = "ZeusWeaponTrait" as TraitId;

/** Self Healing: an Infusion obtainable at 2 Fire whose effect waits for 3. */
export const SELF_HEALING = "ElementalRallyBoon" as TraitId;

/**
 * A boon that asks for a god to be in the pool, which no shipped record does.
 *
 * Written out here, and labelled, because the verdict it produces carries the
 * one piece of copy in this product that is required rather than chosen — and
 * the atom that produces it has zero authors across both games' data. Faking
 * the *record* is honest; faking the verdict would not be, so the run below is
 * a real full pool and the rules that call it full are the shipped ones.
 */
export const POOL_DEMO = "FixtureGodInPool" as TraitId;

function hades1Records(): Readonly<Record<TraitId, TraitRecord>> {
  const shipped = traitsFor("hades1");
  const template = shipped[LIGHTNING_ROD] as TraitRecord;
  return {
    ...shipped,
    [POOL_DEMO]: {
      ...template,
      id: POOL_DEMO,
      name: "Sea Blessing (fixture)",
      god: "Poseidon",
      tier: 1,
      rarity: [],
      prereq: { kind: "godInPool", god: "Poseidon" },
    },
  };
}

function facts(game: "hades1" | "hades2", over: Partial<RunFacts> = {}): RunFacts {
  return {
    game,
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

function hades1Run(talent: TalentSelection | null, ...traits: readonly TraitId[]): RunFacts {
  return facts("hades1", {
    held: new Map(traits.map((trait) => [trait, { rarity: "Common" as const, level: 1 }])),
    // A talent nobody has been asked about is left out of the map rather than
    // written in as a no, which is the difference between "not yet" and a
    // verdict that lasts the whole run.
    equipped: talent === null ? {} : { talents: new Map([[TALENT, talent]]) },
  });
}

export const hades1: NodeSource = createNodeSource(
  "hades1",
  hades1Rules(),
  createLookups("hades1"),
  hades1Records(),
);

export const hades2: NodeSource = createNodeSource(
  "hades2",
  hades2Rules(),
  createLookups("hades2"),
);

/** One run per rung, each the shortest run that produces it. */
export const LADDER: ReadonlyArray<{ readonly state: string; readonly facts: RunFacts }> = [
  { state: "Obtained", facts: hades1Run("selected", LIGHTNING_ROD) },
  { state: "Available", facts: hades1Run("selected", ARTEMIS_BOON, ZEUS_BOON) },
  { state: "Pending", facts: hades1Run("selected", ARTEMIS_BOON) },
  { state: "Locked", facts: hades1Run(null) },
  { state: "Impossible", facts: hades1Run("notSelected") },
];

/**
 * Four gods that hold a pool slot, which is the cap in both games.
 *
 * Hermes and Chaos are left out on purpose even though a run of this length
 * would have met them: they grant boons without ever claiming a slot, so
 * counting them would fill the pool two gods early.
 */
export const FULL_POOL: RunFacts = facts("hades1", {
  godPool: new Set(["Zeus", "Ares", "Athena", "Aphrodite"]),
});

/** Held, past its obtain gate, and short of the threshold its effect needs. */
export const DORMANT: RunFacts = facts("hades2", {
  held: new Map([[SELF_HEALING, { rarity: "Common" as const, level: 1 }]]),
  elements: new Map([["Fire", 2]]),
});

/** The same boon, live. */
export const ACTIVE: RunFacts = facts("hades2", {
  held: new Map([[SELF_HEALING, { rarity: "Common" as const, level: 1 }]]),
  elements: new Map([["Fire", 3]]),
});
