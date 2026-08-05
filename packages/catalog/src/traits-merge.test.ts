import { describe, expect, it, vi } from "vitest";
import { dataFor } from "./data.js";
import type { TraitRecord } from "./schema.js";
import { traitsFor } from "./traits.js";

/**
 * The overlay's aspect conflicts ADD to the extraction's rather than replacing
 * them, and nothing that ships exercises that.
 *
 * The real overlay carries two god corrections and no aspect conflicts at all.
 * So a merge that overwrote the extracted list would pass every other test in
 * this package, then quietly delete real feasibility edges the moment somebody
 * wrote the first overlay entry. Rather than wait for that entry to appear,
 * this file supplies an overlay of its own.
 *
 * The trait ids are real and so are the conflicts already on them, because the
 * whole question is what happens where the two sources meet — which a made-up
 * record could not show.
 */
vi.mock("./overlay.js", () => ({
  overlayFor: (game: string) =>
    game === "hades1"
      ? {
          // Extraction says Beowulf; the overlay names a different form.
          AmmoReclaimTrait: { aspectConflicts: ["BowLoadAmmoTrait"] },
          // The overlay repeats what the extraction already found.
          AphroditeRangedTrait: { aspectConflicts: ["ShieldLoadAmmoTrait"] },
          // Extraction found none for this one.
          AmmoBoltTrait: { aspectConflicts: ["GunLoadedGrenadeTrait"] },
          // Both kinds of entry on one record.
          DemeterRangedTrait: { god: "Demeter", aspectConflicts: ["BowLoadAmmoTrait"] },
        }
      : {},
}));

describe("merging the overlay's aspect conflicts", () => {
  const raw = dataFor("hades1").boons as Record<string, TraitRecord>;
  const traits = traitsFor("hades1");

  it("keeps what the extraction found and adds what the overlay names", () => {
    expect(raw.AmmoReclaimTrait?.aspectConflicts).toEqual(["ShieldLoadAmmoTrait"]);
    expect(traits.AmmoReclaimTrait?.aspectConflicts).toEqual([
      "BowLoadAmmoTrait",
      "ShieldLoadAmmoTrait",
    ]);
  });

  it("does not list a form twice when both sources name it", () => {
    expect(traits.AphroditeRangedTrait?.aspectConflicts).toEqual(["ShieldLoadAmmoTrait"]);
  });

  it("uses the overlay's alone where the extraction found none", () => {
    expect(raw.AmmoBoltTrait?.aspectConflicts).toBeNull();
    expect(traits.AmmoBoltTrait?.aspectConflicts).toEqual(["GunLoadedGrenadeTrait"]);
  });

  it("applies a god correction and a conflict addition to the same record", () => {
    expect(traits.DemeterRangedTrait?.god).toBe("Demeter");
    expect(traits.DemeterRangedTrait?.aspectConflicts).toEqual([
      "BowLoadAmmoTrait",
      "ShieldLoadAmmoTrait",
    ]);
  });

  it("leaves the extraction unmutated", () => {
    expect(raw.AmmoBoltTrait?.aspectConflicts).toBeNull();
    expect(raw.AmmoReclaimTrait?.aspectConflicts).toEqual(["ShieldLoadAmmoTrait"]);
    expect(raw.DemeterRangedTrait?.god).not.toBe("Demeter");
  });

  it("hands back the same record object where the overlay says nothing", () => {
    // Identity rather than equality: a merge that rebuilt every record would
    // copy the whole catalog per game for the sake of four entries.
    expect(traits.AmmoFieldTrait).toBe(raw.AmmoFieldTrait);
  });

  it("freezes what it did rebuild", () => {
    expect(Object.isFrozen(traits.AmmoReclaimTrait)).toBe(true);
    expect(Object.isFrozen(traits.AmmoReclaimTrait?.aspectConflicts)).toBe(true);
  });
});
