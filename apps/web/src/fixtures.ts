import { type TraitRecord, createLookups, traitsFor } from "@repo/catalog";
import type { RunFacts, TalentSelection, TraitId } from "@repo/core";
import { createRules as hades1Rules } from "@repo/rules-hades1";
import { createRules as hades2Rules } from "@repo/rules-hades2";
import { type NodeSource, createNodeSource } from "@repo/ui";

/**
 * Hand-written runs, and nothing that could produce one on its own. No store is
 * opened, no run-state source exists, nothing subscribes. Wiring the real
 * platform is a later job, and keeping that seam is what stops a rendering
 * problem and a persistence problem arriving in the same diff.
 *
 * Everything below the facts is real: the shipped catalog, the shipped
 * requirement trees, both games' actual rules. So a state on this page is the
 * engine's answer about a made-up run, never a label somebody typed.
 */

/**
 * Lightning Rod: a Mirror talent, an Artemis boon and a Zeus boon. Chosen because
 * it is the one shape in either game that reaches all five states, which took a
 * measurement worth leaving behind. Across the shipped Hades II data no
 * combination of held boons can make any prerequisite unsatisfiable — of the
 * hundred records carrying one, every branch bottoms out in held traits, element
 * counts or keepsakes. Hades I reaches Impossible sixteen times and always the
 * same way: a Mirror talent the player did not take, fixed before the run starts.
 */
export const LIGHTNING_ROD = "AmmoBoltTrait" as TraitId;
const TALENT = "AmmoMetaUpgrade";
const ARTEMIS_BOON = "ArtemisWeaponTrait" as TraitId;
const ZEUS_BOON = "ZeusWeaponTrait" as TraitId;

/** Self Healing: an Infusion obtainable at 2 Fire whose effect waits for 3. */
export const SELF_HEALING = "ElementalRallyBoon" as TraitId;

/**
 * A boon asking for a god in the pool, which no shipped record does — the atom
 * has zero authors in either game. Written out here and labelled, because the
 * verdict it produces carries the one piece of required copy in this product.
 * Faking the *record* is honest; faking the verdict would not be, so the run is
 * a real full pool and the rules calling it full are the shipped ones.
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

const hades1Base = createNodeSource(
  "hades1",
  hades1Rules(),
  createLookups("hades1"),
  hades1Records(),
);

/**
 * A source that also knows the name of the boon it made up. Names come back
 * through the catalog's resolver, which has never heard of a fixture and quite
 * right — so the file that invents a record supplies its name too.
 */
export const hades1: NodeSource = {
  ...hades1Base,
  naming: {
    ...hades1Base.naming,
    trait: (id) => (id === POOL_DEMO ? "Sea Blessing (fixture)" : hades1Base.naming.trait(id)),
  },
};

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
 * Four gods holding a pool slot, which is the cap in both games. Hermes and Chaos
 * are left out on purpose though a run this long would have met them: they grant
 * boons without claiming a slot, so counting them fills the pool two gods early.
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
