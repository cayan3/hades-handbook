import { dataFor, poolGods, traitsFor } from "@repo/catalog";
import type { GameId } from "@repo/core";
import { describe, expect, it } from "vitest";
import { shippedCatalog } from "./catalog-view.js";

const GAMES: readonly GameId[] = ["hades1", "hades2"];

describe("the shipped catalog view", () => {
  it("is built once per game and handed back by identity", () => {
    for (const game of GAMES) expect(shippedCatalog(game)).toBe(shippedCatalog(game));
  });

  it("carries the build stamp a run is persisted against", () => {
    for (const game of GAMES) {
      const stamp = (dataFor(game).version as { steamBuildId: string }).steamBuildId;
      expect(shippedCatalog(game).dataVersion).toBe(stamp);
      expect(shippedCatalog(game).dataVersion).not.toBe("");
    }
  });

  it("gives the two games different stamps, so one cannot pass for the other", () => {
    expect(shippedCatalog("hades1").dataVersion).not.toBe(shippedCatalog("hades2").dataVersion);
  });
});

describe("the two god id spaces", () => {
  /**
   * The whole `mark` path depends on this: a boon's god goes straight into the
   * run's pool, and a load checks that pool against this set. If one name the
   * model uses were a loot table id, the pool would carry an id no requirement
   * and no member list can match (would be silent too bc nothing at
   * evaluation time can tell a wrong god from one that's actually yk absent).
   */
  it("shares no name with the loot table id space", () => {
    for (const game of GAMES) {
      const table = dataFor(game).gods as Record<string, { id: string }>;
      const lootIds = Object.values(table).map((record) => record.id);
      const gods = shippedCatalog(game).gods;
      expect(lootIds.filter((id) => gods.has(id))).toEqual([]);
    }
  });

  /**
   * The god *table* is narrower than the god *name space*, and mistaking one
   * for the other is a false quarantine on the data shipped today (not a
   * hazard waiting on a game update that won't actually happen). A run that
   * takes an Athena reward really did meet Athena lol, but Hades II gives her
   * no table entry because she only makes a cameo, so a check written against
   * the table would quarantine her now, on this catalog. This is measured,
   * not assumed; Hades I has no such gods at all, so a check written against
   * Hades I alone would look correct.
   */
  it("covers the four Hades II gods who grant boons without a table entry", () => {
    const table = new Set(Object.keys(dataFor("hades2").gods as Record<string, unknown>));
    const cameos = ["Artemis", "Athena", "Dionysus", "Hades"];
    for (const god of cameos) {
      expect(table.has(god)).toBe(false);
      expect(shippedCatalog("hades2").gods.has(god)).toBe(true);
    }
    expect(shippedCatalog("hades2").gods.size).toBe(table.size + cameos.length);

    const hades1Table = new Set(Object.keys(dataFor("hades1").gods as Record<string, unknown>));
    expect(shippedCatalog("hades1").gods.size).toBe(hades1Table.size);
  });

  it("holds every god a trait record names", () => {
    for (const game of GAMES) {
      const gods = shippedCatalog(game).gods;
      const missing = Object.values(traitsFor(game))
        .flatMap((record) => [record.god, ...(record.duoGods ?? [])])
        .filter((god): god is string => god !== null && !gods.has(god));
      expect(missing).toEqual([]);
    }
  });

  /**
   * The cameo gods are in the name space and out of the cap, and those are
   * different questions answered by different sets. Keeping them apart is what
   * lets a source write a cameo god into the pool without inflating a count
   * that the game itself doesn't actually inflate.
   */
  it("does not put a cameo god into the set the pool cap counts", () => {
    const counted = poolGods("hades2");
    for (const god of ["Artemis", "Athena", "Dionysus", "Hades"]) {
      expect(shippedCatalog("hades2").gods.has(god)).toBe(true);
      expect(counted.has(god)).toBe(false);
    }
  });
});

describe("the identifier sets a stored run is checked against", () => {
  it("names every slot some record claims", () => {
    expect([...shippedCatalog("hades1").slots].sort()).toEqual([
      "Assist",
      "Keepsake",
      "Melee",
      "Ranged",
      "Rush",
      "Secondary",
      "Shout",
    ]);
    expect([...shippedCatalog("hades2").slots].sort()).toEqual([
      "Aspect",
      "Keepsake",
      "Mana",
      "Melee",
      "Ranged",
      "Rush",
      "Secondary",
      "Spell",
    ]);
  });

  it("carries the keepsakes the extraction emits", () => {
    expect(shippedCatalog("hades1").keepsakes.size).toBe(38);
    expect(shippedCatalog("hades2").keepsakes.size).toBe(35);
  });

  /**
   * Hades I's five gating talents, recovered from the gates that read them
   * bc a talent has no record of its own anywhere in the extraction.
   * Hades II doesn't have any bc its Arcana gates nothing, so no requirement
   * mentions it.
   */
  it("recovers the Mirror talents from the gates that read them", () => {
    expect([...shippedCatalog("hades1").talents].sort()).toEqual([
      "AmmoMetaUpgrade",
      "BackstabMetaUpgrade",
      "ExtraChanceReplenishMetaUpgrade",
      "FirstStrikeMetaUpgrade",
      "ReloadAmmoMetaUpgrade",
    ]);
    expect(shippedCatalog("hades2").talents.size).toBe(0);
  });

  /**
   * Pinned because it's a gap and not an actual game fact. Hades I has three
   * Mirror rows and the extraction emits none of them, so a manual source
   * doesn't ask any questions abt the Mirror so every talent stays "uncollected"
   * (which is the safe direction of the two bc it would read as "nobody asked"
   * instead of just impossible). This assertion is what turns emitting them
   * into a deliberate change: when the rows arrive, it fails, and whoever fixes
   * it has to look at the surface that consumes them.
   */
  it("has no Mirror rows to ask about, in either game", () => {
    expect(shippedCatalog("hades1").mirrorRows).toEqual([]);
    expect(shippedCatalog("hades2").mirrorRows).toEqual([]);
  });
});

describe("a weapon form", () => {
  /**
   * The equipped form is checked against the trait table, which is correct in
   * both games but for different reasons: Hades II gives a form its own record,
   * while in Hades I a form is simply an ordinary trait record. One check
   * serves both, which is what makes the write-side rule stateable at all.
   */
  it("is a trait record in both games, however differently it is filed", () => {
    expect(Object.hasOwn(traitsFor("hades1").valueOf(), "ShieldLoadAmmoTrait")).toBe(true);
    expect(Object.hasOwn(traitsFor("hades2").valueOf(), "TorchAutofireAspect")).toBe(true);
  });

  it("is marked as one in Hades II and, for now, in neither way in Hades I", () => {
    const marked = (game: GameId) =>
      Object.values(traitsFor(game)).filter((record) => record.slot === "Aspect").length;
    expect(marked("hades2")).toBe(24);
    // Hades I doesn't emit any marker at all, which is why the manual source
    // can only refuse a form for one of the two games.
    expect(marked("hades1")).toBe(0);
  });
});
