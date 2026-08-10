import { describe, expect, it } from "vitest";
import { type GameKey, dataFor } from "./data.js";
import { createLookups } from "./lookups.js";
import { overlayFor } from "./overlay.js";
import { type TraitRecord, isRequirementNode } from "./schema.js";
import { refusedTraits, traitsFor } from "./traits.js";

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

  it("keeps every record the extraction produced except the ones it refuses", () => {
    // This used to assert the two sets were equal outright, and the refusal is
    // what made that false. Stated as "everything minus the refusals" rather
    // than relaxed to a count: a record going missing for any *other* reason is
    // still a failure, which is the half of the original assertion worth
    // keeping.
    const refused = new Set(refusedTraits(game));
    const expected = Object.keys(raw).filter((id) => !refused.has(id));
    expect(Object.keys(traits).sort()).toEqual(expected.sort());
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

describe("records this catalog will not hand over", () => {
  /**
   * The extractor ships a record rather than dropping it when it cannot build
   * the record's gate, and says why on the record. That is right — the name,
   * the icon and the reason are all still worth having — and it means the field
   * typed as the engine's nine-armed union sometimes holds something that is not
   * one of the nine. Past this package every consumer is entitled to believe the
   * type, and the evaluator's switch is exhaustive with no default case, so an
   * unrecognised node matches no arm and falls off the end.
   */
  it("refuses exactly the two whose prerequisite is not a requirement", () => {
    expect(refusedTraits("hades2")).toEqual([
      "ChaosLastStandBlessing",
      "ChaosMetaUpgradeCurse",
    ]);
    expect(refusedTraits("hades1")).toEqual([]);
  });

  it("refuses only records that say for themselves why they could not be built", () => {
    // The refusal is not this package's judgement about a record it dislikes.
    // Every id it withholds carries the extractor's own account of the clause
    // that did not resolve, which is what makes the loss recoverable.
    const raw = dataFor("hades2").boons as Record<string, TraitRecord>;
    for (const id of refusedTraits("hades2")) {
      expect(raw[id]?.buildFailure?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("keeps them out of what anything downstream can look up", () => {
    for (const id of refusedTraits("hades2")) {
      expect(traitsFor("hades2")[id]).toBeUndefined();
    }
  });

  it("hands over a prerequisite the evaluator can always walk", () => {
    // The property the refusal exists for, asserted over both shipped games
    // rather than over the two ids that motivated it -- a patch adding a third
    // should show up here as a changed count, not as a crash in a view.
    for (const game of ["hades1", "hades2"] as const) {
      for (const record of Object.values(traitsFor(game))) {
        if (record.prereq != null) expect(isRequirementNode(record.prereq)).toBe(true);
        if (record.activation != null) expect(isRequirementNode(record.activation)).toBe(true);
      }
    }
  });
});
