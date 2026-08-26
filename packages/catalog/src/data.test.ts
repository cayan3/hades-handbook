import { describe, expect, it, vi } from "vitest";
import { dataFor } from "./data.js";

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

  it.each(GAMES)("%s carries gods, keepsakes and a version stamp", (game) => {
    const data = dataFor(game);
    expect(Object.keys(records(data.gods)).length).toBeGreaterThan(0);
    expect(Object.keys(records(data.keepsakes)).length).toBeGreaterThan(0);
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
    const one = Object.keys(records(dataFor("hades1").boons));
    const two = Object.keys(records(dataFor("hades2").boons));
    const shared = one.filter((id) => two.includes(id));
    expect(shared.length).toBeLessThan(Math.min(one.length, two.length) / 10);

    // The "decisive" signal here is about the element affinity mechanic that's
    // only in Hades II (Hades I yk has no elemental system :salute: :salute:).
    const affinities = (boons: unknown) =>
      Object.values(records(boons)).filter((r) => records(r)["elementAffinity"] !== null).length;
    expect(affinities(dataFor("hades1").boons)).toBe(0);
    expect(affinities(dataFor("hades2").boons)).toBeGreaterThan(0);
  });
});

/**
 * The split's one failure that still looks like it works: hand back an empty
 * table for a game nobody fetched and every page renders, drawing nothing.
 *
 * Asked against a fresh copy of the module because the runner's setup file
 * loads both games before any test file, which is the state every other
 * assertion here wants.
 */
describe("a game nobody has loaded", () => {
  it("throws rather than answering empty", async () => {
    vi.resetModules();
    const fresh = await import("./data.js");

    expect(fresh.isLoaded("hades2")).toBe(false);
    expect(() => fresh.dataFor("hades2")).toThrow(/has not been loaded/);

    await fresh.loadGame("hades2");
    expect(fresh.isLoaded("hades2")).toBe(true);
    expect(Object.keys(records(fresh.dataFor("hades2").boons)).length).toBeGreaterThan(200);
  });

  /**
   * The split's other way of failing, and the one that found itself: four
   * modules here built their per-game tables as they loaded, so importing the
   * package at all reached a snapshot nobody had fetched. Importing the index
   * is what asks the question, since that is what pulls every module in.
   */
  it("is not read by the package merely being imported", async () => {
    vi.resetModules();
    const fresh = await import("./index.js");

    expect(fresh.isLoaded("hades1")).toBe(false);
    expect(fresh.isLoaded("hades2")).toBe(false);
  });

  it("shares one fetch between callers who ask at once", async () => {
    vi.resetModules();
    const fresh = await import("./data.js");

    await Promise.all([fresh.loadGame("hades1"), fresh.loadGame("hades1")]);
    expect(fresh.isLoaded("hades1")).toBe(true);
  });
});
