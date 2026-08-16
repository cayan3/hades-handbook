import type { TraitRecord } from "@repo/catalog";
import type { BoonState, Requirement, TraitId } from "@repo/core";
import { describe, expect, it } from "vitest";
import { createNodeSource } from "./node-view.js";
import { bestNextPick } from "./planning.js";
import { held, makeFacts, stubLookups, stubNaming, stubRules } from "./test-support.js";

/**
 * Which boon to take next, over every pin at once.
 *
 * Hand-written records, because what is under test is the preference and not the
 * extraction: three goals sharing a prerequisite states the case in four lines,
 * where six hundred real ones state the catalog's.
 */

function record(id: TraitId, prereq: Requirement | null = null): TraitRecord {
  return {
    id,
    god: "Zeus",
    godKind: null,
    name: id,
    descriptionRef: null,
    icon: null,
    boonCategory: "StandardOlympian",
    slot: null,
    rarity: [],
    duoGods: null,
    exclusiveGroup: null,
    elementAffinity: null,
    prereq,
    prereqSource: null,
    tier: null,
    blockedBy: null,
    activation: null,
    aspectConflicts: null,
    source: `Scripts/Test.lua:${id}`,
  };
}

function world(...records: readonly TraitRecord[]) {
  const byId = Object.fromEntries(records.map((entry) => [entry.id, entry]));
  return {
    ...createNodeSource("hades1", stubRules(), stubLookups(), byId),
    naming: stubNaming,
  };
}

const has = (trait: string): Requirement => ({ kind: "hasTrait", trait: trait as TraitId });
const all = (...of: Requirement[]): Requirement => ({ kind: "all", of });
const any = (...of: Requirement[]): Requirement => ({ kind: "anyOf", min: 1, of });

/** Everything not held is takeable, which is the case this helper is about. */
const takeable = (): ((trait: TraitId) => BoonState) => () => "Available";

describe("the best next pick", () => {
  const source = world(
    record("shared" as TraitId),
    record("only" as TraitId),
    record("goalA" as TraitId, all(has("shared"), has("only"))),
    record("goalB" as TraitId, has("shared")),
    record("goalC" as TraitId, any(has("shared"), has("only"))),
  );

  it("names the boon the most goals want", () => {
    const pick = bestNextPick(
      source,
      ["goalA", "goalB"] as TraitId[],
      makeFacts(),
      takeable(),
    );

    expect(pick?.trait).toBe("shared");
    expect(pick?.goals).toEqual(["goalA", "goalB"]);
  });

  /**
   * One goal's own prerequisite is what that goal's card already says, in more
   * detail. The strip is for the boon two goals share, so with one pin there is
   * nothing here worth a line of its own.
   */
  it("stays silent where nothing serves two goals", () => {
    expect(bestNextPick(source, ["goalA"] as TraitId[], makeFacts(), takeable())).toBeNull();
    expect(bestNextPick(source, [], makeFacts(), takeable())).toBeNull();
  });

  it("never suggests a boon the run already holds", () => {
    const facts = makeFacts({ held: held("shared" as TraitId) });
    expect(bestNextPick(source, ["goalA", "goalB"] as TraitId[], facts, takeable())).toBeNull();
  });

  /**
   * A prerequisite three rungs down is a true answer to "what does this goal
   * need" and a useless answer to "what now". The strip only names what the run
   * could actually take next.
   */
  it("passes over a boon that is not takeable yet", () => {
    const notYet = (trait: TraitId): BoonState => (trait === "shared" ? "Locked" : "Available");
    expect(bestNextPick(source, ["goalA", "goalB"] as TraitId[], makeFacts(), notYet)).toBeNull();
  });

  it("reaches through both composites to find one", () => {
    const pick = bestNextPick(
      source,
      ["goalB", "goalC"] as TraitId[],
      makeFacts(),
      takeable(),
    );
    // `goalB` names it plainly and `goalC` behind an any-of; both count.
    expect(pick?.trait).toBe("shared");
    expect(pick?.goals).toEqual(["goalB", "goalC"]);
  });

  /**
   * Two boons covering the same goals are the same advice, so any rule is
   * arbitrary — but a stable one keeps the strip from swapping between them as
   * anything else on the page re-renders.
   */
  it("breaks a tie the same way every time", () => {
    const tied = world(
      record("beta" as TraitId),
      record("alpha" as TraitId),
      record("goalA" as TraitId, all(has("alpha"), has("beta"))),
      record("goalB" as TraitId, all(has("alpha"), has("beta"))),
    );
    const pins = ["goalA", "goalB"] as TraitId[];

    expect(bestNextPick(tied, pins, makeFacts(), takeable())?.trait).toBe("alpha");
    expect(bestNextPick(tied, [...pins].reverse(), makeFacts(), takeable())?.trait).toBe("alpha");
  });

  it("ignores a gate that names no boon at all", () => {
    const elemental = world(
      record("goalA" as TraitId, { kind: "hasElement", element: "Fire", count: 2 }),
      record("goalB" as TraitId, { kind: "hasBoonFrom", god: "Zeus" }),
    );
    expect(bestNextPick(elemental, ["goalA", "goalB"] as TraitId[], makeFacts(), takeable())).toBeNull();
  });
});
