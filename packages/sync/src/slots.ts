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
    (talents !== undefined && talents.size > 0) ||
    intent.pins.size > 0 ||
    intent.planned.size > 0 ||
    intent.notes.size > 0
  );
}

/**
 * What one slot holds, asked of all four so the save screen can draw them.
 *
 * A record that will not decode is reported in its own slot rather than
 * thrown: with one filed run a throw cost the caller a summary, and with four
 * it would cost them the whole door.
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

  if (active !== null) await store.save(game, 1, active);
  if (last !== null) await store.save(game, 2, last);
  // Slot 1 whether or not there was an active record: the run in progress was
  // that one, and an absent record there is the empty run it already was.
  await store.setOpenSlot(game, 1);
  await Promise.all([store.clear(game, "active"), store.clear(game, "last")]);
}
