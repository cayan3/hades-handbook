import type { RunFacts, TraitId } from "@repo/core";
import { deriveNodeView, type NodeSource, type NodeView } from "./node-view.js";

/**
 * Deriving a node costs a requirement-tree walk plus a feasibility question, and
 * every view derives all of them — thirty-odd on a god's page, thirty-seven on
 * the duo grid, redrawn on every edit to the run. The budget is one game
 * re-derived inside a frame on a mid-range phone.
 *
 * Keyed on the data snapshot and the *effective* facts — the source's with the
 * player's hand-edits over them, because that is what evaluation reads.
 *
 * **Facts identity is the invalidation signal**, which is a claim about the
 * layer below rather than about this file: it replaces the whole object on any
 * change and shares the collections nothing touched. What would poison it is a
 * writer that mutated a collection in place while keeping the object it hangs
 * off — the cache would then serve answers about a run that no longer exists and
 * nothing would look wrong. Worth knowing rather than guarding, since the guard
 * is a traversal of exactly what the cache exists to avoid.
 *
 * Rules and lookups are out of the key deliberately: both are fixed for a
 * snapshot, and the rules object's answers vary only with the facts. The data
 * version is checked anyway, for a string comparison a hit, because it catches
 * the one case identity cannot — the same facts object with a different snapshot
 * written into it.
 */
export interface NodeCache {
  /** The node's view, derived once per (facts object, trait). */
  viewOf(trait: TraitId, facts: RunFacts): NodeView;
  /** Derivations actually performed, exposed so the invalidation can be tested
   * rather than assumed. */
  readonly derivations: number;
}

interface Entry {
  readonly dataVersion: string;
  readonly views: Map<TraitId, NodeView>;
}

export function createNodeCache(source: NodeSource): NodeCache {
  // Weak, so a run's derived nodes go when the facts object does. A strong map
  // would hold every intermediate state of a run for as long as the page is open.
  const byFacts = new WeakMap<RunFacts, Entry>();
  let derivations = 0;

  return {
    viewOf(trait, facts) {
      let entry = byFacts.get(facts);
      if (entry === undefined || entry.dataVersion !== facts.dataVersion) {
        entry = { dataVersion: facts.dataVersion, views: new Map() };
        byFacts.set(facts, entry);
      }

      const cached = entry.views.get(trait);
      if (cached !== undefined) return cached;

      const view = deriveNodeView(source, trait, facts);
      entry.views.set(trait, view);
      derivations++;
      return view;
    },

    get derivations() {
      return derivations;
    },
  };
}
