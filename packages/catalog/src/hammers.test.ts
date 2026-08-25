import { describe, expect, it } from "vitest";
import { textFor } from "./assets.js";
import { type GameKey, dataFor } from "./data.js";
import { cutHammers, hammersFor } from "./hammers.js";
import type { TraitRecord } from "./schema.js";
import { weaponsFor } from "./weapons.js";

/**
 * The hammer table is hand-authored, so nothing about it is recomputed when the
 * games change — which is exactly the failure the overlay's own test exists to
 * catch, one population larger. An entry naming an id a re-extraction dropped
 * would simply stop applying, and a hammer the games *added* would arrive with
 * no category and no prose and look like every other one.
 */

const GAMES: readonly GameKey[] = ["hades1", "hades2"];

function hammersOf(game: GameKey): readonly TraitRecord[] {
  const forms = new Set(weaponsFor(game).flatMap((weapon) => weapon.aspects));
  return Object.values(dataFor(game).boons as Record<string, TraitRecord>).filter(
    (record) => record.weapon !== null && record.name !== null && !forms.has(record.id),
  );
}

describe.each(GAMES)("the %s hammer table", (game) => {
  const table = hammersFor(game);
  const cut = cutHammers(game);

  it("names only records the catalog still has", () => {
    const known = new Set(
      Object.keys(dataFor(game).boons as Record<string, TraitRecord>),
    );
    expect(Object.keys(table).filter((id) => !known.has(id))).toEqual([]);
    expect([...cut].filter((id) => !known.has(id))).toEqual([]);
  });

  it("gives every hammer a category, or says it is cut", () => {
    const missing = hammersOf(game)
      .filter((record) => table[record.id] === undefined && !cut.has(record.id))
      .map((record) => `${record.name} (${record.id})`);
    expect(missing).toEqual([]);
  });

  it("categorises nothing that is not a hammer", () => {
    const hammers = new Set(hammersOf(game).map((record) => record.id));
    expect(Object.keys(table).filter((id) => !hammers.has(id))).toEqual([]);
  });

  /**
   * The whole reason these descriptions exist. The extraction writes `?` where
   * the game resolves a value at runtime; a hammer's values do not vary by
   * rarity, so every one of them can be a number.
   */
  it("leaves no runtime mark in a hammer's prose", () => {
    const marked = Object.entries(table)
      .filter(([, entry]) => entry.description.includes("?"))
      .map(([id]) => id);
    // Two Moonstone Axe entries: the Rank II values are not published.
    expect(marked.length).toBeLessThanOrEqual(2);
  });

  it("is what the text resolver hands back for a hammer", () => {
    const [id, entry] = Object.entries(table)[0]!;
    expect(textFor(game, id)).toBe(entry.description);
  });

  it("leaves every other record's prose to the extraction", () => {
    const boon = Object.values(dataFor(game).boons as Record<string, TraitRecord>).find(
      (record) => record.god !== null && record.descriptionRef !== null,
    );
    const bundle = dataFor(game).descriptions as Record<string, string>;
    expect(textFor(game, boon!.descriptionRef!)).toBe(bundle[boon!.descriptionRef!]);
  });
});

/**
 * The populations, pinned. These are hand-counted facts about a hand-authored
 * file, so a change in either is a change somebody made rather than one the
 * games made.
 */
describe("the hammer populations", () => {
  it("categorises 174 hammers and names 24 the games no longer offer", () => {
    const categorised = GAMES.reduce((n, game) => n + Object.keys(hammersFor(game)).length, 0);
    const cut = GAMES.reduce((n, game) => n + cutHammers(game).size, 0);
    expect(categorised).toBe(174);
    expect(cut).toBe(24);
  });

  it("uses the Omega symbol the game draws, not a word for it", () => {
    const prose = Object.values(hammersFor("hades2")).map((entry) => entry.description);
    expect(prose.filter((text) => text.includes("Ω")).length).toBeGreaterThan(20);
    expect(prose.filter((text) => text.includes("OMEGA"))).toEqual([]);
  });
});
