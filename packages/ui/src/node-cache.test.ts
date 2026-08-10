import { traitsFor } from "@repo/catalog";
import type { RunFacts, TraitId } from "@repo/core";
import { describe, expect, it } from "vitest";
import { createNodeCache } from "./node-cache.js";
import { createNodeSource } from "./node-view.js";
import { held, makeFacts, stubLookups, stubRules } from "./test-support.js";

/**
 * The cache, watched missing. A memo nobody has seen miss is a memo nobody knows
 * is a memo — and the failure that matters is not a slow render but a stale one,
 * where the run has moved on and the screen has not. So the counter is part of
 * the interface and these assert on it rather than on how long anything took.
 */

const RECORDS = traitsFor("hades1");
const SUBJECT = "AmmoBoltTrait" as TraitId;
const OTHER = "AphroditeWeakenTrait" as TraitId;

function cache() {
  return createNodeCache(createNodeSource("hades1", stubRules(), stubLookups(), RECORDS));
}

describe("createNodeCache", () => {
  it("derives once per boon per run", () => {
    const memo = cache();
    const facts = makeFacts();

    memo.viewOf(SUBJECT, facts);
    memo.viewOf(SUBJECT, facts);
    memo.viewOf(OTHER, facts);

    expect(memo.derivations).toBe(2);
  });

  it("hands back the identical view, so a render can skip on identity", () => {
    const memo = cache();
    const facts = makeFacts();
    expect(memo.viewOf(SUBJECT, facts)).toBe(memo.viewOf(SUBJECT, facts));
  });

  it("re-derives when the facts object is replaced", () => {
    // The whole invalidation signal: the layer below replaces the facts object
    // on every change and shares the collections nothing touched.
    const memo = cache();
    memo.viewOf(SUBJECT, makeFacts());
    memo.viewOf(SUBJECT, makeFacts({ held: held("ArtemisWeaponTrait") }));
    expect(memo.derivations).toBe(2);
  });

  it("answers with the new run rather than the cached one", () => {
    const memo = cache();
    const before = memo.viewOf(SUBJECT, makeFacts());
    const after = memo.viewOf(SUBJECT, makeFacts({ held: held(SUBJECT) }));

    expect(before.state).toBe("Locked");
    expect(after.state).toBe("Obtained");
  });

  it("re-derives when the data snapshot changes under the same run", () => {
    // The one case identity cannot catch: same object, different catalog.
    const memo = cache();
    const facts: RunFacts = makeFacts({ dataVersion: "one" });
    memo.viewOf(SUBJECT, facts);

    const moved = { ...facts, dataVersion: "two" };
    memo.viewOf(SUBJECT, moved);
    memo.viewOf(SUBJECT, moved);

    expect(memo.derivations).toBe(2);
  });

  it("does not confuse two runs held at once", () => {
    // A hypothetical laid beside the live run is the ordinary case here, so two
    // facts objects alive together is something the cache handles, not survives.
    const memo = cache();
    const live = makeFacts();
    const hypothetical = makeFacts({ held: held(SUBJECT) });

    expect(memo.viewOf(SUBJECT, live).state).toBe("Locked");
    expect(memo.viewOf(SUBJECT, hypothetical).state).toBe("Obtained");
    expect(memo.viewOf(SUBJECT, live).state).toBe("Locked");
    expect(memo.derivations).toBe(2);
  });
});
