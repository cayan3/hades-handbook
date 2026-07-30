import { describe, expect, it } from "vitest";
import { dataFor, gameData } from "./data.js";

/**
 * The loader has no logic to actually test, which is yk the literal point lol.
 * What *can* break is the wiring (rip), which would also erm do so silently.
 * So stuff like a JSON import that resolved to `{}`, a file copied into
 * the wrong game's directory, a snapshot replaced by a truncated one, etc would
 * all typecheck and leave every consumer just uh reading an empty catalog lol.
 * These tests assert the data is actually there and is the actual data claimed.
 */

const GAMES = ["hades1", "hades2"] as const;

function records(value: unknown): Record<string, unknown> {
  expect(typeof value).toBe("object");
  expect(value).not.toBeNull();
  return value as Record<string, unknown>;
}

describe("the extracted snapshot loads", () => {
  it.each(GAMES)("%s carries a non-empty boon table", (game) => {
    const boons = records(dataFor(game).boons);
    // Both games are in the hundreds o_0, but thankfully a much lower floor
    // still catches empty or truncated imports lol.
    expect(Object.keys(boons).length).toBeGreaterThan(200);
  });

  it.each(GAMES)("%s boon records carry the fields the catalog reads", (game) => {
    const boons = records(dataFor(game).boons);
    for (const [id, record] of Object.entries(boons)) {
      const fields = records(record);
      expect(fields["id"], `${game}/${id} disagrees with its own key`).toBe(id);
      for (const field of ["god", "name", "icon", "rarity", "prereq", "source"]) {
        expect(fields, `${game}/${id} is missing ${field}`).toHaveProperty(field);
      }
    }
  });

  it.each(GAMES)("%s carries gods, keepsakes, named sets and a version stamp", (game) => {
    const data = dataFor(game);
    expect(Object.keys(records(data.gods)).length).toBeGreaterThan(0);
    expect(Object.keys(records(data.keepsakes)).length).toBeGreaterThan(0);
    expect(Object.keys(records(data.namedSets)).length).toBeGreaterThan(0);
    expect(Object.keys(records(data.version)).length).toBeGreaterThan(0);
  });

  it("keeps the two games' snapshots distinct", () => {
    // If one directory is literally uh copied over the other, a per-game shape
    // check can't actually tell bc both copies would still be well-formed.
    // Since the two games are *mostly* (but not entirely) disjoint (e.g. some
    // consumables like Chimaera Jerky or Yarn of Ariadne have the same internal
    // id in both games), a trait id is both unique within a game and also
    // non-unique across the pair itself. We can't just assert for like total
    // disjointness bc that'd be ermmm well asserting something false lol.
    const one = Object.keys(records(gameData.hades1.boons));
    const two = Object.keys(records(gameData.hades2.boons));
    const shared = one.filter((id) => two.includes(id));
    expect(shared.length).toBeLessThan(Math.min(one.length, two.length) / 10);

    // The "decisive" signal here is about the element affinity mechanic that's
    // only in Hades II (Hades I yk has no elemental system :salute: :salute:).
    const affinities = (boons: unknown) =>
      Object.values(records(boons)).filter((r) => records(r)["elementAffinity"] !== null).length;
    expect(affinities(gameData.hades1.boons)).toBe(0);
    expect(affinities(gameData.hades2.boons)).toBeGreaterThan(0);
  });
});
