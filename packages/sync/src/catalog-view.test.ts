import { dataFor, poolGods, traitsFor } from "@repo/catalog";
import type { GameId, Requirement } from "@repo/core";
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
    const realGods = (game: GameId) =>
      Object.keys(dataFor(game).gods as Record<string, unknown>).filter(
        (name) => !name.startsWith("__mechanic_"),
      ).length;
    expect(shippedCatalog("hades2").gods.size).toBe(realGods("hades2") + cameos.length);
    expect(shippedCatalog("hades1").gods.size).toBe(realGods("hades1"));
  });

  /**
   * The table is a dump of the game's *loot* table, so it enumerates reward
   * slots and not deities, i.e. the Daedalus Hammer and the Pom variants sit
   * in it under a prefixed key. They stay in the table, which has to stay
   * faithful to the file it came from, and they aren't names a run can address.
   *
   * `kind` can't do this filtering bc Hermes, Chaos, and Selene are
   * `NonPoolSlot` exactly as the mechanical entries are (that flag is abt the
   * actual god pool cap, not abt being a god/deity in the first place lol), so
   * a filter written against it would throw away three real gods and a pool
   * naming Hermes would then be quarantined despite naming a god that the run
   * really did take a reward from.
   */
  it("leaves out the loot slots that are not gods, and keeps the gods that take no slot", () => {
    expect([...shippedCatalog("hades1").gods].sort()).toEqual([
      "Aphrodite",
      "Ares",
      "Artemis",
      "Athena",
      "Chaos",
      "Demeter",
      "Dionysus",
      "Hades",
      "Hermes",
      "Poseidon",
      "Zeus",
    ]);
    expect(shippedCatalog("hades2").gods.size).toBe(16);

    for (const game of GAMES) {
      const gods = shippedCatalog(game).gods;
      expect([...gods].filter((name) => name.startsWith("__mechanic_"))).toEqual([]);
      // The three that share the mechanical entries' `kind` and aren't
      // mechanical, which is what stops that flag being usable here.
      const table = dataFor(game).gods as Record<string, { kind: string } | undefined>;
      for (const god of ["Hermes", "Chaos"]) {
        expect(table[god]?.kind).toBe("NonPoolSlot");
        expect(gods.has(god)).toBe(true);
      }
    }
    const hades2Table = dataFor("hades2").gods as Record<string, { kind: string } | undefined>;
    expect(hades2Table.Selene?.kind).toBe("NonPoolSlot");
    expect(shippedCatalog("hades2").gods.has("Selene")).toBe(true);
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
   * The test above can't fail on this data, which is worth actually noting down
   * instead of having to discover it again later.
   *
   * Every god named in a `duoGods` list is already named by some record's own
   * `god` or by the god table (8 duo gods in Hades I and 9 in Hades II, all
   * of them reachable by some other way too). So the walk that collects them is
   * redundant today, and dropping it wouldn't actually change anything that
   * the assertion can see.
   *
   * The walk stays bc even though a duo whose second god grants no boons of
   * their own isn't something a patch would add (a duo's prerequisite is
   * holding boons from both gods; all 28 Hades I and 37 Hades II duo records
   * match this, so a duo naming a god with no boons could never be obtained),
   * there could be a extraction fault. A god drops out of the record-attributed
   * set when their records are misattributed, which this repo has already seen
   * (e.g. two Demeter records carried Zeus until the overlay corrected them).
   * The game was unchanged and the god was real, and the duo list is a second
   * route to the name while that lasts. This is the assertion that makes that
   * visible; when it fails, the branch has become load-bearing and the failure
   * says so, instead of the first symptom being a real god quarantined out of
   * somebody's pool.
   */
  it("names every duo god by some other route as well, for now", () => {
    for (const game of GAMES) {
      const records = Object.values(traitsFor(game));
      const otherwise = new Set<string>(Object.keys(dataFor(game).gods as Record<string, unknown>));
      for (const record of records) if (record.god !== null) otherwise.add(record.god);

      const duoGods = new Set(records.flatMap((record) => record.duoGods ?? []));
      expect(duoGods.size).toBeGreaterThan(0);
      expect([...duoGods].filter((god) => !otherwise.has(god))).toEqual([]);
    }
  });

  /**
   * This is the same shape one level down. `collectNames` recurses through
   * `anyOf` instead of matching the shapes the data happens to use so that a
   * gate nested deeper than expected still yields its identifier. This has
   * actually been measured: 110 `anyOf` nodes in Hades I and 141 in Hades II,
   * and every god under one is named elsewhere while no talent sits under one
   * at all. This means the recursion is unobservable on this data, and this
   * records that instead of leaving the next reader (hiii) to just like wonder
   * whether it's tested or not lol.
   */
  it("finds no identifier that only an anyOf branch reaches, for now", () => {
    for (const game of GAMES) {
      const under = { anyOf: 0, only: [] as string[] };
      const reachable = new Set<string>();
      const beneath = new Set<string>();

      const walk = (req: Requirement, inAnyOf: boolean): void => {
        switch (req.kind) {
          case "anyOf":
            under.anyOf++;
            for (const child of req.of) walk(child, true);
            return;
          case "all":
            for (const child of req.of) walk(child, inAnyOf);
            return;
          case "hasTalent":
            (inAnyOf ? beneath : reachable).add(req.talent);
            return;
          case "hasBoonFrom":
          case "godInPool":
            (inAnyOf ? beneath : reachable).add(req.god);
            return;
          default:
            return;
        }
      };

      for (const record of Object.values(traitsFor(game))) {
        if (record.god !== null) reachable.add(record.god);
        for (const god of record.duoGods ?? []) reachable.add(god);
        if (record.prereq !== null) walk(record.prereq, false);
        if (record.activation !== null) walk(record.activation, false);
      }
      for (const name of beneath) if (!reachable.has(name)) under.only.push(name);

      expect(under.anyOf).toBeGreaterThan(0);
      expect(under.only).toEqual([]);
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
   * Both halves of the union, and the union is why this is 24 rather than the
   * five the gates name. A row member that gates nothing appears in no
   * requirement, and quarantining it on reload would throw away an answer the
   * player gave.
   */
  it("holds every talent a gate names and every talent a row offers", () => {
    const talents = shippedCatalog("hades1").talents;
    expect(talents.size).toBe(24);
    for (const gating of [
      "AmmoMetaUpgrade",
      "BackstabMetaUpgrade",
      "ExtraChanceReplenishMetaUpgrade",
      "FirstStrikeMetaUpgrade",
      "ReloadAmmoMetaUpgrade",
    ]) {
      expect(talents.has(gating)).toBe(true);
    }
    // Gates nothing; reachable only through the row it sits in.
    expect(talents.has("ExtraChanceMetaUpgrade")).toBe(true);
    expect(shippedCatalog("hades2").talents.size).toBe(0);
  });

  /**
   * Twelve, which is what the game's own table states, not the three that gate
   * anything the Handbook models. A row is keyed by its first member: the table
   * gives its rows no names, and inventing twelve would be inventing eleven
   * nothing has ever needed to say.
   */
  it("asks about every Mirror row the game has, in the game's own pairs", () => {
    const rows = shippedCatalog("hades1").mirrorRows;
    expect(rows.length).toBe(12);
    for (const row of rows) expect(row.members.length).toBe(2);
    expect(rows.find((row) => row.id === "AmmoMetaUpgrade")?.members).toEqual([
      "AmmoMetaUpgrade",
      "ReloadAmmoMetaUpgrade",
    ]);
    // Hades II replaces the Mirror with Arcana and gates no boon on one.
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
