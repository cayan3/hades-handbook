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
const HADES1: Overlay = Object.freeze({
  DemeterRangedTrait: { god: "Demeter" },
  ShieldLoadAmmo_DemeterRangedTrait: { god: "Demeter" },
});

const HADES2: Overlay = Object.freeze({});

const OVERLAYS: Readonly<Record<GameKey, Overlay>> = Object.freeze({
  hades1: HADES1,
  hades2: HADES2,
});

export function overlayFor(game: GameKey): Overlay {
  return OVERLAYS[game];
}
