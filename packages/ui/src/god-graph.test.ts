import { type TraitRecord, traitsFor } from "@repo/catalog";
import type { GodId, Requirement, TraitId } from "@repo/core";
import { describe, expect, it } from "vitest";
import { godGraph, graphTraits, isJunctionId, neighbourhood, pageTraits } from "./god-graph.js";
import { createNodeSource } from "./node-view.js";
import { held, makeFacts, stubLookups, stubNaming, stubRules } from "./test-support.js";

/**
 * The layout rule, on a world small enough to state.
 *
 * Hand-written records here rather than shipped ones: what is under test is the
 * shape a gate turns into, and a page of two dozen real boons asserts what the
 * extraction says instead. The last case is the exception and is against both
 * catalogs, because "the rule survives the data" is a different claim.
 */

function record(id: TraitId, over: Partial<TraitRecord> = {}): TraitRecord {
  return {
    id,
    god: null,
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
    prereq: null,
    prereqSource: null,
    tier: null,
    blockedBy: null,
    activation: null,
    aspectConflicts: null,
    source: `Scripts/Test.lua:${id}`,
    ...over,
  };
}

function world(...records: readonly TraitRecord[]) {
  const byId = Object.fromEntries(records.map((entry) => [entry.id, entry]));
  return {
    ...createNodeSource("hades1", stubRules(), stubLookups(), byId),
    naming: stubNaming,
  };
}

const has = (trait: TraitId): Requirement => ({ kind: "hasTrait", trait });
const any = (...of: Requirement[]): Requirement => ({ kind: "anyOf", min: 1, of });
const all = (...of: Requirement[]): Requirement => ({ kind: "all", of });
const fire = (count: number): Requirement => ({ kind: "hasElement", element: "Fire", count });

const ZEUS = "Zeus" as GodId;
const ARES = "Ares" as GodId;

