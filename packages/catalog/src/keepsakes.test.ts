import { describe, expect, it } from "vitest";
import { type GameKey, dataFor } from "./data.js";
import { forcingKeepsakes, keepsakesFor } from "./keepsakes.js";
import { createLookups } from "./lookups.js";
import type { GodRecord, KeepsakeRecord } from "./schema.js";

/**
 * The population is the assertion here, because the risk is in the derivation
 * rather than in the lookup.
 *
 * Counting the forcing keepsakes is where the soft cap was argued from in the
 * first place: eight of them against four regions in Hades I, nine in Hades II,
 * so at most four can ever be spent and the supply cannot run out. That
 * argument is why a spent keepsake is not modelled at all. If the derivation
 * ever stops finding those two numbers, the reasoning behind an unmodelled case
 * has shifted, and somebody should be told rather than left to notice.
 */

const GAMES: readonly GameKey[] = ["hades1", "hades2"];
const EXPECTED: Record<GameKey, number> = { hades1: 8, hades2: 9 };

describe.each(GAMES)("%s forcing keepsakes", (game) => {
  const forcing = forcingKeepsakes(game);

  it("finds one keepsake per god, for gods that hold a pool slot", () => {
    expect(forcing.size).toBe(EXPECTED[game]);
    expect(new Set(forcing.values()).size).toBe(forcing.size);
    const gods = dataFor(game).gods as Record<string, GodRecord>;
    const pooled = new Set(
      Object.entries(gods)
        .filter(([, record]) => record.kind === "PoolSlot")
        .map(([god]) => god),
    );
    for (const god of forcing.values()) expect(pooled.has(god)).toBe(true);
  });

  it("covers every pool god, with none left over", () => {
    const gods = dataFor(game).gods as Record<string, GodRecord>;
    const uncovered = Object.entries(gods)
      .filter(([, record]) => record.kind === "PoolSlot")
      .map(([god]) => god)
      .filter((god) => ![...forcing.values()].includes(god));
    // This found the finding it now pins the fix for. Hades I's Hades used to
    // sit here, a pool god with nothing to force him into a pool because the
    // game never offers him; the extractor reads the flag that says so, so
    // every pool god in both games has a forcing keepsake and the count is
    // one per god.
    expect(uncovered).toEqual([]);
  });

  it("names gods in the id space a requirement and a god pool speak", () => {
    // These values come from the god table's keys, while the keepsake field
    // they were read from holds loot table ids. Get the two mixed up and the
    // pool rule ends up comparing against a god nothing else can name. Checking
    // the member lists is the cheapest independent way to confirm the bare form
    // is the right one: a god that answers no boons is a god this catalog does
    // not have under that name.
    const lookups = createLookups(game);
    for (const god of forcing.values()) {
      expect(lookups.boonsOfGod(god).length).toBeGreaterThan(0);
    }
  });

  it("leaves out the keepsakes tied to an NPC or to a god with no pool slot", () => {
    const keepsakes = dataFor(game).keepsakes as Record<string, KeepsakeRecord>;
    for (const [id, record] of Object.entries(keepsakes)) {
      if (forcing.has(id)) continue;
      const associated = record.associatedGod;
      if (associated === null) continue;
      const gods = dataFor(game).gods as Record<string, GodRecord>;
      const named = Object.values(gods).find((god) => god.id === associated);
      expect(named?.kind ?? "NonPoolSlot").toBe("NonPoolSlot");
    }
  });

  it("hands back the same map every call", () => {
    expect(forcingKeepsakes(game)).toBe(forcing);
  });

  it("gives every forcing keepsake a display name to put in the copy", () => {
    // The full-pool verdict names the keepsake to equip, so a record without a
    // name would leave that sentence pointing at nothing. Asserted over the
    // shipped data rather than assumed: the text bundle is missing for plenty
    // of records in both games, and these are the eight and nine it cannot be
    // missing for.
    const records = keepsakesFor(game);
    for (const keepsake of forcing.keys()) {
      expect(records[keepsake]?.name).toEqual(expect.any(String));
    }
  });
});
