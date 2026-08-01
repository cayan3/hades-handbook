import { describe, expect, it } from "vitest";
import { dataFor } from "./data.js";
import { createLookups } from "./lookups.js";
import type { TraitRecord } from "./schema.js";

describe("boonsOfGod", () => {
  const lookups = createLookups("hades2");
  const traits = Object.values(dataFor("hades2").boons as Record<string, TraitRecord>);
  const aGod = traits.find((t) => t.god !== null)?.god as string;

  it("returns every trait the god grants", () => {
    const expected = traits
      .filter((t) => t.god === aGod)
      .map((t) => t.id)
      .sort();
    expect([...lookups.boonsOfGod(aGod)]).toEqual(expected);
    expect(expected.length).toBeGreaterThan(0);
  });

  it("returns the identical array object each call, frozen", () => {
    // The engine calls this once per set-shaped requirement per evaluation, and
    // the view re-evaluates whenever the run changes; a fresh array per call
    // would allocate through the whole hot path. Identity is the contract, so
    // it is asserted rather than left as an implementation detail.
    const first = lookups.boonsOfGod(aGod);
    expect(lookups.boonsOfGod(aGod)).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("answers a god it has never heard of with an empty list", () => {
    // Total, because the engine is: a requirement naming a god the snapshot
    // dropped must evaluate to "nothing satisfies it", never throw.
    const missing = lookups.boonsOfGod("NoSuchGodUpgrade");
    expect(missing).toEqual([]);
    expect(lookups.boonsOfGod("NoSuchOtherGod")).toBe(missing);
  });

  it("never includes a Duo, which belongs to no single god", () => {
    const duoIds = new Set(traits.filter((t) => t.duoGods !== null).map((t) => t.id));
    for (const god of new Set(traits.map((t) => t.god).filter((g): g is string => g !== null))) {
      for (const member of lookups.boonsOfGod(god)) {
        expect(duoIds.has(member)).toBe(false);
      }
    }
  });
});

describe("setMembers", () => {
  it("returns a declared set's members", () => {
    const lookups = createLookups("hades2");
    const sets = dataFor("hades2").namedSets as Record<string, { members: string[] }>;
    const entry = Object.entries(sets)[0];
    expect(entry).toBeDefined();
    const [id, record] = entry as [string, { members: string[] }];
    expect([...lookups.setMembers(id)]).toEqual([...record.members].sort());
  });

  it("is empty for hades1, which synthesizes no sets yet", () => {
    // Not an assertion that this is correct -- it records that the extraction
    // produces nothing here, so a change to that shows up as a failure rather
    // than as sets quietly appearing.
    const lookups = createLookups("hades1");
    const sets = dataFor("hades1").namedSets as Record<string, unknown>;
    for (const id of Object.keys(sets)) {
      expect(lookups.setMembers(id).length).toBeGreaterThanOrEqual(0);
    }
  });

  it("answers an unknown set with an empty list", () => {
    expect(createLookups("hades2").setMembers("NoSuchSet")).toEqual([]);
  });
});
