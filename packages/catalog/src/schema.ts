import type {
  AspectId,
  Element,
  GodId,
  KeepsakeId,
  Rarity,
  Requirement,
  SetId,
  SlotId,
  TraitId,
} from "@repo/core";

/**
 * The shape of the extracted snapshot (as it's actually emitted).
 *
 * This just types what the extractor produces today (as in when it's run lol
 * not like an idealized target or anything. Anything the two disagree on is
 * resolved individually and with reasoning recorded below (especially bc there
 * were different "the schema says X, the data says Y" findings in like four
 * different passes :sobbing: :sobbing:).
 *
 * A field is optional here only when the extractor genuinely writes it onto
 * some records and not others. It is NOT a waiting room for fields the emission
 * hadn't caught up to yet: three fields sat optional on that reasoning long
 * after they started being emitted on every record, and a `?:` that says
 * "sometimes absent" while the data says "always present" makes every consumer
 * write a branch for a case that cannot happen. An absent *value* is written
 * `null` throughout, so nullability and optionality mean different things and
 * neither is a stand-in for the other.
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
   * conflict group lol); also, collapsing it would mean inventing group
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

  /**
   * The gate for being offered this trait. Null if there yk isn't any gate.
   *
   * This is the engine's own `Requirement`, not a pass-through of the game's
   * clause structure: the extractor normalises it now, so there's no conversion
   * left to happen on this side. Typing it as anything looser would be claiming
   * a step still exists when it doesn't.
   */
  prereq: Requirement | null;

  /**
   * `Scripts/<file>.lua:<line>` where the gate above is *written*, which is
   * usually not where the trait itself is (Hades I keeps a god's gates in that
   * god's loot table, nowhere near the trait's own definition). Null exactly
   * when `prereq` is.
   */
  prereqSource: string | null;

  /**
   * Ladder depth within this trait's own god, counted along the *cheapest*
   * prereq path (i.e. a disjunction costs its easiest branch, a conjunction its
   * dearest, and a branch some other god can satisfy costs this ladder
   * nothing). First rung is 1. Null for anything that doesn't sit on exactly
   * one god's ladder — e.g. Duos, which consider two gods, and Infusions, which
   * consider none.
   *
   * Cheapest and not longest, which this said until it was measured: tier N is
   * supposed to mean "needs a tier N-1 boon of the same god", and a boon
   * reachable through any one of three others doesn't have one.
   */
  tier: number | null;

  /**
   * Holding any of these makes this trait unobtainable. This is
   * one-directional, and every listed blocker must be something the run
   * literally can't get rid of. E.g. keepsakes are swappable between regions,
   * so any blockers due to equipped keepsakes shouldn't be included here bc
   * it'd tell a player their build is cooked when changing keepsakes would
   * just yk fix it rip.
   *
   * A weapon aspect is excluded for a different reason than a keepsake: it's
   * permanent for the run alright, but a run *equips* an aspect rather than
   * holding it, so a blocker naming one would be looked for among the held
   * traits and never found. Those live in `aspectConflicts` below. The games
   * write both with the same key, which is exactly how they ended up in here.
   */
  blockedBy: readonly TraitId[] | null;

  /**
   * Hades II. The separate, higher threshold for an owned trait's effect to
   * actually "activate" (usually different from the original threshold required
   * to be offered the trait in the first place).
   *
   * Six records carry one. A seventh has the source field and doesn't emit
   * this, and that isn't a gap: its activation gate is the same rarity-count
   * predicate as its obtain gate, and that predicate is discarded from both
   * alike bc rarity is upgradeable mid-run and so can never make a build
   * impossible.
   */
  activation: Requirement | null;

  /**
   * Weapon forms this trait is never offered alongside. Read against the
   * equipped aspect, not against anything held — see `blockedBy` above for why
   * the two can't be one field.
   *
   * The overlay may add to this; it's no longer the only source, which the
   * comment there used to say it was.
   */
  aspectConflicts: readonly AspectId[] | null;

  /**
   * Present only where the extractor decided it could not build this record
   * honestly and said so rather than emitting a quiet approximation. Two Hades
   * II records carry one today, both Chaos boons whose prereq names a table
   * that didn't resolve when the game data was dumped.
   *
   * Genuinely optional: nearly every record is built without incident, so this
   * being absent is the normal case rather than an emission gap.
   */
  buildFailure?: readonly BuildFailure[];

  /** `Scripts/<file>.lua:<line>` where this trait is defined. */
  source: string;
}

/** What the extractor couldn't build, kept on the record it happened to. */
export interface BuildFailure {
  /** The clause as it was found, verbatim, so it can be read against the game. */
  clause: unknown;
  /** Why it couldn't be used, in words instead of as a code. */
  reason: string;
  /** Which part of the record was being built: `prereq`, `tier`, ... */
  stage: string;
}

export interface GodRecord {
  /**
   * The god's *loot table* id (`ZeusUpgrade`), deliberately not typed as a god
   * id. A god is addressed by the bare name that keys this table (`Zeus`), and
   * that is what every requirement, member list and run god pool speaks. The
   * two spaces don't overlap, so a god picker built out of this field produces
   * a pool that matches nothing and gives no hint as to why. Read it the way
   * `iconKey` is read: a fact about a god, not a name for one. A keepsake's
   * `associatedGod` uses this space too, and that is the one place the
   * translation is actually needed.
   */
  id: string;
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
