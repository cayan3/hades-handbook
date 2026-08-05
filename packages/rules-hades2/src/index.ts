import { type TraitRecord, forcingKeepsakes, traitsFor } from "@repo/catalog";
import type { GameRules, GodId, KeepsakeId, Reason, RunFacts, TraitId } from "@repo/core";

/**
 * Hades II implementation of the game-rules seam.
 *
 * Everything here is fact-dependent by construction: the seam holds the
 * questions whose answer changes as a run goes, and the catalog holds the ones
 * whose answer is fixed for a data snapshot. What this file supplies is the
 * pairing of the two -- a verdict, computed from one run's facts against the
 * records that never move.
 *
 * The pool half is confirmed identical to Hades I, so the two implementations
 * agree line for line rather than by accident. They are still written out
 * twice: they are separate implementations of one interface, the package layout
 * gives them nowhere to share code that is not either the pure domain package
 * (which must not implement its own seam) or the catalog (which must stay free
 * of run state), and both games are released and static, so there is no patch
 * coming that could drift one from the other.
 *
 * What differs between the games is the data each reads, and that difference is
 * real: Hades II carries seven mutually exclusive groups -- the five-way Cast
 * family and the two Array boons -- and exactly two aspect conflicts, both on
 * Chaos curses that are not offered alongside the autofire Torch. It carries no
 * one-directional blocks at all. The tests beside this file pin those counts,
 * because the point of reading a field is that it fires.
 */

/**
 * How many gods a run is offered before the cap bites. Four in both games:
 * Hades I hardcodes it and Hades II reads a run value that is also literally
 * four, with nothing in either game lowering it.
 */
const POOL_CAPACITY = 4;

/**
 * How many regions a run passes through, which is what bounds the number of
 * times a keepsake can be swapped in. Four, and the keepsakes that force a god
 * outnumber that in both games, which is why a run can never exhaust the supply
 * and why remaining regions -- not remaining keepsakes -- is the thing to count.
 */
const REGIONS_PER_RUN = 4;

/**
 * The catalog reads this implementation needs, as data rather than as an
 * import, so a test can state a small world instead of asserting against six
 * hundred shipped records.
 */
export interface RulesCatalog {
  /** Trait records with the overlay folded in. */
  traits: Readonly<Record<TraitId, TraitRecord>>;
  /** Which god each keepsake forces into the pool. */
  forcingKeepsakes: ReadonlyMap<KeepsakeId, GodId>;
}

export function shippedCatalog(): RulesCatalog {
  return { traits: traitsFor("hades2"), forcingKeepsakes: forcingKeepsakes("hades2") };
}

