import type { GodId } from "@repo/core";
import { type GameKey, dataFor } from "./data.js";
import type { GodRecord } from "./schema.js";

/**
 * The gods that hold a slot in the run's god pool.
 *
 * The cap is a count, so something has to say what counts. Not every god a run
 * takes a reward from does: Hermes and Chaos in both games, and Selene in
 * Hades II, hand out boons without ever claiming a slot. The games agree, since
 * their loot tables switch off the same god-loot flag the cap is computed over.
 * Count them anyway and the pool reads full while slots are still free, which
 * is how a god a player can still reach gets reported as impossible.
 *
 * One scan, two maps, because the same table answers two opposite questions.
 * `poolGods` answers "does this god hold a slot", keyed by the bare name
 * everything else uses to address a god. `pooledByLootId` answers "whose loot
 * table is this", and exists because a keepsake names its god in that other id
 * space. It stays unexported: translating between the two spaces is this
 * package's job, not a caller's.
 *
 * Both are built once per game and handed back by identity, like the member
 * lists and the merged records. A data snapshot fixes them, and rebuilding per
 * call would rescan the god table on every feasibility question the UI asks.
 */
function build(game: GameKey): { gods: ReadonlySet<GodId>; byLootId: ReadonlyMap<string, GodId> } {
  const gods = new Set<GodId>();
  const byLootId = new Map<string, GodId>();
  const table = dataFor(game).gods as Record<GodId, GodRecord>;
  for (const [god, record] of Object.entries(table)) {
    if (record.kind !== "PoolSlot") continue;
    gods.add(god);
    byLootId.set(record.id, god);
  }
  return { gods, byLootId };
}

const POOLED: Readonly<Record<GameKey, ReturnType<typeof build>>> = Object.freeze({
  hades1: build("hades1"),
  hades2: build("hades2"),
});

/**
 * The pool-slot gods, keyed by the name a requirement and a run's god pool both
 * use.
 *
 * A `ReadonlySet` rather than a frozen array: every caller is asking about
 * membership, and none of them needs an order.
 */
export function poolGods(game: GameKey): ReadonlySet<GodId> {
  return POOLED[game].gods;
}

/** The same gods keyed by loot table id, which is the space keepsakes name. */
export function pooledByLootId(game: GameKey): ReadonlyMap<string, GodId> {
  return POOLED[game].byLootId;
}