describe("the bands", () => {
  it("runs tiers in order and never names one", () => {
    const source = world(
      record("c", { god: ZEUS, tier: 2 }),
      record("a", { god: ZEUS, tier: 1 }),
      record("duo", { duoGods: [ZEUS, ARES] }),
      record("infusion", { god: ZEUS, prereq: fire(2) }),
      record("talent", { god: ZEUS, prereq: has("elsewhere") }),
    );
    const graph = godGraph(source, ZEUS, makeFacts());

    expect(graph.bands.map((band) => band.kind)).toEqual([
      "tier",
      "tier",
      "infusion",
      "untiered",
      "duo",
    ]);
    // The tier is the extraction's own rank and the game never shows it, so it
    // orders the page and is written nowhere on it.
    expect(graph.bands.map((band) => band.label)).toEqual([
      null,
      null,
      "Infusions",
      null,
      "Duos and Godsent Hexes",
    ]);
    expect(graph.bands.flatMap((band) => band.members.map((m) => m.trait))).toEqual([
      "a",
      "c",
      "infusion",
      "talent",
      "duo",
    ]);
  });

  it("gives an Infusion its own band whatever shape the element gate takes", () => {
    // Three shapes in the data and a check on the top-level kind catches one:
    // a bare count, a choice of counts, and one count per element.
    const source = world(
      record("bare", { god: ZEUS, prereq: fire(2) }),
      record("choice", { god: ZEUS, prereq: any(fire(4), fire(6)) }),
      record("every", { god: ZEUS, prereq: all(fire(1), fire(2)) }),
      record("mixed", { god: ZEUS, prereq: all(fire(1), has("x")) }),
    );
    const bands = godGraph(source, ZEUS, makeFacts()).bands;

    const infusions = bands.find((band) => band.kind === "infusion");
    expect(infusions?.members.map((m) => m.trait)).toEqual(["bare", "choice", "every"]);
    // A gate naming a boon is a prerequisite gate however much element it also
    // asks for, so it stays on the ladder.
    expect(bands.find((band) => band.kind === "untiered")?.members).toHaveLength(1);
  });

  it("puts a Duo on the rim of both its gods' pages and names the other one", () => {
    const source = world(record("duo", { duoGods: [ZEUS, ARES] }), record("a", { god: ZEUS, tier: 1 }));

    const zeus = godGraph(source, ZEUS, makeFacts()).bands.at(-1);
    expect(zeus?.kind).toBe("duo");
    expect(zeus?.members).toEqual([{ trait: "duo", partner: ARES, kind: "duo" }]);

    const ares = godGraph(source, ARES, makeFacts()).bands.at(-1);
    expect(ares?.members).toEqual([{ trait: "duo", partner: ZEUS, kind: "duo" }]);
  });

  /**
   * Which of the four kinds a member is, which is what decides whether its
   * outline is the page's god colour or one of its own.
   *
   * The order the four are asked in is the whole of what these check. Three of
   * them are found by shape or by gate and a Legendary is found by what the
   * record says it can be offered as — and the games hand out `Legendary` far
   * more widely than the word suggests, so the rarity question has to be asked
   * last and asked exactly.
   */
  describe("which kind a member is", () => {
    const kindOnPage = (source: ReturnType<typeof world>, god: GodId, trait: TraitId) =>
      godGraph(source, god, makeFacts())
        .bands.flatMap((band) => band.members)
        .find((member) => member.trait === trait)?.kind;

    it("calls an ordinary boon of this god no kind at all", () => {
      const source = world(record("plain", { god: ZEUS, tier: 1, rarity: ["Common", "Epic"] }));
      expect(kindOnPage(source, ZEUS, "plain")).toBeNull();
    });

    it("finds a Legendary by a rarity list that offers nothing else", () => {
      const source = world(record("leg", { god: ZEUS, tier: 2, rarity: ["Legendary"] }));
      expect(kindOnPage(source, ZEUS, "leg")).toBe("legendary");
      // And it stays on the god's own ladder: a Legendary is the top of that
      // ladder, not a category beside it.
      const bands = godGraph(source, ZEUS, makeFacts()).bands;
      expect(bands.at(-1)?.kind).toBe("tier");
    });

    it("does not call a boon Legendary for offering it alongside four others", () => {
      // 163 Hades II records offer Legendary as the top of an ordinary ladder
      // they can also be rolled at the bottom of. Reading "contains Legendary"
      // would paint every one of them.
      const source = world(
        record("ladder", {
          god: ZEUS,
          tier: 1,
          rarity: ["Common", "Rare", "Epic", "Heroic", "Legendary"],
        }),
      );
      expect(kindOnPage(source, ZEUS, "ladder")).toBeNull();
    });

    it("calls a Duo a Duo even where the game gives it the Legendary rarity", () => {
      // Hades I has no Duo rarity: all 28 of its Duos declare `Legendary` and
      // nothing else, so asking about rarity first would take them off the rim.
      const source = world(record("duo", { duoGods: [ZEUS, ARES], rarity: ["Legendary"] }));
      expect(kindOnPage(source, ZEUS, "duo")).toBe("duo");
    });

    it("calls a Godsent Hex a Hex even where it declares Legendary too", () => {
      // Five of the nine do.
      const source = world(
        record("hex", {
          god: ZEUS,
          rarity: ["Legendary"],
          prereq: all(
            has("SpellPolymorphTrait"),
            any(
              { kind: "hasBoonFrom", god: ZEUS },
              { kind: "hasKeepsake", keepsake: "ForceZeusBoonKeepsake" },
            ),
          ),
        }),
      );
      expect(kindOnPage(source, ZEUS, "hex")).toBe("hex");
    });

    it("finds an Infusion by its gate, which is the only thing that can find one", () => {
      // Not one record in either game declares the Elemental rarity, so there
      // is nothing to read it off — the gate being every leaf an element count
      // is the whole test.
      const source = world(
        record("inf", { god: ZEUS, rarity: ["Common"], prereq: fire(2) }),
      );
      expect(kindOnPage(source, ZEUS, "inf")).toBe("infusion");
    });
  });

  it("puts a Godsent Hex on the rim beside the Duos", () => {
    // The matching Hex plus a boon *or* the keepsake of one Olympian, which is
    // the pair of leaf kinds nothing else produces. It answers to two gods the
    // way a Duo does, so it is grouped and revealed with them rather than
    // filed under a category the game does not have.
    const hex: Requirement = all(
      has("SpellPolymorphTrait"),
      any(
        { kind: "hasBoonFrom", god: ZEUS },
        { kind: "hasKeepsake", keepsake: "ForceZeusBoonKeepsake" },
      ),
    );
    const source = world(
      record("a", { god: ZEUS, tier: 1 }),
      record("hex", { god: ZEUS, prereq: hex }),
      record("duo", { duoGods: [ZEUS, ARES] }),
    );
    const bands = godGraph(source, ZEUS, makeFacts()).bands;

    expect(bands.at(-1)?.kind).toBe("duo");
    expect(bands.at(-1)?.members.map((m) => m.trait).sort()).toEqual(["duo", "hex"]);
    // A Hex belongs to this god outright, so it has no partner to name.
    expect(bands.at(-1)?.members.find((m) => m.trait === "hex")?.partner).toBeNull();
    expect(bands.some((band) => band.kind === "untiered")).toBe(false);
  });

  it("finds every Godsent Hex the shipped catalog carries, and only those", () => {
    // Nine, one per Olympian, and Hades I has none.
    const h2 = createNodeSource("hades2", stubRules(), stubLookups(), traitsFor("hades2"));
    let hexes = 0;
    for (const god of ["Zeus", "Hera", "Poseidon", "Demeter", "Apollo"] as GodId[]) {
      const rim = godGraph(h2, god, makeFacts()).bands.find((b) => b.kind === "duo");
      hexes += rim?.members.filter((m) => m.partner === null).length ?? 0;
    }
    expect(hexes).toBe(5);
  });

  it("orders a band under where its nodes come from", () => {
    // Declared `z, x, y`, named in that order too, and `y` hangs off the
    // leftmost of the band above while `x` hangs off the rightmost. So the
    // answer matches neither the declared order nor the name order, which is
    // the only arrangement that can tell a barycentre pass from doing nothing.
    const source = world(
      record("a", { god: ZEUS, tier: 1 }),
      record("b", { god: ZEUS, tier: 1 }),
      record("z", { god: ZEUS, tier: 2 }),
      record("x", { god: ZEUS, tier: 2, prereq: has("b") }),
      record("y", { god: ZEUS, tier: 2, prereq: has("a") }),
    );
    const bands = godGraph(source, ZEUS, makeFacts()).bands;

    expect(bands[0]?.members.map((m) => m.trait)).toEqual(["a", "b"]);
    // `z` has no prerequisite on an earlier band, so it has no position to
    // average and falls to the end.
    expect(bands[1]?.members.map((m) => m.trait)).toEqual(["y", "x", "z"]);
  });
});

