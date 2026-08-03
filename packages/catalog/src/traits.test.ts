import { describe, expect, it } from "vitest";
import { type GameKey, dataFor } from "./data.js";
import { createLookups } from "./lookups.js";
import { overlayFor } from "./overlay.js";
import type { TraitRecord } from "./schema.js";
import { traitsFor } from "./traits.js";

/**
 * The overlay only means anything if somebody applies it.
 *
 * It has been checked for consistency ever since it was written: no entry names
 * a missing trait, no entry restates what the extraction already says. And that
 * whole time, nothing merged it into the records anyone actually reads. Both
 * god corrections were exported, tested and inert — the two Demeter boons the
 * game itself files under Zeus stayed Zeus everywhere in the app, and Demeter
 * came up two boons short in every view that asks a god for its own.
 */

const GAMES: readonly GameKey[] = ["hades1", "hades2"];

describe.each(GAMES)("traits for %s", (game) => {
  const raw = dataFor(game).boons as Record<string, TraitRecord>;
  const overlay = overlayFor(game);
  const traits = traitsFor(game);

  it("keeps every record the extraction produced", () => {
    expect(Object.keys(traits).sort()).toEqual(Object.keys(raw).sort());
  });

  it("applies every god the overlay corrects", () => {
    for (const [id, entry] of Object.entries(overlay)) {
      if (entry.god === undefined) continue;
      expect(traits[id]?.god).toBe(entry.god);
    }
  });

  it("leaves a record the overlay says nothing about alone", () => {
    for (const [id, record] of Object.entries(traits)) {
      if (id in overlay) continue;
      expect(record).toEqual(raw[id]);
    }
  });

  it("does not mutate what the extraction loaded", () => {
    for (const [id, entry] of Object.entries(overlay)) {
      if (entry.god === undefined) continue;
      expect(raw[id]?.god).not.toBe(entry.god);
    }
  });
});

describe("the corrections the overlay exists for", () => {
  it("files the two boons the game mislabels under the god who grants them", () => {
    /**
     * Crystal Beam and Icy Flare both declare `God = "Zeus"` in the game's own
     * files while sitting in Demeter's loot table. The extraction reports what
     * the game says, deliberately, so this is the only place the disagreement
     * gets resolved. Until the merge was applied, resolving it here did nothing
     * at all.
     */
    const traits = traitsFor("hades1");
    expect(traits.DemeterRangedTrait?.god).toBe("Demeter");
    expect(traits.ShieldLoadAmmo_DemeterRangedTrait?.god).toBe("Demeter");
  });

  it("counts a corrected boon among its god's own", () => {
    const demeter = createLookups("hades1").boonsOfGod("Demeter");
    expect(demeter).toContain("DemeterRangedTrait");
    expect(demeter).toContain("ShieldLoadAmmo_DemeterRangedTrait");
  });

  it("stops counting it under the god the game named by mistake", () => {
    const zeus = createLookups("hades1").boonsOfGod("Zeus");
    expect(zeus).not.toContain("DemeterRangedTrait");
    expect(zeus).not.toContain("ShieldLoadAmmo_DemeterRangedTrait");
  });
});
