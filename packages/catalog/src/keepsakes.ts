import type { GodId, KeepsakeId } from "@repo/core";
import { type GameKey, dataFor } from "./data.js";
import type { GodRecord, KeepsakeRecord } from "./schema.js";

/**
 * Which god a keepsake forces into the god pool, for the keepsakes that force
 * one at all.
 *
 * This is what makes the pool cap soft: the cap only bounds the gods a run is
 * *offered*, and equipping an absent god's keepsake pulls that god in past it.
 * A game-rules implementation needs the mapping to answer whether a god can
 * still enter a full pool, and the mapping itself has no dependence on run
 * state, so it belongs on this side of the seam rather than in the rules.
 *
 * Derived rather than listed. A keepsake forces a god exactly when the id in
 * its `associatedGod` field is a god that occupies a pool slot: the field also
 * carries NPCs (`NPC_Nyx_01`), and the gods it names that hold no pool slot are
 * the ones a forcing keepsake would be meaningless for -- Chaos, Hermes and
 * Selene grant boons without ever taking a slot, so there is no cap for a
 * keepsake of theirs to push past. Deriving it means a patch that adds a god
 * widens the map on the next extraction instead of waiting for someone to
 * remember this file.
 *
 * Note the two id spaces this has to bridge, because nothing about the field
 * names says so: `associatedGod` holds a god's *loot table* id (`ZeusUpgrade`),
 * while a god is addressed everywhere else -- trait records, requirement atoms,
 * the god member lists -- by the bare name that keys the god table (`Zeus`).
 * The values below are the bare form, which is the one a run's god pool and a
 * requirement both speak.
 *
 * Built once per game and handed back by identity, same as the member lists:
 * the mapping is fixed for a data snapshot, so rebuilding it per call would
 * scan every keepsake on every feasibility question the UI asks.
 */
function build(game: GameKey): ReadonlyMap<KeepsakeId, GodId> {
  const gods = dataFor(game).gods as Record<GodId, GodRecord>;
  const pooled = new Map<string, GodId>();
  for (const [god, record] of Object.entries(gods)) {
    if (record.kind === "PoolSlot") pooled.set(record.id, god);
  }

  const forcing = new Map<KeepsakeId, GodId>();
  const keepsakes = dataFor(game).keepsakes as Record<KeepsakeId, KeepsakeRecord>;
  for (const [keepsake, record] of Object.entries(keepsakes)) {
    const god = record.associatedGod === null ? undefined : pooled.get(record.associatedGod);
    if (god !== undefined) forcing.set(keepsake, god);
  }
  return forcing;
}

const FORCING: Readonly<Record<GameKey, ReadonlyMap<KeepsakeId, GodId>>> = Object.freeze({
  hades1: build("hades1"),
  hades2: build("hades2"),
});

/**
 * The keepsakes that force a god into the pool, mapped to the god each forces.
 *
 * A `ReadonlyMap` rather than a frozen object because freezing a Map does not
 * stop anyone writing to it; the type is the whole of the guarantee, and every
 * caller here only reads.
 */
export function forcingKeepsakes(game: GameKey): ReadonlyMap<KeepsakeId, GodId> {
  return FORCING[game];
}