describe("the connectors", () => {
  it("draws a line per prerequisite on the page and none for anything off it", () => {
    const source = world(
      record("a", { god: ZEUS, tier: 1 }),
      record("d", { god: ZEUS, tier: 2, prereq: all(has("a"), has("elsewhere")) }),
    );
    const graph = godGraph(source, ZEUS, makeFacts());

    expect(graph.edges).toEqual([{ id: "a>d", from: "a", to: "d", taken: false, reached: false }]);
  });

  it("is solid where the run holds the prerequisite and open where it does not", () => {
    const source = world(
      record("a", { god: ZEUS, tier: 1 }),
      record("b", { god: ZEUS, tier: 1 }),
      record("d", { god: ZEUS, tier: 2, prereq: all(has("a"), has("b")) }),
    );
    const graph = godGraph(source, ZEUS, makeFacts({ held: held("a") }));

    expect(graph.edges.map((edge) => [edge.from, edge.taken])).toEqual([
      ["a", true],
      ["b", false],
    ]);
  });

  it("stands a junction where a gate branches, counting every branch it offers", () => {
    const source = world(
      record("a", { god: ZEUS, tier: 1 }),
      record("d", { god: ZEUS, tier: 2, prereq: any(has("a"), has("elsewhere"), has("far")) }),
    );
    const graph = godGraph(source, ZEUS, makeFacts({ held: held("a") }));
    const junction = graph.bands[1]?.junctions[0];

    // One line is drawn and the gate offers three. Announcing "any 1 of 1"
    // would be describing the page rather than the requirement.
    expect(junction).toMatchObject({ dependent: "d", min: 1, of: 3, status: "satisfied" });
    expect(graph.edges.map((edge) => edge.id)).toEqual([`a>${junction?.id}`, `${junction?.id}>d`]);
    expect(graph.edges.every((edge) => edge.taken)).toBe(true);
  });

  it("marks a path as reached once the run holds the boon it leads to", () => {
    const source = world(
      record("a", { god: ZEUS, tier: 1 }),
      record("d", { god: ZEUS, tier: 2, prereq: any(has("a"), has("elsewhere")) }),
    );
    const before = godGraph(source, ZEUS, makeFacts());
    expect(before.edges.every((e) => !e.reached)).toBe(true);

    const after = godGraph(source, ZEUS, makeFacts({ held: held("d") }));
    expect(after.edges.every((e) => e.reached)).toBe(true);
    expect(after.bands[1]?.junctions[0]?.reached).toBe(true);
  });

  it("draws no junction where a gate branches entirely off the page", () => {
    const source = world(
      record("a", { god: ZEUS, tier: 1 }),
      record("d", { god: ZEUS, tier: 2, prereq: any(has("elsewhere"), has("far")) }),
    );
    const graph = godGraph(source, ZEUS, makeFacts());

    // A lone diamond above a node with no lines into it says nothing. The whole
    // gate is still written out in the detail surface.
    expect(graph.bands.flatMap((band) => band.junctions)).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  it("hangs a gate's branch points off the band its node is in", () => {
    const source = world(
      record("a", { god: ZEUS, tier: 1 }),
      record("b", { god: ZEUS, tier: 1 }),
      record("d", { god: ZEUS, tier: 2, prereq: all(any(has("a")), any(has("b"))) }),
    );
    const graph = godGraph(source, ZEUS, makeFacts());

    expect(graph.bands[0]?.junctions).toEqual([]);
    expect(graph.bands[1]?.junctions.map((junction) => junction.id)).toEqual(["d#0", "d#1"]);
    expect(graph.bands[1]?.junctions.every((j) => isJunctionId(j.id))).toBe(true);
  });
});

describe("the drawn neighbourhood", () => {
  const source = world(
    record("a", { god: ZEUS, tier: 1 }),
    record("b", { god: ZEUS, tier: 1 }),
    record("d", { god: ZEUS, tier: 2, prereq: any(has("a"), has("b")) }),
    record("other", { god: ZEUS, tier: 2, prereq: has("b") }),
  );
  const graph = godGraph(source, ZEUS, makeFacts());

  it("is empty at rest, because a page carries more lines than it can show", () => {
    expect(neighbourhood(graph, null).size).toBe(0);
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  it("takes everything reaching a node and everything leaving it", () => {
    expect([...neighbourhood(graph, "d")].sort()).toEqual(["a>d#0", "b>d#0", "d#0>d"]);
    // `b` also feeds `other`, which `d`'s neighbourhood has no business drawing.
    expect([...neighbourhood(graph, "b")].sort()).toEqual(["b>d#0", "b>other", "d#0>d"]);
  });

  it("carries a branch point's own way down when the selection feeds it", () => {
    // Without it the path leaves the node, reaches a diamond and stops, which
    // reads as a dead end rather than as the thing it unlocks.
    expect([...neighbourhood(graph, "a")].sort()).toEqual(["a>d#0", "d#0>d"]);
  });
});

describe("what a page carries", () => {
  it("offers no record the catalog cannot name", () => {
    const source = world(
      record("named", { god: ZEUS, tier: 1 }),
      record("nameless", { god: ZEUS, tier: 1, name: null }),
    );
    // The resolver falls back to the id, which is right for a label on
    // something already on screen and wrong for a boon offered to take.
    expect(pageTraits(source, ZEUS)).toEqual(["named"]);
  });

  it("holds up against both shipped catalogs", () => {
    for (const game of ["hades1", "hades2"] as const) {
      const source = createNodeSource(game, stubRules(), stubLookups(), traitsFor(game));
      for (const god of ["Zeus", "Poseidon", "Demeter"] as GodId[]) {
        const graph = godGraph(source, god, makeFacts());
        const onPage = new Set(graphTraits(graph));

        expect(onPage.size).toBeGreaterThan(0);
        // A band that made it into the list has something in it.
        expect(graph.bands.every((band) => band.members.length > 0)).toBe(true);
        // Nothing is drawn from a node the page does not carry.
        for (const edge of graph.edges) {
          if (!isJunctionId(edge.from)) expect(onPage.has(edge.from)).toBe(true);
        }
        // Every junction belongs to a node in the band it hangs off, and offers
        // at least as many branches as reach it.
        for (const band of graph.bands) {
          const members = new Set(band.members.map((member) => member.trait));
          for (const junction of band.junctions) {
            expect(members.has(junction.dependent)).toBe(true);
            const into = graph.edges.filter((edge) => edge.to === junction.id).length;
            expect(junction.of).toBeGreaterThanOrEqual(into);
          }
        }
      }
    }
  });

  it("puts Hades II's element-gated boons in the Infusions band", () => {
    const source = createNodeSource("hades2", stubRules(), stubLookups(), traitsFor("hades2"));
    const zeus = godGraph(source, "Zeus" as GodId, makeFacts());

    expect(zeus.bands.find((band) => band.kind === "infusion")?.members).toEqual([
      { trait: "ElementalDamageFloorBoon", partner: null, kind: "infusion" },
    ]);
    // Hades I has no Elements, so it has no such band anywhere.
    const h1 = createNodeSource("hades1", stubRules(), stubLookups(), traitsFor("hades1"));
    for (const god of ["Zeus", "Ares", "Athena"] as GodId[]) {
      expect(godGraph(h1, god, makeFacts()).bands.some((b) => b.kind === "infusion")).toBe(false);
    }
  });
});
