import { type TraitRecord, forcingKeepsakes, poolGods, traitsFor } from "@repo/catalog";
import type { GameRules, GodId, KeepsakeId, Reason, RunFacts, TraitId } from "@repo/core";

/**
 * Hades II implementation of the game-rules seam.
 *
 * Every question answered here depends on run facts. That is the split: the
 * seam takes the questions whose answer changes as a run goes, and the catalog
 * takes the ones fixed for a data snapshot. This file pairs the two, turning
 * one run's facts and the records that never move into a verdict.
 *
 * The pool half is identical to Hades I's, checked rather than assumed, and it
 * is still written out twice on purpose. These are two implementations of one
 * interface, and the only places they could share code are the pure domain
 * package (which must not implement its own seam) and the catalog (which has to
 * stay free of run state). Both games are released and static, so no patch is
 * coming that could drift one copy from the other.
 *
 * What genuinely differs is the data each side reads. Hades II carries seven
 * mutually exclusive groups — the five-way Cast family plus the two Array
 * boons — and exactly two aspect conflicts, both Chaos curses that are not
 * offered alongside the autofire Torch. It carries no one-directional blocks at
 * all. The tests beside this file pin those counts, since reading a field is
 * only worth anything if it fires.
 */

/**
 * How many gods a run is offered before the cap bites. Four in both games:
 * Hades I hardcodes it, Hades II reads a run value that is also four, and
 * nothing in either game ever lowers it.
 */
const POOL_CAPACITY = 4;

/**
 * How many regions a run passes through, which bounds how many times a keepsake
 * can be swapped in. Four, and the forcing keepsakes outnumber that in both
 * games, so a run can never exhaust the supply. Remaining regions are what to
 * count, not remaining keepsakes.
 */
const REGIONS_PER_RUN = 4;

/**
 * The catalog reads this implementation needs, passed as data rather than
 * imported, so a test can state a small world instead of asserting against six
 * hundred shipped records.
 */
export interface RulesCatalog {
  /** Trait records with the overlay folded in. */
  traits: Readonly<Record<TraitId, TraitRecord>>;
  /** Which god each keepsake forces into the pool. */
  forcingKeepsakes: ReadonlyMap<KeepsakeId, GodId>;
  /** The gods that hold a pool slot, which are the ones the cap counts. */
  poolGods: ReadonlySet<GodId>;
}

export function shippedCatalog(): RulesCatalog {
  return {
    traits: traitsFor("hades2"),
    forcingKeepsakes: forcingKeepsakes("hades2"),
    poolGods: poolGods("hades2"),
  };
}

