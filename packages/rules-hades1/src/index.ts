import { type TraitRecord, poolGods, traitsFor } from "@repo/catalog";
import type { GameRules, GodId, Reason, RunFacts, TraitId } from "@repo/core";

/**
 * Hades I implementation of the game-rules seam.
 *
 * Thin where the sequel's systems are simply absent — there are no elements, so
 * no element question ever reaches here — and not thin at all in what it has to
 * answer, because nearly every feasibility edge in the project belongs to this
 * game. Hades I carries seventeen aspect conflicts across sixteen records,
 * twelve one-directional blocks across five, and nine mutually exclusive
 * groups, against Hades II's two, none and seven. Almost all seventeen are
 * against the shield form that replaces the Cast, which is why so many of a
 * god's ordinary ranged boons name one.
 *
 * The pool half is written out again rather than shared with the Hades II
 * package. These are two implementations of one interface, neither may import
 * the other, and the only places they could share code are the pure domain
 * package (which must not implement the seam it declares) and the catalog
 * (which has to stay free of run state). Both games are released and static, so
 * the copies cannot drift apart under a patch. What differs is the data each
 * one reads, and the tests beside each file pin that game's own populations.
 *
 * One thing this game does that its sequel does not: a weapon aspect here *is*
 * an ordinary trait record, and the run holds it. That makes reading an aspect
 * conflict off the held traits look like it works. It is exactly why the
 * equipped kit is the only thing consulted — see the aspect branch below.
 */

/** How many gods a run is offered before the cap bites. Hades I hardcodes four. */
const POOL_CAPACITY = 4;

/**
 * The catalog reads this implementation needs, passed as data rather than
 * imported, so a test can state a small world instead of asserting against four
 * hundred shipped records.
 */
export interface RulesCatalog {
  /** Trait records with the overlay folded in. */
  traits: Readonly<Record<TraitId, TraitRecord>>;
  /** The gods that hold a pool slot, which are the ones the cap counts. */
  poolGods: ReadonlySet<GodId>;
}

export function shippedCatalog(): RulesCatalog {
  return {
    traits: traitsFor("hades1"),
    poolGods: poolGods("hades1"),
  };
}

export function createRules(catalog: RulesCatalog = shippedCatalog()): GameRules {
  const { traits, poolGods: pooled } = catalog;

  return {
    poolCapacity(): number {
      return POOL_CAPACITY;
    },

    /**
     * Whether the run has used up its cap on gods.
     *
     * Only gods that hold a pool slot count, which is why the count below is
     * not just the size of the pool. A run's god pool holds every god it took a
     * reward from, and Hermes and Chaos hand out boons without ever claiming a
     * slot; the game leaves them out by the same flag it uses to set the cap.
     * Counting them would fill the pool two gods early and shut the door while
     * slots were still open.
     *
     * A full pool is not the end of the matter and this answer is not the whole
     * verdict. The cap bounds which gods the game *offers*; equipping an absent
     * god's keepsake pulls that god in anyway, at any point in the run. Saying
     * which absent gods that leaves genuinely out of reach would mean knowing
     * how many chances to swap a keepsake in the run has left, and nothing hands
     * this code that number, so the question this answers is the one it can:
     * whether the pool is offering anybody else. The keepsake route is spelled
     * out in the copy that goes with the verdict rather than left implied.
     */
    isGodPoolFull(facts: RunFacts): boolean {
      let occupied = 0;
      for (const inPool of facts.godPool) if (pooled.has(inPool)) occupied++;
      return occupied >= POOL_CAPACITY;
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
     * began, and the two trait-versus-trait cases turn on what has been picked
     * up since. Every list is sorted by the extractor, so asking again gives the
     * same answer.
     *
     * A trait this catalog has never heard of is not blocked. A stale id is far
     * more likely than a real dead end, and "impossible" about something nobody
     * can look up leaves a player nothing to act on. The lookup asks for an own
     * property so every unknown id gets the same answer: a plain object hands
     * back something for `toString`, and checking for `undefined` alone would
     * let that through as a record.
     */
    isBlocked(trait: TraitId, facts: RunFacts): Reason | null {
      if (facts.bans.has(trait)) return { kind: "banned", trait };

      const record = Object.hasOwn(traits, trait) ? traits[trait] : undefined;
      if (record === undefined) return null;

      /**
       * A weapon form is *equipped*, never picked up. In this game the form is
       * also a trait record in its own right — Aspect of Beowulf is
       * `ShieldLoadAmmoTrait`, and the run holds it once the weapon is chosen —
       * so reading these off the held traits looks like it works while
       * answering a different question. It is the same confusion that left
       * nineteen of these in the block field for a session, hunting for an
       * aspect among held traits and never firing. The equipped aspect is the
       * fact, and it is the only one read.
       *
       * With no aspect equipped there is nothing to conflict with. That is a
       * run that has not chosen yet — a "not yet", which is not this function's
       * to report.
       */
      const aspect = facts.equipped.aspect;
      if (aspect !== undefined && (record.aspectConflicts ?? []).includes(aspect)) {
        return { kind: "aspectConflict", aspect, trait };
      }

      /**
       * A one-directional block: holding the blocker costs this trait for the
       * rest of the run, while taking the two in the other order leaves both
       * held. Every blocker that survives extraction is something the run
       * cannot shed. A keepsake-granted one would make this a false impossible
       * for a player who merely has the wrong keepsake on, so those get dropped
       * before they reach here.
       */
      for (const blocker of record.blockedBy ?? []) {
        if (facts.held.has(blocker)) return { kind: "blockedByTrait", trait, blockedBy: blocker };
      }

      /**
       * Mutual exclusion, symmetric where the block above is not: holding any
       * member costs the others regardless of which came first.
       *
       * A record lists itself in its own group, so holding the trait in
       * question conflicts with nothing. That case is settled before this call
       * anyway, since satisfaction is read before feasibility everywhere.
       *
       * No group id is reported, because the game declares none. A group here
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
