import { type TraitRecord, forcingKeepsakes, traitsFor } from "@repo/catalog";
import type { GameRules, GodId, KeepsakeId, Reason, RunFacts, TraitId } from "@repo/core";

/**
 * Hades I implementation of the game-rules seam.
 *
 * Degenerate in the way the sequel's systems are absent -- no elements, so no
 * element question ever reaches here -- and not degenerate at all in what it
 * has to answer, because nearly every feasibility edge in the project is this
 * game's. Hades I carries seventeen aspect conflicts across sixteen records,
 * twelve one-directional blocks across five, and nine mutually exclusive
 * groups; Hades II carries two, none and seven. The seventeen are almost all
 * against the shield form that replaces the Cast, which is why so many of a
 * god's ordinary ranged boons name one.
 *
 * The pool half is written out again rather than shared with the Hades II
 * package: they are two implementations of one interface, neither may import
 * the other, and the places they could share code are the pure domain package
 * (which must not implement the seam it declares) and the catalog (which must
 * stay free of run state). Both games are released and static, so the copies
 * cannot drift apart under a patch. What differs is the data each reads, and
 * the tests beside each file pin that game's own populations.
 *
 * One thing this game does that its sequel does not: a weapon aspect here *is*
 * an ordinary trait record, and a run holds it. That makes reading an aspect
 * conflict off the held traits look like it works, which is exactly why the
 * equipped kit is the only thing consulted -- see the aspect branch below.
 */

/** The gods a run is offered before the cap bites. Hades I hardcodes four. */
const POOL_CAPACITY = 4;

/**
 * The regions a run passes through, which bounds how many times a keepsake can
 * be swapped in. Four -- Tartarus through Styx -- against eight keepsakes that
 * force a god, so the supply of keepsakes cannot run out and remaining regions
 * is the thing worth counting.
 */
const REGIONS_PER_RUN = 4;

/**
 * The catalog reads this implementation needs, taken as data so a test can
 * state a small world rather than assert against four hundred shipped records.
 */
export interface RulesCatalog {
  /** Trait records with the overlay folded in. */
  traits: Readonly<Record<TraitId, TraitRecord>>;
  /** Which god each keepsake forces into the pool. */
  forcingKeepsakes: ReadonlyMap<KeepsakeId, GodId>;
}

export function shippedCatalog(): RulesCatalog {
  return { traits: traitsFor("hades1"), forcingKeepsakes: forcingKeepsakes("hades1") };
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
     * The cap bounds what the game *offers*; equipping an absent god's keepsake
     * pulls that god in past it. So the question is whether any way of adding
     * to the pool is left, and there are three:
     *
     * The pool has room, so the god may just be offered.
     *
     * A region boundary remains, which is where a keepsake can be swapped, so
     * the god's own keepsake can still be equipped in time.
     *
     * Or the run is already carrying that god's keepsake. Counting regions
     * alone misses this: in the last region there is no boundary left to swap
     * at, but a keepsake equipped before entering it is still equipped and the
     * god it forces can still appear. Reporting a full pool there would call a
     * build impossible while the thing that makes it possible is equipped.
     *
     * Everything short of a proven dead end is true. Wrongly calling a god
     * unreachable is the most damaging answer this engine gives, so unknown
     * progress is generous, and so is a region number outside the range this
     * game has -- a counter this code does not recognise is not evidence.
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
     * `null` means "not impossible", which is weaker than "available now": the
     * trait's own prerequisites are a separate question nothing here asks.
     *
     * The four cases are checked in the order below and the first that applies
     * is what gets reported. The order follows how the run arrived at each: a
     * ban conditions the whole run, the equipped kit was chosen before it
     * began, and the two trait-versus-trait cases turn on what has been picked
     * up since. Every list is sorted by the extractor, so repeating the
     * question gives the same answer.
     *
     * An id this catalog has never heard of is not blocked: that is far more
     * likely a stale id than a real dead end, and "impossible" about something
     * nobody can look up leaves a player nothing to act on.
     */
    isBlocked(trait: TraitId, facts: RunFacts): Reason | null {
      if (facts.bans.has(trait)) return { kind: "banned", trait };

      const record = traits[trait];
      if (record === undefined) return null;

      /**
       * A weapon form is equipped, never picked up. In this game the form is
       * also a trait record in its own right -- Aspect of Beowulf is
       * `ShieldLoadAmmoTrait`, and the run holds it once the weapon is chosen
       * -- so reading these off the held traits would appear to work while
       * answering a different question, and it is the same confusion that put
       * nineteen of these in the block field for a session, where they looked
       * for an aspect among held traits and never fired. The equipped aspect is
       * the fact, and it is the only one read.
       *
       * With no aspect equipped there is nothing to conflict with. That is a
       * run that has not chosen yet, which is a "not yet" rather than anything
       * this function reports.
       */
      const aspect = facts.equipped.aspect;
      if (aspect !== undefined && (record.aspectConflicts ?? []).includes(aspect)) {
        return { kind: "aspectConflict", aspect, trait };
      }

      /**
       * A one-directional block: holding the blocker costs this trait for the
       * rest of the run, while taking the two in the other order leaves both
       * held. Every blocker that survives extraction is something the run
       * cannot shed -- a keepsake-granted one would make this a false
       * impossible for a player who merely has the wrong keepsake on, so those
       * are dropped before they reach here.
       */
      for (const blocker of record.blockedBy ?? []) {
        if (facts.held.has(blocker)) return { kind: "blockedByTrait", trait, blockedBy: blocker };
      }

      /**
       * Mutual exclusion, symmetric where the block above is not: holding any
       * member costs the others regardless of which came first.
       *
       * A record lists itself in its own group, so holding the trait in
       * question conflicts with nothing -- and that case is settled before this
       * call anyway, since satisfaction is read before feasibility everywhere.
       *
       * No group id is reported, because the game declares none: a group here
       * is the record's own neighbourhood, which in this game is often a chain
       * rather than a clique, so there is frequently no single set to name even
       * in principle. The trait actually in the way is the more useful half.
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
