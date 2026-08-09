import type { GodId, HeldTrait, SlotId, TalentId, TalentSelection, TraitId } from "@repo/core";

/**
 * One thing a stored run said that the current catalog cannot identify.
 *
 * Quarantine is the whole point of the migration pass, so the shape matters:
 * each entry names where the value was and what it was, which is enough to put
 * it back if a later snapshot knows the id again. An entry that recorded only a
 * count, or only the id, would satisfy "we told the user" while still having
 * thrown the run away.
 *
 * Typed rather than a bag of strings, for the same reason the override layer is
 * typed: this is the seam where facts leave the model, and `unknown` here would
 * mean nothing downstream could restore an entry without guessing which field
 * it came out of.
 */
export type QuarantinedEntry =
  | { path: "held"; key: TraitId; value: HeldTrait }
  | { path: "godPool"; key: GodId }
  /**
   * Either the slot is not a slot any more, or it is and the trait sitting in
   * it is gone. `slot` distinguishes them: a slot that survived keeps its entry
   * and is emptied, so the run still knows the slot exists.
   */
  | { path: "slots"; key: SlotId; value: TraitId | null; slot: "kept" | "unknown" }
  | { path: "bans"; key: TraitId }
  | { path: "equipped"; key: "aspect" | "keepsake"; value: string }
  | { path: "talents"; key: TalentId; value: TalentSelection }
  | { path: "pins"; key: TraitId }
  | { path: "planned"; key: TraitId }
  | { path: "notes"; key: TraitId; value: string };
