import type { GodId, KeepsakeId } from "@repo/core";
import { type GameKey, dataFor } from "./data.js";
import { pooledByLootId } from "./gods.js";
import type { KeepsakeRecord } from "./schema.js";

/**
 * Which god each keepsake forces into the god pool, for the keepsakes that
 * force one at all.
 *
 * This is what makes the pool cap soft. The cap only bounds the gods a run is
 * *offered*; equipping an absent god's keepsake pulls that god in regardless.
 * A game-rules implementation has to know the mapping to answer whether a god
 * can still enter a full pool, and the mapping never depends on run state, so
 * it belongs here rather than over in the rules.
 *
 * It is derived, not listed. A keepsake forces a god exactly when the id in its
 * `associatedGod` field names a god that holds a pool slot. That field also
 * carries NPCs (`NPC_Nyx_01`), and the gods it names that hold no slot are the
 * ones a forcing keepsake would mean nothing for: Chaos, Hermes and Selene
 * grant boons without ever taking a slot, so there is no cap for their
 * keepsakes to push past. Patches wouldn't add any more gods ofc, but
 * theoretically if one did, deriving this would widen the map at the next
 * extraction, instead of waiting for someone to remember this file exists.
 *
 * The obvious shortcut is to match the id instead — every one of these is named
 * `Force<God>Boon…` — and today that gives exactly the same set in both games,
 * eight and nine. The agreement is the trap rather than the evidence. An id
 * prefix is a marker somebody maintains, so a patch that renames one, or adds a
 * god whose keepsake is named some other way, would quietly narrow this map,
 * where the derivation widens on the next extraction. Reading the field costs a
 * lookup and cannot go stale in silence.
 *
 * Watch the two id spaces this has to bridge, because nothing in the field
 * names warns you. `associatedGod` holds a god's *loot table* id
 * (`ZeusUpgrade`), while everywhere else — trait records, requirement atoms,
 * the god member lists — a god is addressed by the bare name that keys the god
 * table (`Zeus`). The values built below are the bare form, which is what a
 * run's god pool and a requirement both speak.
 *
 * Built once per game and handed back by identity, like the member lists. A
 * data snapshot fixes the mapping, so rebuilding it per call would rescan every
 * keepsake on every feasibility question the UI asks.
 */
function build(game: GameKey): ReadonlyMap<KeepsakeId, GodId> {
  const pooled = pooledByLootId(game);

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
 * The forcing keepsakes, each mapped to the god it forces.
 *
 * A `ReadonlyMap` rather than a frozen object: freezing a Map does not stop
 * anyone writing to it, so the type is the entire guarantee here. Every caller
 * only reads.
 */
export function forcingKeepsakes(game: GameKey): ReadonlyMap<KeepsakeId, GodId> {
  return FORCING[game];
}

/**
 * The keepsake records, typed. `dataFor` hands the extraction back as `unknown`,
 * so without this every caller writes the same cast, and a cast in four places
 * is four places to get it wrong. Mirrors `traitsFor` minus the overlay, which
 * has no keepsake entries to fold in.
 *
 * The one caller today is the copy on a full-pool verdict, naming the keepsake
 * that would still pull the absent god in — looked up in the keepsake space on
 * purpose, since in Hades II all 35 keepsakes are *also* trait records under the
 * same id, while in Hades I the two spaces share nothing.
 */
export function keepsakesFor(game: GameKey): Readonly<Record<KeepsakeId, KeepsakeRecord>> {
  return dataFor(game).keepsakes as Readonly<Record<KeepsakeId, KeepsakeRecord>>;
}
