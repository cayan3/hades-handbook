import type { Element, GodId, KeepsakeId, Rarity, SetId, SlotId, TraitId } from "@repo/core";

/**
 * The shape of the extracted snapshot (as it's actually emitted).
 *
 * This just types what the extractor produces today (as in when it's run lol
 * not like an idealized target or anything. Anything the two disagree on is
 * resolved individually and with reasoning recorded below (especially bc there
 * were different "the schema says X, the data says Y" findings in like four
 * different passes :sobbing: :sobbing:).
 *
 * Fields the extractor doesn't emit yet are optional instead of simply being
 * absent, so a consumer written against the finished shape can compile now and
 * just see `undefined` for those fields until the emission catches up.
 */
export interface TraitRecord {
  id: TraitId;

  /**
   * This is null ermmm far more often than the shape would suggest o_0.
   * In particular, Hades II Duo's don't actually carry their own god(s) (the
   * god pairs are in `duoGods` instead), and neither does anything the game
   * doesn't attribute to a god at all (e.g. Chaos boons, keepsakes, aspects,
   * talents). Typed nullable here bc that's.. literally what the data says lol
   * (we're not just using it as like a concession or placeholder or anything).
   */
  god: GodId | null;
  godKind: "PoolSlot" | "NonPoolSlot" | null;

  /**
   * Both null wherever the localized text bundle has no entry for the id.
   * (Turns out that's abt 91 out of 449 Hades I records and 22 out of 612 in
   * Hades II lol, i.e. there's a lott of debug and/or cut content that's
   * not actually shipped in in-game text right now.)
   */
  name: string | null;
  descriptionRef: string | null;

  /** Only an asset key, not any kind of path. Resolved by the icon resolver. */
  icon: string | null;

  boonCategory: "StandardOlympian" | "NonStandard" | "NpcAlly";
  slot: SlotId | null;

  /**
   * This is a list instead of a single value bc a boon can usually be offered
   * at several rarities, and in game code there's one multiplier per supported
   * rarity (so having a scalar would mean likee arbitrarily picking one rip).
   */
  rarity: readonly Rarity[];

  /**
   * The two gods of a Duo, read from a `-- GodA x GodB` source comment instead
   * of directly from a structured field. This is stored instead of derived
   * from `prereq`, which is the one place in this schema that purposefully
   * keeps a second source of truth (bc a comment isn't yk recoverable from the
   * prerequisite expression itself, so dropping the field entirely would mean
   * losing information that's not provided by anything else).
   */
  duoGods: readonly [GodId, GodId] | null;

  /**
   * Set when this record's god was inferred from a leading source comment
   * instead of just yk read from a field. Kept so we can distinguish between
   * "a god the literally data stated" vs "a god only implied by a comment",
   * and to give those inferences somewhere to actually be audited instead of
   * just yk silently blending in lol.
   */
  _godInferredFromComment?: boolean;

  /**
   * Every id mutually exclusive with this one, *including this id itself;
   * sorted. Kept as the member list instead of collapsed to like a group
   * identifier bc the list itself is what's needed by the view (i.e. naming the
   * specific conflicting trait is more useful than just like naming the
   * conflict group lol); also, collapsing it would mean inventing ground
   * identifiers that aren't actually in the game(s).
   *
   * Hades I's version currently mixes one-directional blocks into the
   * symmetric ones, so shouldn't be read as symmetric until that's separated.
   */
  exclusiveGroup: readonly TraitId[] | null;

  /**
   * Hades II only. A single element (instead of like a list) bc there aren't
   * any shipped traits that have more than one element base. Also, the resolver
   * that produces it actually stops at the first match in the inherit chain
   * lol, so a second affinity would ermm be silently dropped anyway (that's uh
   * the emitter's mistake instead of in this type, and it's fixed on the
   * emitting side too).
   */
  elementAffinity: Element | null;

  /** The gate for being offered this trait. Null if there yk isn't any gate. */
  prereq: RawRequirement | null;

  /**
   * Longest prerequisite path within this trait's own god. Null for anything
   * that considers multiple gods (e.g. Duos and Infusions).
   *
   * Optional because nothing emits it yet.
   */
  tier?: number | null;

  /**
   * Holding any of these makes this trait unobtainable. This is
   * one-directional, and every listed blocker must be something the run
   * literally can't get rid of.
   *
   * Optional because nothing emits it yet.
   */
  blockedBy?: readonly TraitId[];

  /**
   * Hades II. The separate, higher threshold for an owned trait's effect to
   * actually "activate" (usually different from the original threshold required
   * to be offered the trait in the first place).
   *
   * Optional because nothing emits it yet; seven records have the source field
   * and zero emitted records have this one.
   */
  activation?: RawRequirement | null;

  /** `Scripts/<file>.lua:<line>` where this trait is defined. */
  source?: string;
}

/**
 * The requirement expression as the extractor emits it (still raw).
 *
 * This is purposefully not the engine's requirement type bc what's being
 * shipped now is just a pass-through of the game's own clause structure, and
 * normalising it into the shape that's actually evaluated should happen on the
 * emitting side. Typing this as the actual finished type would be like saying
 * a conversion happened when it hasn't yet.
 */
export interface RawRequirement {
  expr?: unknown;
  source?: string;
  note?: string;
  linkedUpgradesOccurrences?: readonly unknown[];
  inline?: unknown;
  inlineSource?: string;
}

export interface GodRecord {
  id: GodId;
  name: string;
  kind: "PoolSlot" | "NonPoolSlot";
  iconKey: string;
  source?: string;
}

export interface KeepsakeRecord {
  id: KeepsakeId;
  name: string | null;
  /**
   * The id this keepsake is associated with. Since that's not always a god
   * (i.e. mixes gods, NPCs, upgrade ids, etc), it shouldn't be read as a god id
   * without actually checking it against the god table first.
   */
  associatedGod: string | null;
  associatedNpcId?: string | null;
  iconKey: string;
  source?: string;
}

export interface SetRecord {
  id: SetId;
  members: readonly TraitId[];
  source?: string;
}
