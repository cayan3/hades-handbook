import { describe, expect, it } from "vitest";
import { type GameKey, dataFor } from "./data.js";
import type { TraitRecord } from "./schema.js";
import { traitsFor } from "./traits.js";
import { isWeapon, weaponFor, weaponsFor } from "./weapons.js";

/**
 * The weapon table is the container a record with no god answers to, so what
 * matters here is that the two halves agree: every weapon's aspect list points
 * at records that exist and are filed back under it, and no weapon name
 * collides with a trait id. The extractor checks the same pairing over its own
 * output; this checks the copy that actually ships.
 */

const GAMES: readonly GameKey[] = ["hades1", "hades2"];

describe.each(GAMES)("the %s weapon table", (game) => {
  const weapons = weaponsFor(game);
  const traits = traitsFor(game);

  it("holds the six weapons the game is played with, each named", () => {
    expect(weapons).toHaveLength(6);
    expect(weapons.filter((w) => w.name === null)).toEqual([]);
  });

  it("offers four forms per weapon, none shared", () => {
    expect(weapons.map((w) => w.aspects.length)).toEqual([4, 4, 4, 4, 4, 4]);
    const all = weapons.flatMap((w) => w.aspects);
    expect(new Set(all).size).toBe(all.length);
  });

  it("lists forms that exist and that name the weapon back", () => {
    for (const weapon of weapons) {
      for (const aspect of weapon.aspects) {
        expect(traits[aspect]).toBeDefined();
        expect(traits[aspect]?.weapon).toBe(weapon.id);
      }
    }
  });

  it("files every weapon-owned record under a weapon that exists", () => {
    const known = new Set(weapons.map((w) => w.id));
    const filed = Object.values(traits).filter((r) => r.weapon !== null);
    expect(filed.length).toBeGreaterThan(0);
    expect(filed.filter((r) => !known.has(r.weapon as string))).toEqual([]);
  });

  /**
   * The mistake `GodRecord.id` invites, one space over: a god is addressed by
   * the bare name that keys its table and not by the loot table id inside the
   * record, and a weapon has the same two-space shape. Measured disjoint so a
   * surface can hold a weapon and a trait in one union without either being
   * able to answer for the other.
   */
  it("keeps weapon names out of the trait id space", () => {
    for (const weapon of weapons) expect(traits[weapon.id]).toBeUndefined();
  });

  it("never gives a record both a god and a weapon", () => {
    const both = Object.values(traits).filter((r) => r.god !== null && r.weapon !== null);
    expect(both).toEqual([]);
  });

  it("hands back the same frozen table every call", () => {
    expect(weaponsFor(game)).toBe(weapons);
    expect(Object.isFrozen(weapons)).toBe(true);
  });

  it("answers a name that is not a weapon rather than throwing", () => {
    expect(weaponFor(game, "NotAWeapon")).toBeUndefined();
    expect(isWeapon(game, "NotAWeapon")).toBe(false);
    expect(isWeapon(game, weapons[0]!.id)).toBe(true);
  });
});

/**
 * The populations this row exists to house, pinned so a re-extraction that
 * loses one is loud. Read off the raw snapshot rather than the merged records,
 * since the overlay says nothing about weapons and a difference here would be
 * it having started to.
 */
describe("the weapon-owned populations", () => {
  const filed = (game: GameKey) =>
    Object.values(dataFor(game).boons as Record<string, TraitRecord>).filter(
      (r) => r.weapon !== null,
    );

  it("files 154 Hades I records and 116 Hades II ones", () => {
    expect(filed("hades1")).toHaveLength(154);
    expect(filed("hades2")).toHaveLength(116);
  });

  /**
   * 105 named hammers over six weapons in Hades I and 92 in Hades II, which is
   * the largest population in either game that reaches no god page. The rest of
   * Hades I's 154 are its 24 forms and three nameless records the weapon table
   * does not list.
   */
  it("names 105 Hades I hammers and 92 Hades II ones", () => {
    const hammers = (game: GameKey) => {
      const aspects = new Set(weaponsFor(game).flatMap((w) => w.aspects));
      return filed(game).filter((r) => r.name !== null && !aspects.has(r.id));
    };
    expect(hammers("hades1")).toHaveLength(105);
    expect(hammers("hades2")).toHaveLength(92);
  });
});
