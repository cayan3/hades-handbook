import type { AspectId, GodId, TraitId } from "@repo/core";
import type { GameKey } from "./data.js";

/**
 * What the game doesn't encode, as well as what it encodes ermmm incorrectly (o_0).
 *
 * Everything here is maintained by hand, so is the part of the catalog that
 * can get outdated without being noticed (the extraction changes when the game
 * does while this file doesn't, and an entry naming an id that doesn't actually
 * exist anymore would otherwise just ermmm stop applying rip). The test beside
 * this file is what actually makes those discrepancies loud instead.
 *
 * This should be kept small. Anything derivable from extracted data belongs in
 * the extractor itself, where it's recomputed instead of just yk "remembered".
 */
export interface TraitOverlay {
  /**
   * Weapon aspects this trait can't coexist with, ADDED to whatever the
   * extraction already found.
   *
   * This used to say the game doesn't declare these & that the field was the
   * one feasibility input made by hand. Both halves were wrong: the games state
   * them as ordinary trait negations (the same key as boon-vs-boon exclusion),
   * which is exactly why they were missed — the extractor read the key and not
   * what was on the other end of it, so they were landing in `blockedBy`, where
   * they'd never fire bc a run equips an aspect rather than holding one.
   * They're extracted now, so this is for the ones the data doesn't state.
   */
  aspectConflicts?: readonly AspectId[];

  /**
   * The god that actually grants this trait, overriding the extraction.
   *
   * Only for records where the game's own data is wrong. The extraction is
   * faithful; the source is just mistaken (so correcting it upstream would erm
   * make the drift check report a difference like forever :sobbing: :sobbing:).
   */
  god?: GodId;

  /**
   * Extra traits that also satisfy one of this record's `hasTrait` clauses,
   * keyed by the clause's own trait id.
   *
   * Hades I's Cast twins so far, and nothing else. Per record rather than a
   * blanket equivalence between the twins — see below for why that matters.
   */
  alsoSatisfiedBy?: Readonly<Record<TraitId, readonly TraitId[]>>;

  /** Curated caveat shown alongside the trait. */
  notes?: string;
}

export type Overlay = Readonly<Record<TraitId, TraitOverlay>>;

/**
 * Two Hades I traits declare the wrong god in the game's own files.
 *
 * Crystal Beam and Icy Flare both carry `God = "Zeus"` despite being in
 * Demeter's loot table, which is what actually owns them. Every other signal
 * agrees on Demeter except the declared field.
 *
 * These are the only two such records in either game (..I think o_0).
 */
/**
 * Each god's Cast boon has a second form — *Trippy Shot* and *Trippy Flare* —
 * offered instead while the run wields an ammo-loading aspect. They are
 * separate records and the game matches requirements by exact id, so a
 * requirement naming one is not met by the other. Its own tables name both
 * twins in most places and one in a few: Dionysus names both for four of its
 * five Cast requirements, and one for *Scintillating Feast*.
 *
 * Twenty-one requirements read that way and only twelve are listed below. The
 * test for the other nine is whether every route to the twin is one the boon
 * refuses. Seven Flares need Aspect of Beowulf and *Blown Kiss*, *Hunting
 * Blades*, *Exit Wounds*, *Blizzard Shot* and *Parting Shot* all name that
 * aspect in their own `RequiredFalseTraits`, so those pairings never arise.
 * Trippy Flare is the exception — Aspect of Hera reaches it too — but none of
 * the nine names Dionysus's Cast, so the rule comes out the same.
 */
const CAST_TWIN = Object.freeze({
  AphroditeRangedTrait: Object.freeze(["ShieldLoadAmmo_AphroditeRangedTrait"]),
  AresRangedTrait: Object.freeze(["ShieldLoadAmmo_AresRangedTrait"]),
  ArtemisRangedTrait: Object.freeze(["ShieldLoadAmmo_ArtemisRangedTrait"]),
  AthenaRangedTrait: Object.freeze(["ShieldLoadAmmo_AthenaRangedTrait"]),
  DemeterRangedTrait: Object.freeze(["ShieldLoadAmmo_DemeterRangedTrait"]),
  DionysusRangedTrait: Object.freeze(["ShieldLoadAmmo_DionysusRangedTrait"]),
  PoseidonRangedTrait: Object.freeze(["ShieldLoadAmmo_PoseidonRangedTrait"]),
  ZeusRangedTrait: Object.freeze(["ShieldLoadAmmo_ZeusRangedTrait"]),
});

/**
 * Keyed to the table above rather than to `TraitId`: a looser signature let a
 * call name a god the table had no row for and quietly widen nothing, which is
 * an overlay entry that reads as applied and is inert.
 */
const twin = (base: keyof typeof CAST_TWIN): TraitOverlay => ({
  alsoSatisfiedBy: Object.freeze({ [base]: CAST_TWIN[base] }),
});

const HADES1: Overlay = Object.freeze({
  DemeterRangedTrait: { god: "Demeter" },
  ShieldLoadAmmo_DemeterRangedTrait: { god: "Demeter" },

  // Artemis's crit family, gated on "any Artemis boon". Its siblings
  // Supporting Fire and Deadly Reversal already name both twins.
  ArtemisCriticalTrait: twin("ArtemisRangedTrait"),
  CritVulnerabilityTrait: twin("ArtemisRangedTrait"),
  CriticalBufferMultiplierTrait: twin("ArtemisRangedTrait"),
  CriticalSuperGenerationTrait: twin("ArtemisRangedTrait"),
  PoisonCritVulnerabilityTrait: twin("ArtemisRangedTrait"),

  // Cast upgrades, each naming its own god's Cast.
  DemeterRangedBonusTrait: twin("DemeterRangedTrait"),
  HomingLaserTrait: twin("DemeterRangedTrait"),
  SelfLaserTrait: twin("DemeterRangedTrait"),
  DoubleCollisionTrait: twin("PoseidonRangedTrait"),
  ReboundingAthenaCastTrait: twin("AthenaRangedTrait"),
  ZeusBonusBounceTrait: twin("ZeusRangedTrait"),

  // The Duo this was reported on.
  LightningCloudTrait: twin("DionysusRangedTrait"),
});

const HADES2: Overlay = Object.freeze({});

const OVERLAYS: Readonly<Record<GameKey, Overlay>> = Object.freeze({
  hades1: HADES1,
  hades2: HADES2,
});

export function overlayFor(game: GameKey): Overlay {
  return OVERLAYS[game];
}
