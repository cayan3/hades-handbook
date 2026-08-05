import { describe, expect, it } from "vitest";
import { type GameKey, dataFor } from "./data.js";
import { poolGods } from "./gods.js";
import { createLookups } from "./lookups.js";
import type { GodRecord, KeepsakeRecord } from "./schema.js";

/**
 * Two questions about the god table, both of which the obvious reading gets
 * wrong.
 *
 * First, which gods take a pool slot. That is what the run cap is counted over,
 * and the table's `kind` field is the only thing that says so. Handing out
 * boons and holding a slot are different things, and both games have several
 * gods that do the first without the second.
 *
 * Second, a god is named two different ways in this data. The table is keyed by
 * the bare name, which is what a requirement and a run's god pool speak; the
 * record inside carries its loot table id, which is what a keepsake points at.
 * The two spaces share no member, so code that mixes them up matches nothing at
 * all rather than failing loudly.
 */

const GAMES: readonly GameKey[] = ["hades1", "hades2"];
const EXPECTED: Record<GameKey, number> = { hades1: 9, hades2: 9 };

describe.each(GAMES)("%s pool gods", (game) => {
  const pooled = poolGods(game);
  const gods = dataFor(game).gods as Record<string, GodRecord>;

  it("is every god the table files as holding a slot, and nothing else", () => {
    expect(pooled.size).toBe(EXPECTED[game]);
    const filed = Object.entries(gods)
      .filter(([, record]) => record.kind === "PoolSlot")
      .map(([god]) => god);
    expect([...pooled].sort()).toEqual(filed.sort());
  });

  it("leaves out the gods who grant boons without ever taking a slot", () => {
    // Why the distinction is worth deriving at all: Hermes hands out boons in
    // both games and takes no slot, so a cap counted over every god a run took
    // a reward from would shut the pool a god early.
    expect(pooled.has("Hermes")).toBe(false);
    expect(pooled.has("Chaos")).toBe(false);
    expect(createLookups(game).boonsOfGod("Hermes").length).toBeGreaterThan(0);
  });

  it("names gods in the id space a requirement and a god pool speak", () => {
    // The same check the forcing keepsakes get, for the same reason: a god that
    // answers no boons is a god this catalog does not have under that name.
    const lookups = createLookups(game);
    for (const god of pooled) expect(lookups.boonsOfGod(god).length).toBeGreaterThan(0);
  });

  it("keeps the bare name and the loot table id disjoint", () => {
    // Nothing enforces this when the data is written, and the failure is
    // silent: a god picker built out of `GodRecord.id` produces a pool matching
    // no requirement and no member list. If the two spaces ever start to
    // overlap, that mistake stops being visible on inspection, and this test is
    // what should say so.
    const keys = new Set(Object.keys(gods));
    const lootIds = new Set(Object.values(gods).map((record) => record.id));
    expect([...keys].filter((key) => lootIds.has(key))).toEqual([]);

    const keepsakes = dataFor(game).keepsakes as Record<string, KeepsakeRecord>;
    const associated = Object.values(keepsakes)
      .map((record) => record.associatedGod)
      .filter((id): id is string => id !== null);
    expect(associated.filter((id) => keys.has(id))).toEqual([]);
  });

  it("hands back the same set every call", () => {
    expect(poolGods(game)).toBe(pooled);
  });
});
