import { describe, expect, it } from "vitest";
import { textFor } from "./assets.js";
import { type GameKey, dataFor } from "./data.js";
import { cutHammers, hammersFor } from "./hammers.js";
import type { TraitRecord } from "./schema.js";
import { weaponsFor } from "./weapons.js";
import h1Validation from "../data/hades1/validation.json" with { type: "json" };

/**
 * Cut hammers the games still name somewhere outside the trait definitions.
 * Each is read by a condition — a room rule asking what you are carrying, or
 * `HeroHasTrait` in a power — rather than handed out by anything, so the
 * extractor sees a reference and a player never sees the hammer. One nameless
 * record is left out of the extractor's list for having no name at all.
 */
const STILL_NAMED = new Set([
  "BowRandomExplosionTrait",
  "GunDashAmmoTrait",
  "GunSniperTrait",
  "ShieldThrowSingleTargetTrait",
  "SwordRandomExplosionTrait",
]);

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
    // An entry is a bare sentence only where nothing was recovered; one that
    // gained a number or a stat line is an object carrying the sentence.
    const bundle = dataFor(game).descriptions as Record<string, string | { text: string }>;
    const entry = bundle[boon!.descriptionRef!]!;
    expect(textFor(game, boon!.descriptionRef!)).toBe(
      typeof entry === "string" ? entry : entry.text,
    );
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

  /**
   * The cut list is hand-authored and the extractor answers the same question
   * from the games' own files: a hammer nothing outside the trait definitions
   * mentions is one nothing hands out. It separates them cleanly — all 82
   * hammers with a category are referenced and 19 of the 24 cut ones are not —
   * so this holds one against the other rather than trusting the list.
   */
  it("cuts only hammers the games stopped handing out", () => {
    const named = new Set(h1Validation.hammersNotReferencedOutsideTraitData);
    const unaccounted = [...cutHammers("hades1")].filter(
      (id) => !named.has(id) && !STILL_NAMED.has(id),
    );
    expect(unaccounted).toEqual([]);
    // And the other way: nothing the extractor calls unreachable is missing.
    expect([...named].filter((id) => !cutHammers("hades1").has(id))).toEqual([]);
  });

  it("uses the Omega symbol the game draws, not a word for it", () => {
    const prose = Object.values(hammersFor("hades2")).map((entry) => entry.description);
    expect(prose.filter((text) => text.includes("Ω")).length).toBeGreaterThan(20);
    expect(prose.filter((text) => text.includes("OMEGA"))).toEqual([]);
  });
});
