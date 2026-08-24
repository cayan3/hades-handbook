import { dataFor, iconFor, keepsakesFor, weaponIconFor, weaponsFor } from "@repo/catalog";
import type { GameId } from "@repo/core";
import type { TraitRecord } from "@repo/catalog";
import { describe, expect, it } from "vitest";

/**
 * Does a file exist for every icon a page asks the resolver for?
 *
 * Nothing asked before this, and the cost of nobody asking was 245 records —
 * every hammer and every weapon form in both games — resolving to a key with no
 * file behind it. The resolver answers a path either way and the page draws the
 * missing-art placeholder, so a whole surface of grey boxes renders, passes
 * every test there is, and looks like a design decision.
 *
 * Written over what a page actually draws rather than over the whole catalog:
 * roughly a fifth of each game's records are templates and cut content that no
 * surface reaches, and art for those is not missing, it is not wanted.
 */

const GAMES: readonly GameId[] = ["hades1", "hades2"];

/**
 * Every art file that ships, by the path the resolver names it with.
 *
 * `import.meta.glob` rather than a directory read: this half of the workspace
 * compiles with no node types on purpose, so that a component cannot reach a
 * filesystem or a global the import cruiser would not see. The bundler's own
 * glob is typed by `vite/client`, which this project already has, and it reads
 * the same tree the site serves.
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
   * What a page draws, which is narrower than "has a name": the two page
   * populations are a god's records and a weapon's, and between them they miss
   * NPC allies, Chaos, the store and the Bouldy blessings — 70 named records in
   * Hades I whose art was never in scope and still is not.
   *
   * Keepsakes come out for the god page's own reason: they carry a name and a
   * record, they are equipped rather than collected, and their art arrives
   * through the keepsake half of the resolver.
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
