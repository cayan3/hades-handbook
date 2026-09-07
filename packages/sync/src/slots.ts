import type { GameId, RunState } from "@repo/core";
import type { RunStore, SaveSlot } from "./store.js";

/**
 * Whether a run holds anything a player put there.
 *
 * One predicate, because three surfaces ask it and they used to ask it
 * separately: a slot only draws as taken where this is true, so a run with
 * nothing in it never occupies a slot and never has to be chosen over.
 *
 * `slots` is not read. A boon taken and then corrected leaves the position
 * behind with nothing in it, which is a run holding nothing.
 *
 * The talent map is read for being *there* rather than for having entries: an
 * empty one means the Mirror was asked and nothing was chosen, which the codec
 * keeps apart from an absent one and which a player put there like anything
 * else. It is checked field by field in the test beside this, so a field added
 * to a run later cannot quietly leave a slot reading free.
 */
export function holdsSomething(state: RunState): boolean {
  const { facts, intent } = state;
  const { weapon, aspect, keepsake, talents } = facts.equipped;
  return (
    facts.held.size > 0 ||
    facts.godPool.size > 0 ||
    facts.resources.size > 0 ||
    facts.bans.size > 0 ||
    weapon !== undefined ||
    aspect !== undefined ||
    keepsake !== undefined ||
    talents !== undefined ||
    intent.pins.size > 0 ||
    intent.planned.size > 0 ||
    intent.notes.size > 0
  );
}

/**
 * What one slot holds, asked of all three so the save screen can draw them.
 *
 * A record that cannot be read is reported in its own slot rather than thrown:
 * with one filed run a throw cost the caller a summary, and with three it would
 * cost them the whole door.
 */
export type SlotContents =
  | { readonly kind: "empty" }
  | { readonly kind: "run"; readonly run: RunState }
  | { readonly kind: "unreadable"; readonly cause: Error };

/** A slot and what is in it, named rather than positional. */
export interface SlotRecord {
  readonly slot: SaveSlot;
  readonly contents: SlotContents;
}

/**
 * Moves the two records the earlier build wrote into slots 1 and 2.
 *
 * Every installed copy has them, and this is the one place this row can lose
 * somebody's run — so the pointer is written last and the old keys are dropped
 * after it. A failure anywhere before that leaves the pointer unset, which is
 * what makes the next load try again rather than start over.
 */
export async function adoptLegacySlots(store: RunStore, game: GameId): Promise<void> {
  // A pointer is only ever written by a build that has slots, so its presence
  // is the record of this having run.
  if ((await store.openSlot(game)) !== null) return;

  const [active, last] = await Promise.all([store.load(game, "active"), store.load(game, "last")]);
  if (active === null && last === null) return;

  // A slot with a run already in it is left alone. The pointer is the record of
  // this having run, but it is written last, so a slot written before it went
  // down is a run this pass would otherwise put an older copy over.
  const free = async (slot: SaveSlot) => (await store.load(game, slot)) === null;
  if (active !== null && (await free(1))) await store.save(game, 1, active);
  if (last !== null && (await free(2))) await store.save(game, 2, last);
  // Slot 1 whether or not there was an active record: the run in progress was
  // that one, and an absent record there is the empty run it already was.
  await store.setOpenSlot(game, 1);
  await Promise.all([store.clear(game, "active"), store.clear(game, "last")]);
}
