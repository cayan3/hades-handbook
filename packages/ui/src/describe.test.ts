import type { Reason, Requirement } from "@repo/core";
import { describe, expect, it } from "vitest";
import {
  POOL_FULL_BODY,
  POOL_FULL_COPY,
  POOL_FULL_LEAD,
  accessibleName,
  activationLines,
  impossibleNotice,
  neededLines,
  reasonSentence,
  stateSentence,
} from "./describe.js";
import { makeFacts, stubNaming } from "./test-support.js";

const NO_KEEPSAKE = () => null;

describe("the full-pool copy", () => {
  it("reads exactly as it is required to read", () => {
    // Pinned character for character. This sentence is the whole mitigation for
    // an engine reporting a soft cap as a hard one, and the words doing the work
    // are "for now" -- a paraphrase dropping them would tell a player their run
    // is over when it isn't, and would pass any test checking only for a mention
    // of keepsakes.
    expect(POOL_FULL_COPY).toBe(
      "Impossible for now. Equip this god's keepsake next region to invite them to your pool.",
    );
    expect(`${POOL_FULL_LEAD} ${POOL_FULL_BODY}`).toBe(POOL_FULL_COPY);
  });

  it("names the keepsake beside the sentence rather than inside it", () => {
    const notice = impossibleNotice(
      { kind: "godPoolFull", god: "Poseidon" },
      stubNaming,
      () => "ForcePoseidonBoonTrait",
    );

    expect(notice.lead).toBe(POOL_FULL_LEAD);
    expect(notice.body).toBe(POOL_FULL_BODY);
    expect(notice.keepsake).toBe("keepsake:ForcePoseidonBoonTrait");
  });

  it("still says the whole sentence when no keepsake can be named", () => {
    // Not a case the shipped data has, and the sentence is what a player needs
    // either way; the keepsake's name is a convenience on top of it.
    const notice = impossibleNotice({ kind: "godPoolFull", god: "Hades" }, stubNaming, NO_KEEPSAKE);
    expect(notice.body).toBe(POOL_FULL_BODY);
    expect(notice.keepsake).toBeNull();
  });
});

describe("reasonSentence", () => {
  const cases: ReadonlyArray<[string, Reason, string]> = [
    ["a ban", { kind: "banned", trait: "A" }, "trait:A is banned this run."],
    [
      "an aspect conflict",
      { kind: "aspectConflict", aspect: "AspectOfBeowulf" },
      "Never offered while aspect:AspectOfBeowulf is equipped.",
    ],
    [
      "an exclusive group",
      { kind: "slotConflict", trait: "A", conflictsWith: "B" },
      "You hold trait:B, and only one of the two can be held.",
    ],
    [
      "a one-directional block",
      { kind: "blockedByTrait", trait: "A", blockedBy: "B" },
      "Taking trait:B put this out of reach for the rest of the run.",
    ],
    [
      "an unselected talent",
      { kind: "talentNotSelected", talent: "AmmoMetaUpgrade" },
      "This run took the other side of the Mirror row that talent:AmmoMetaUpgrade sits on.",
    ],
    ["an excluded god", { kind: "godExcluded", god: "Ares" }, "god:Ares is not part of this run."],
  ];

  it.each(cases)("says why for %s", (_label, reason, expected) => {
    expect(reasonSentence(reason, stubNaming)).toBe(expected);
  });

  it("carries a group's shortfall, which is what makes it more than a shrug", () => {
    // One pick short with alternatives still live is a different situation from
    // one with none, and both arrive as the same kind of reason.
    const short: Reason = {
      kind: "composite",
      needed: 1,
      pendingAlternatives: 2,
      reasons: [{ kind: "banned", trait: "A" }],
    };
    expect(reasonSentence(short, stubNaming)).toBe(
      "Needs 1 more of these, with 2 still open. trait:A is banned this run.",
    );

    const closed: Reason = { ...short, pendingAlternatives: 0 };
    expect(reasonSentence(closed, stubNaming)).toContain("none is still open");
  });

  it("names the children of a group that has no shortfall to report", () => {
    const both: Reason = {
      kind: "composite",
      reasons: [
        { kind: "banned", trait: "A" },
        { kind: "banned", trait: "B" },
      ],
    };
    expect(reasonSentence(both, stubNaming)).toBe(
      "trait:A is banned this run. trait:B is banned this run.",
    );
  });
});

