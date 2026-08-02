import type {
  AspectId,
  Element,
  GameId,
  GodId,
  KeepsakeId,
  Rarity,
  ResourceId,
  SlotId,
  TalentId,
  TalentSelection,
  TraitId,
} from "./ids.js";

/**
 * Everything true about the current run, split by provenance.
 *
 * Both games share one flat shape. "Provenance" here means the Facts vs Intent
 * split, and is also abt where the data came from: a sync source writes (& may
 * overwrite anything in) `facts` and never touches anything in `intent`, while
 * evaluation only ever reads `facts`. That's what makes the conflict policy
 * here (i.e. "what the user plans can't change what is satisfiable") an actual
 * type guarantee instead of a just convention.
 */
export interface RunState {
  facts: RunFacts;
  intent: RunIntent;
}

/** Game-derived run state. An external source may overwrite any of this. */
export interface RunFacts {
  game: GameId;
  /** Which extracted data snapshot these ids belong to. */
  dataVersion: string;

  held: Map<TraitId, HeldTrait>;
  /**
   * Gods the player has actually taken a reward from this run. These are
   * stored (i.e. not derived from `held`) bc even purging all boons from a
   * certain god doesn't "remove" them from the god pool. After the player picks
   * up a boon from a god, that "pickup" is never "undone" (there is no ctrl-z lol rip).
   */
  godPool: Set<GodId>;
  /** Empty for hades1 ofc. */
  elements: Map<Element, number>;
  slots: Map<SlotId, TraitId | null>;
  /**
   * The equipped kit. (Not the Loadout panel, which displays obtained boons).
   *
   * `talents` is the odd member and belongs here for the same reason the aspect
   * does: chosen before the run & fixed for its whole duration.
   *
   * It's a map instead of a set of the selected ones bc "nobody asked" has to
   * stay tellable apart from "asked, and no" **per talent**. A set carries that
   * distinction once, in whether the field is there at all, so the moment a
   * source knows any one talent it has to hand over a set, & the set then says
   * "not selected" abt every talent missing from it. Since an unselected talent
   * is impossible for the whole run, that turns silence into a permanent no on
   * every Mirror row nobody got around to asking abt.
   */
  equipped: {
    weapon?: string;
    aspect?: AspectId;
    keepsake?: KeepsakeId;
    talents?: Map<TalentId, TalentSelection>;
  };
  resources: Map<ResourceId, number>;
  /**
   * Not populated in v1. (This is primarily for Hades II's Vow of Denial.)
   * Evaluation doesn't read this field anyway; a ban reaches it as as
   * `isBlocked` which means `banned` (i.e. as a feasibility verdict abt one
   * trait, which is the same way every other block arrives), so there's
   * exactly one path in (i.e. as input to a `GameRules` implementation).
   */
  bans: Set<TraitId>;
  /**
   * How far into the run the player is. 1-indexed counters (i.e. instead of
   * 0-indexed (for once lol)), and w/o any actual region names since ordering is
   * all that matters & region names differ per game (or even type of run in
   * Hades II). Absent when the source can't supply it.
   *
   * Important (at least) bc the god pool cap is soft, i.e. even if the player
   * already has four distinct gods in their pool, equipping a fifth god's
   * keepsake "forces" that god into the god pool. Since keepsakes are swappable
   * each region, the number of remaining keepsake-equipping opportunities
   * determines whether or not a god is genuinely unreachable. If run progress
   * isn't tracked, the default is to treat a god as still reachable (bc it's
   * more damaging to mistakenly display a reachable god (even if they're only
   * reachable-via-keepsake) as unreachable; also, "this god is technically
   * reachable but you'll need to equip their keepsake to get them in your god
   * pool" is actually yk actionable whereas the dead end of "unreachable."
   * is.. much less so (not to mention maybe a bit ermmm idk ouch-ful ig
   * :pensive: :pensive:)).
   */
  progress?: { region: number; chamber: number };
}

/**
 * `rarity` is abt the boon state (i.e. `HeldTrait.rarity`) (it's not abt boon
 *  drop probability or whatnot). `level` is abt Pom of Power levels/ranks, and
 *  is 1-index (for once (again) lolol). The `req.minLevel ?? 1` in `evaluate.ts`
 *  defaults to "--", which is what makes `hasTrait{minLevel:1}` mean "held at all".
 */
export interface HeldTrait {
  rarity: Rarity;
  level: number;
}

/** User-authored state. Never written by an external run-state source. */
export interface RunIntent {
  /** Pinned targets (i.e. goals, forget-me-not's (FMN's for short)).
   * A pinned target serves as its own progress-tracking entry. */
  pins: Set<TraitId>;
  planned: Set<TraitId>;
  notes: Map<TraitId, string>;
}