export function createRules(catalog: RulesCatalog = shippedCatalog()): GameRules {
  const { traits, forcingKeepsakes: forcing } = catalog;

  return {
    poolCapacity(): number {
      return POOL_CAPACITY;
    },

    /**
     * Whether a god can still enter the pool this run.
     *
     * The cap is soft. It bounds which gods the game *offers*, and equipping an
     * absent god's keepsake pulls that god in regardless, so the question is
     * not "is the pool full" but "is there any way left to add to it". There
     * are three ways there is, and this returns false only when all three are
     * spent:
     *
     * The pool has room, so the god may simply be offered.
     *
     * A region boundary remains, which is where keepsakes are swapped, so the
     * god's own keepsake can still be equipped in time to matter.
     *
     * Or the run is already carrying that god's keepsake. This is the case the
     * region count alone gets wrong: in the last region there is no boundary
     * left to swap at, but a keepsake equipped before entering it is still
     * equipped, and the god it forces can still turn up. Answering "full" there
     * would tell a player their build is impossible while the thing that makes
     * it possible is sitting in their keepsake slot.
     *
     * Anything short of a proven dead end returns true, because wrongly calling
     * a god unreachable is the most damaging answer this engine can give: the
     * verdict a player acts on is "impossible tonight", and a false one sends
     * them away from a build that was open. Unknown progress is therefore
     * generous, and so is a region counter outside the range this game has --
     * a number this code does not recognise is not evidence of a dead end.
     */
    canGodEnterPool(god: GodId, facts: RunFacts): boolean {
      if (facts.godPool.has(god)) return true;
      if (facts.godPool.size < POOL_CAPACITY) return true;
      const region = facts.progress?.region;
      if (region === undefined) return true;
      if (region !== REGIONS_PER_RUN) return true;
      const keepsake = facts.equipped.keepsake;
      return keepsake !== undefined && forcing.get(keepsake) === god;
    },

    /**
     * Whether one trait is structurally out of reach this run, and why.
     *
     * `null` means "not impossible", which is weaker than "available now" --
     * the trait's own prerequisites are a separate question this never asks.
     *
     * The four things that can make a trait unreachable are checked in the
     * order below, and where more than one applies the first is reported. The
     * order is by how the run got there rather than by severity: a ban is a
     * condition on the whole run, the equipped kit was chosen before it
     * started, and the two trait-versus-trait cases depend on what has been
     * picked up since. Each list is sorted by the extractor, so the answer is
     * the same every time it is asked.
     *
     * A trait this catalog has never heard of is not blocked. It is more likely
     * a stale id than a real impossibility, and answering "impossible" about an
     * id nobody can look up is the false verdict again, with nothing to show
     * the player about why.
     */
    isBlocked(trait: TraitId, facts: RunFacts): Reason | null {
      if (facts.bans.has(trait)) return { kind: "banned", trait };

      const record = traits[trait];
      if (record === undefined) return null;

      /**
       * A weapon form is *equipped*, never held, and that is the whole reason
       * this is its own field and its own question. Answering it against the
       * held traits is how nineteen of these spent a session filed as blocks,
       * looking for an aspect among the picked-up traits and never finding one,
       * so the constraint was real and permanently inert. In Hades I the same
       * mistake is available from the other side: an aspect there *is* a trait
       * record, and the run does hold it, so reading `held` would appear to
       * work while answering a different question. The aspect the run equipped
       * is the fact, and it is the only one consulted.
       *
       * With no aspect equipped there is nothing to conflict with. That is not
       * a run that has escaped the constraint, only one that has not yet
       * chosen -- which is a "not yet", and not this function's to report.
       */
      const aspect = facts.equipped.aspect;
      if (aspect !== undefined && (record.aspectConflicts ?? []).includes(aspect)) {
        return { kind: "aspectConflict", aspect, trait };
      }

      /**
       * A one-directional block: holding the blocker costs the blocked trait
       * for the rest of the run, while taking them in the other order leaves
       * both. Every blocker listed is something the run cannot shed -- a
       * removable one would make this a false impossible for a player who
       * merely has the wrong keepsake on right now, so those are dropped during
       * extraction and never reach here.
       */
      for (const blocker of record.blockedBy ?? []) {
        if (facts.held.has(blocker)) return { kind: "blockedByTrait", trait, blockedBy: blocker };
      }

      /**
       * Mutual exclusion, which is symmetric where the block above is not:
       * holding any member costs every other member, whichever was taken first.
       *
       * A record's group lists the record itself, so holding the trait in
       * question is not a conflict with anything -- and a run that already
       * holds it is asking a question that was answered before this call, since
       * satisfaction is read before feasibility everywhere.
       *
       * No group id is reported because the games declare no such thing: a
       * group here is the record's own neighbourhood, and collapsing that to an
       * identifier would mean inventing one. Naming the specific trait in the
       * way is also the more useful half for a player, who wants to know what
       * they gave up rather than which set it belonged to.
       */
      for (const member of record.exclusiveGroup ?? []) {
        if (member !== trait && facts.held.has(member)) {
          return { kind: "slotConflict", trait, conflictsWith: member };
        }
      }

      return null;
    },
  };
}
