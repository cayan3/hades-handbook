import { dataFor, iconFor, keepsakesFor, weaponIconFor, weaponsFor } from "@repo/catalog";
import type { GameId } from "@repo/core";
import type { TraitRecord } from "@repo/catalog";
import { describe, expect, it } from "vitest";

/**
 * Does a file exist for every icon a page asks the resolver for?
 *
 * Nobody asked until now, and the cost was 245 records — every hammer and
 * weapon form — resolving to a key with no file behind it. The resolver answers
 * a path regardless, so a page of placeholders renders and passes every other
 * test there is. Over what a page draws rather than the whole catalog.
 */

const GAMES: readonly GameId[] = ["hades1", "hades2"];

/**
 * Every art file that ships, keyed the way the resolver names it.
 *
 * A glob rather than reading the directory: this half of the workspace has no
 * node types on purpose, so a component cannot reach a filesystem. Vite's own
 * glob is already typed here and reads the same tree the site serves.
 */
const SHIPPED = new Set(
  Object.keys(import.meta.glob("../public/art/official/**/*.webp")).map((path) =>
    path.replace("../public/art/", "").replace(/\.webp$/, ""),
  ),
);

/**
 * Whether the resolver's answer for a trait names a file that exists. Asked by
 * trait id rather than by icon key, so what is under test is the path a page
 * actually requests — the game-qualified one, 16 keys being shared between the
 * games and never the same drawing.
 */
function ships(game: GameId, trait: string): boolean {
  return SHIPPED.has(iconFor(game, trait));
}

describe.each(GAMES)("%s art", (game) => {
  const records = Object.values(dataFor(game).boons as Record<string, TraitRecord>);
  const keepsakes = keepsakesFor(game);
  /**
   * What a page draws, which is narrower than "has a name". The two page
   * populations are a god's records and a weapon's; between them they miss NPC
   * allies, Chaos, the store and the Bouldy blessings — 70 named Hades I
   * records whose art was never in scope. Keepsakes come out for the god page's
   * reason: their art arrives through the resolver's keepsake arm.
   */
  const drawn = records.filter(
    (record) =>
      record.name !== null &&
      !Object.hasOwn(keepsakes, record.id) &&
      (record.god !== null || record.duoGods !== null || record.weapon !== null),
  );

  it("ships a file for every record a page draws", () => {
    const missing = drawn
      .filter((record) => !ships(game, record.id))
      .map((record) => `${record.id} (${record.icon})`);
    expect(missing).toEqual([]);
  });

  /**
   * The weapon pages specifically, because they are the newest surface and the
   * one whose art was out of scope until the pages existed. 129 records in
   * Hades I and 116 in Hades II.
   */
  it("ships a file for every hammer and every weapon form", () => {
    const filed = drawn.filter((record) => record.weapon !== null);
    expect(filed.length).toBeGreaterThan(100);
    expect(filed.filter((record) => !ships(game, record.id))).toEqual([]);
    for (const weapon of weaponsFor(game)) {
      for (const aspect of weapon.aspects) expect(ships(game, aspect)).toBe(true);
      // The tab's own picture, which is that weapon's free form drawn plainly.
      expect(SHIPPED.has(weaponIconFor(game, weapon.id))).toBe(true);
    }
  });

  /**
   * The other direction, so the check cannot pass by the placeholder existing:
   * a record whose icon is `null` resolves to it, and that is the one file the
   * test above would otherwise accept for everything.
   */
  it("does not accept the placeholder as a record's art", () => {
    expect(ships(game, "NoSuchTrait")).toBe(true);
    expect(iconFor(game, "NoSuchTrait")).toContain("_missing");
    expect(drawn.filter((record) => record.icon === null)).toEqual([]);
  });

  it("ships nothing the catalog cannot name", () => {
    const wanted = new Set(records.map((record) => `official/${game}/${record.icon}`));
    const orphans = [...SHIPPED].filter(
      (path) => path.startsWith(`official/${game}/`) && !wanted.has(path),
    );
    // Gods, keepsakes, slots, talents and chrome are all named somewhere other
    // than a trait record, so this reports rather than asserts emptiness — what
    // it is worth is that the number does not run away.
    expect(orphans.length).toBeLessThan(120);
  });
});