describe("neededLines", () => {
  it("gives one line per thing to go and get", () => {
    const residual: Requirement = {
      kind: "all",
      of: [
        { kind: "hasTrait", trait: "A" },
        { kind: "hasTrait", trait: "B", minLevel: 3 },
        { kind: "hasBoonFrom", god: "Zeus" },
        { kind: "hasElement", element: "Water", count: 2 },
      ],
    };

    expect(neededLines(residual, stubNaming)).toEqual([
      "trait:A",
      "trait:B at level 3",
      "any boon from god:Zeus",
      "2 more Water",
    ]);
  });

  it("reads an element residual as what is left, never as what is held", () => {
    // A residual has already had the met part taken out, so subtracting again
    // counts the same progress twice -- which is how a goal ends up asking for a
    // boon the run already has.
    const residual: Requirement = { kind: "hasElement", element: "Fire", count: 1 };
    expect(neededLines(residual, stubNaming)).toEqual(["1 more Fire"]);
  });

  it("collapses a group to one line rather than listing it as tasks", () => {
    const residual: Requirement = {
      kind: "anyOf",
      min: 1,
      of: [
        { kind: "hasTrait", trait: "A" },
        { kind: "hasKeepsake", keepsake: "K" },
      ],
    };
    expect(neededLines(residual, stubNaming)).toEqual([
      "any 1 of: trait:A, the keepsake:K keepsake",
    ]);
  });

  it("has a phrase for every kind of requirement", () => {
    // The exhaustive switch is the guard; this proves it is exercised. An atom
    // falling through would show as an empty line on a goal card and read as
    // "nothing left to do".
    const every: Requirement = {
      kind: "all",
      of: [
        { kind: "godInPool", god: "Hera" },
        { kind: "hasKeepsake", keepsake: "K" },
        { kind: "hasAspect", aspects: ["One"] },
        { kind: "hasAspect", aspects: ["One", "Two"] },
        { kind: "hasTalent", talent: "T" },
      ],
    };
    expect(neededLines(every, stubNaming)).toEqual([
      "god:Hera in your god pool",
      "the keepsake:K keepsake",
      "aspect:One equipped",
      "one of aspect:One or aspect:Two equipped",
      "the talent:T Mirror talent",
    ]);
  });
});

describe("activationLines", () => {
  it("says the threshold against the run's own count", () => {
    // The one place a residual is the wrong shape: "one more Fire" is true and
    // useless when the question is why a boon you own is doing nothing.
    const activation: Requirement = { kind: "hasElement", element: "Fire", count: 3 };
    const facts = makeFacts({ elements: new Map([["Fire", 2]]) });
    expect(activationLines(activation, facts, stubNaming)).toEqual([
      "needs 3 Fire — you have 2",
    ]);
  });

  it("handles the joined and the branching gates the data actually ships", () => {
    const joined: Requirement = {
      kind: "all",
      of: [
        { kind: "hasElement", element: "Fire", count: 2 },
        { kind: "hasElement", element: "Earth", count: 2 },
      ],
    };
    const facts = makeFacts({ elements: new Map([["Fire", 2]]) });
    expect(activationLines(joined, facts, stubNaming)).toEqual([
      "needs 2 Fire — you have 2",
      "needs 2 Earth — you have 0",
    ]);

    const branching: Requirement = {
      kind: "anyOf",
      min: 1,
      of: [{ kind: "hasElement", element: "Air", count: 8 }],
    };
    expect(activationLines(branching, facts, stubNaming)).toEqual([
      "needs any 1 of these:",
      "needs 8 Air — you have 0",
    ]);
  });
});

describe("the accessible name", () => {
  it("carries the state in words, after the name and before the god", () => {
    expect(accessibleName("Storm Lightning", "Available", "Zeus", 2)).toBe(
      "Storm Lightning — Available — Zeus, tier 2",
    );
  });

  it("drops what the record does not have rather than filling it in", () => {
    // Every Duo answers to two gods and most Infusions to none, so a tier is
    // missing more often than not.
    expect(accessibleName("Island Getaway", "Locked", null, null)).toBe("Island Getaway — Locked");
    expect(accessibleName("Tall Order", "Pending", "Hermes", null)).toBe(
      "Tall Order — Pending — Hermes",
    );
    expect(accessibleName("Nameless", "Obtained", null, 1)).toBe("Nameless — Obtained — tier 1");
  });

  it("gives each of the five states its own sentence", () => {
    const sentences = (["Obtained", "Available", "Pending", "Locked", "Impossible"] as const).map(
      stateSentence,
    );
    expect(new Set(sentences).size).toBe(5);
  });
});
