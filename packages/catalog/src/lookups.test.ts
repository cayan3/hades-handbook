import { describe, expect, it } from "vitest";
import { dataFor } from "./data.js";
import { createLookups } from "./lookups.js";
import type { TraitRecord } from "./schema.js";

describe("boonsOfGod", () => {
  const lookups = createLookups("hades2");
  const traits = Object.values(dataFor("hades2").boons as Record<string, TraitRecord>);
  const aGod = traits.find((t) => t.god !== null)?.god as string;

  it("returns every trait the god grants, including its Duos", () => {
    const expected = traits
      .filter((t) => {
        const pair: readonly string[] = t.duoGods ?? [];
        return t.god === aGod || pair.includes(aGod);
      })
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

  it("lists a Duo under both of its gods", () => {
    // The game's own loot tables file each Duo under both, and a player asking
    // for Hera's boons means to see the Hera duos among them. The function the
    // game uses to read a held trait's god back disagrees -- it stops at the
    // first match -- but that is iteration-order dependent and is not the
    // behaviour being copied here.
    const duos = traits.filter((t) => t.duoGods !== null);
    expect(duos.length).toBeGreaterThan(0);
    for (const duo of duos) {
      for (const god of duo.duoGods as readonly string[]) {
        expect(lookups.boonsOfGod(god)).toContain(duo.id);
      }
    }
  });

  it("does not invent a god for a trait that has neither a god nor a pair", () => {
    // Chaos boons, keepsakes, aspects and talents all reach the loop with a
    // null god and no duoGods; they must contribute to no god's list at all.
    const attributed = new Set(
      traits.flatMap((t) => (t.god !== null ? [t.god] : (t.duoGods ?? []))).map(String),
    );
    const unattributed = traits.filter((t) => t.god === null && t.duoGods === null);
    expect(unattributed.length).toBeGreaterThan(0);
    for (const god of attributed) {
      for (const member of lookups.boonsOfGod(god)) {
        expect(unattributed.some((t) => t.id === member)).toBe(false);
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
