import { describe, expect, it } from "vitest";
import { type GameKey, dataFor } from "./data.js";
import { overlayFor } from "./overlay.js";
import type { GodRecord, TraitRecord } from "./schema.js";

/**
 * The overlay is checked against the extraction here (and *only* here :salute :salute:).
 *
 * Every other validation needed by this catalog is run in the extractor lol
 * (see index.ts for more detailed explanation on why this one check can't be).
 *
 * This catches if a renamed or removed trait leaves an overlay entry pointing
 * at ermm nothing o_0, in which case the entry would then silently stop applying
 * (e.g. a weapon aspect conflict that doesn't actually restrict anything
 * anymore, a god correction that reverts to the value it should be overriding).
 * That silent fail-open behavior is also why this lil guy has to fail loudly.
 */

const GAMES: readonly GameKey[] = ["hades1", "hades2"];

describe.each(GAMES)("overlay for %s", (game) => {
  const traits = dataFor(game).boons as Record<string, TraitRecord>;
  const gods = dataFor(game).gods as Record<string, GodRecord>;
  const overlay = overlayFor(game);

  it("names only traits the extraction still has", () => {
    const dangling = Object.keys(overlay).filter((id) => !(id in traits));
    expect(dangling).toEqual([]);
  });

  it("names only gods the extraction still has", () => {
    const dangling = Object.entries(overlay)
      .filter(([, entry]) => entry.god !== undefined && !(entry.god in gods))
      .map(([id, entry]) => `${id} -> ${entry.god}`);
    expect(dangling).toEqual([]);
  });

  it("does not correct a god to the value already extracted", () => {
    /**
     * A correction that agrees with the data isn't "harmless" bc it means
     * either the game was fixed upstream, or the entry was initially wrong.
     * Either way, it should be deleted; this is here bc a silent no-op wouldn't
     * like actually prompt anyone to o_0.
     */
    const redundant = Object.entries(overlay)
      .filter(([id, entry]) => entry.god !== undefined && traits[id]?.god === entry.god)
      .map(([id]) => id);
    expect(redundant).toEqual([]);
  });
});
