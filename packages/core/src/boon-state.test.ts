import { describe, expect, it } from "vitest";
import { anyLeafStarted, boonState } from "./boon-state.js";
import type { Reason, Requirement } from "./index.js";
import { held, makeFacts, stubLookups, stubRules } from "./test-support.js";

/**
 * The five states a boon renders as, each derived from one of the engine's
 * three Status branches/answers.
 *
 * This is basically abt the Pending/Locked split (since `unsatisfiable` &
 * `satisfied` map cleanly to Impossible & Available respectively), which asks
 * one additional question abt any unmet prerequisite: has the player at least
 * made a start on any leaves of the boon prerequisite?
 */

const TARGET = "target";
/** Using two prerequisites here so "some requirements met" is actually representable. */
const prereq: Requirement = {
  kind: "all",
  of: [
    { kind: "hasTrait", trait: "p1" },
    { kind: "hasTrait", trait: "p2" },
  ],
};
/**
 *  stubLookups() w/ no arguments returns boonsOfGod: () => [] (i.e. every god
 *  is boonless (lol)).
 *  Purpose of this is bc evaluate always takes four parameters, but only
 *  hasBoonFrom ever calls lookups (every other atom just yk ignores it).
 *  So this lil constant guy has two big-boy jobs: it's the default for the
 *  residualOf/reasonOf helpers, and the name itself documents the call site
 *  (i.e. "NO_LOOKUPS" means the assertion doesn't depend on catalog member lists).
 */
const NO_LOOKUPS = stubLookups();

function stateOf(facts: Parameters<typeof boonState>[2], rules = stubRules()) {
  return boonState(TARGET, prereq, facts, rules, NO_LOOKUPS);
}

describe("boonState", () => {
  it("is Obtained when the boon is held", () => {
    expect(stateOf(makeFacts({ held: held(TARGET) }))).toBe("Obtained");
  });

  it("is Available when every prerequisite is met", () => {
    expect(stateOf(makeFacts({ held: held("p1", "p2") }))).toBe("Available");
  });

  it("is Pending when some of the prerequisite is met", () => {
    expect(stateOf(makeFacts({ held: held("p1") }))).toBe("Pending");
  });

  it("is Locked when none of it is", () => {
    expect(stateOf(makeFacts())).toBe("Locked");
  });

  it("is Impossible when the prerequisite cannot be met this run", () => {
    const banned: Reason = { kind: "banned", trait: "p2" };
    const rules = stubRules({ blocked: new Map([["p2", banned]]) });
    expect(stateOf(makeFacts({ held: held("p1") }), rules)).toBe("Impossible");
  });

  it("stays Obtained even once the boon could no longer be taken", () => {
    // A boon obtained before the blocker appeared is still yk obtained (a boon
    // being held takes priority over every other answer).
    const rules = stubRules({ blocked: new Map([["p2", { kind: "banned", trait: "p2" }]]) });
    expect(stateOf(makeFacts({ held: held(TARGET, "p1") }), rules)).toBe("Obtained");
  });

  it("is Impossible when the boon itself is blocked, with every prerequisite met", () => {
    // The block is abt the target rather than abt anything in its prerequisite
    // tree, so nothing `evaluate` walks can see it. This is the Hades II Cast
    // group: holding one of the five costs the other four, and their own
    // prerequisites go on being perfectly satisfiable.
    const rules = stubRules({
      blocked: new Map([[TARGET, { kind: "slotConflict", trait: TARGET, conflictsWith: "other" }]]),
    });
    expect(stateOf(makeFacts({ held: held("p1", "p2") }), rules)).toBe("Impossible");
  });

  it("stays Obtained when the boon is both held and blocked", () => {
    // Satisfaction before feasibility, for the target itself as well as for its
    // prerequisites: a run holding a member of an exclusive group is told it
    // holds it, not that it can never have it.
    const rules = stubRules({
      blocked: new Map([[TARGET, { kind: "slotConflict", trait: TARGET, conflictsWith: "other" }]]),
    });
    expect(stateOf(makeFacts({ held: held(TARGET) }), rules)).toBe("Obtained");
  });

  it("is Available when the boon has no prerequisite at all", () => {
    const state = boonState(TARGET, { kind: "all", of: [] }, makeFacts(), stubRules(), NO_LOOKUPS);
    expect(state).toBe("Available");
  });

  it("goes Locked straight to Available for a god-shaped prerequisite", () => {
    // hasBoonFrom lost its count, so it can't be part-met: holding any of the
    // god's boons is exactly what satisfies it. There is no Pending in between,
    // which is what "all-or-nothing leaf" means in display terms.
    const lookups = stubLookups({ Hera: ["m1", "m2"] });
    const godPrereq: Requirement = { kind: "hasBoonFrom", god: "Hera" };
    expect(boonState(TARGET, godPrereq, makeFacts(), stubRules(), lookups)).toBe("Locked");
    const started = makeFacts({ held: held("m1") });
    expect(boonState(TARGET, godPrereq, started, stubRules(), lookups)).toBe("Available");
  });

  it("is Impossible when an unselected talent gates the boon", () => {
    // Mirror selection is fixed before the run, so this is the display face of
    // the one atom whose unmet state is never merely "not yet".
    const talentPrereq: Requirement = { kind: "hasTalent", talent: "AmmoMetaUpgrade" };
    const facts = makeFacts({
      equipped: { talents: new Map([["AmmoMetaUpgrade", "notSelected"] as const]) },
    });
    expect(boonState(TARGET, talentPrereq, facts, stubRules(), NO_LOOKUPS)).toBe("Impossible");
  });

  it("is Pending when an element threshold is part-met", () => {
    const elementPrereq: Requirement = { kind: "hasElement", element: "Water", count: 3 };
    const facts = makeFacts({ elements: new Map([["Water", 1] as const]) });
    expect(boonState(TARGET, elementPrereq, facts, stubRules(), NO_LOOKUPS)).toBe("Pending");
  });

  it("is Pending when the prerequisite trait is held below the level asked for", () => {
    const levelled: Requirement = { kind: "hasTrait", trait: "p1", minLevel: 3 };
    const facts = makeFacts({ held: held(["p1", 1]) });
    expect(boonState(TARGET, levelled, facts, stubRules(), NO_LOOKUPS)).toBe("Pending");
  });
});

describe("anyLeafStarted", () => {
  it("looks through both combinators", () => {
    const nested: Requirement = {
      kind: "all",
      of: [{ kind: "anyOf", min: 2, of: [{ kind: "hasTrait", trait: "p1" }] }],
    };
    expect(anyLeafStarted(nested, makeFacts({ held: held("p1") }), stubRules(), NO_LOOKUPS)).toBe(
      true,
    );
    expect(anyLeafStarted(nested, makeFacts(), stubRules(), NO_LOOKUPS)).toBe(false);
  });

  it("treats the all-or-nothing leaves as started only when satisfied", () => {
    const equipped: Requirement = { kind: "hasKeepsake", keepsake: "Skull" };
    const facts = makeFacts({ equipped: { keepsake: "Skull" } });
    expect(anyLeafStarted(equipped, facts, stubRules(), NO_LOOKUPS)).toBe(true);
    expect(anyLeafStarted(equipped, makeFacts(), stubRules(), NO_LOOKUPS)).toBe(false);
  });

  it("is false for a requirement that asks for nothing", () => {
    // No leaves means nothing has been started (lol).
    expect(anyLeafStarted({ kind: "all", of: [] }, makeFacts(), stubRules(), NO_LOOKUPS)).toBe(
      false,
    );
  });
});