export function createRules(catalog: RulesCatalog = shippedCatalog()): GameRules {
  const { traits, forcingKeepsakes: forcing, poolGods: pooled } = catalog;

  return {
    poolCapacity(): number {
      return POOL_CAPACITY;
    },

    /**
     * Whether a god can still enter the pool this run.
     *
     * The cap is soft. It bounds which gods the game *offers*, and equipping an
     * absent god's keepsake pulls that god in anyway, so the real question is
     * not "is the pool full" but "is there any way left to add to it". There
     * are three, and this returns false only once all three are spent.
     *
     * The pool has room, so the god may simply be offered.
     *
     * A region boundary remains, which is where keepsakes get swapped, so the
     * god's own keepsake can still go on in time to matter.
     *
     * Or the run is already carrying that god's keepsake. This is the case
     * counting regions alone gets wrong: in the last region there is no
     * boundary left to swap at, but a keepsake equipped before entering it is
     * still equipped, and the god it forces can still turn up. Answering "full"
     * there would tell a player their build is impossible while the thing that
     * saves it sits in their keepsake slot.
     *
     * Anything short of a proven dead end returns true. Wrongly calling a god
     * unreachable is the most damaging answer this engine can give — a player
     * acts on "impossible tonight" and walks away from a build that was open —
     * so unknown progress is treated generously, and so is a region number
     * outside the range this game has. A counter this code does not recognise
     * is not evidence of anything.
     *
     * Only gods that hold a pool slot count toward the cap, which is why the
     * count below is not just the size of the pool. A run's god pool holds every
     * god it took a reward from, and Hermes, Chaos and Selene hand out boons
     * without ever claiming a slot; the game leaves them out by the same flag it
     * uses to set the cap. Counting them would fill the pool three gods early
     * and report a god as unreachable while slots were still free.
     */
    canGodEnterPool(god: GodId, facts: RunFacts): boolean {
      if (facts.godPool.has(god)) return true;
      let occupied = 0;
      for (const inPool of facts.godPool) if (pooled.has(inPool)) occupied++;
      if (occupied < POOL_CAPACITY) return true;
      const region = facts.progress?.region;
      if (region === undefined) return true;
      if (region !== REGIONS_PER_RUN) return true;
      const keepsake = facts.equipped.keepsake;
      return keepsake !== undefined && forcing.get(keepsake) === god;
    },

    /**
     * Whether one trait is structurally out of reach this run, and why.
     *
     * `null` means "not impossible", which is weaker than "available now" — the
     * trait's own prerequisites are a separate question nothing here asks.
     *
     * Four things can make a trait unreachable. They are checked in the order
     * below, and where more than one applies the first is what gets reported.
     * The order follows how the run arrived at each rather than how severe each
     * is: a ban conditions the whole run, the equipped kit was chosen before it
     * started, and the two trait-versus-trait cases turn on what has been picked
     * up since. Every list is sorted by the extractor, so asking again gives the
     * same answer.
     *
     * A trait this catalog has never heard of is not blocked. A stale id is far
     * more likely than a real impossibility, and answering "impossible" about an
     * id nobody can look up is the false verdict again, with nothing to show the
     * player about why. The lookup asks for an own property so every unknown id
     * gets the same answer: a plain object hands back something for `toString`,
     * and checking for `undefined` alone would let that through as a record.
     */
    isBlocked(trait: TraitId, facts: RunFacts): Reason | null {
      if (facts.bans.has(trait)) return { kind: "banned", trait };

      const record = Object.hasOwn(traits, trait) ? traits[trait] : undefined;
      if (record === undefined) return null;

      /**
       * A weapon form is *equipped*, never held, which is the whole reason this
       * gets its own field and its own question. Answer it against the held
       * traits and you get what happened to nineteen of these for a session:
       * filed as blocks, hunting for an aspect among the picked-up traits,
       * never finding one, so a real constraint sat permanently inert. Hades I
       * offers the same mistake from the other side, where an aspect *is* a
       * trait record and the run does hold it, so reading `held` looks like it
       * works while answering a different question. The aspect the run equipped
       * is the fact, and it is the only one consulted.
       *
       * With no aspect equipped there is nothing to conflict with. That is not
       * a run that escaped the constraint, only one that has not chosen yet —
       * a "not yet", which is not this function's to report.
       */
      const aspect = facts.equipped.aspect;
      if (aspect !== undefined && (record.aspectConflicts ?? []).includes(aspect)) {
        return { kind: "aspectConflict", aspect, trait };
      }

      /**
       * A one-directional block: holding the blocker costs the blocked trait
       * for the rest of the run, while taking them in the other order leaves
       * both. Every blocker listed is something the run cannot shed. A
       * removable one would make this a false impossible for a player who
       * merely has the wrong keepsake on right now, so those get dropped during
       * extraction and never reach here.
       */
      for (const blocker of record.blockedBy ?? []) {
        if (facts.held.has(blocker)) return { kind: "blockedByTrait", trait, blockedBy: blocker };
      }

      /**
       * Mutual exclusion, symmetric where the block above is not: holding any
       * member costs every other member, whichever was taken first.
       *
       * A record's group lists the record itself, so holding the trait in
       * question conflicts with nothing. A run that already holds it is asking
       * a question settled before this call anyway, since satisfaction is read
       * before feasibility everywhere.
       *
       * No group id is reported, because the games declare no such thing. A
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
