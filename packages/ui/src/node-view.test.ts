import { type TraitRecord, textFor, traitsFor } from "@repo/catalog";
import type { Requirement, TraitId } from "@repo/core";
import { describe, expect, it } from "vitest";
import { POOL_FULL_BODY } from "./describe.js";
import { createNodeSource, deriveNodeDetail, deriveNodeView } from "./node-view.js";
import { held, makeFacts, stubLookups, stubRules } from "./test-support.js";

/**
 * Derivation against shipped records, with the rules stubbed.
 *
 * Real records because the fields that matter here — an empty rarity list, an
 * activation gate, a missing tier — are properties of the extraction, and a
 * hand-written one would assert what this file believes rather than what the
 * data says. Stubbed rules because feasibility has its own tests beside each
 * game's data, and a test wanting a boon blocked should say so in one line.
 */

const H1 = traitsFor("hades1");
const H2 = traitsFor("hades2");

/** Lightning Rod: an Artemis boon gated on a Mirror talent and two gods. */
const LIGHTNING_ROD = "AmmoBoltTrait" as TraitId;
const ARTEMIS_BOON = "ArtemisWeaponTrait" as TraitId;
const ZEUS_BOON = "ZeusWeaponTrait" as TraitId;
const TALENT = "AmmoMetaUpgrade";
/** Sweet Surrender: an ordinary second rung of Aphrodite's own ladder. */
const TIER_TWO = "AphroditeWeakenTrait" as TraitId;

/** Self Healing: obtainable at 2 Fire, and inert until 3. */
const SELF_HEALING = "ElementalRallyBoon" as TraitId;
/** Flame Strike: Hestia's attack, and one of the 190 records with an affinity. */
const FLAME_STRIKE = "HestiaWeaponBoon" as TraitId;

function h1(rules = stubRules(), records = H1) {
  return createNodeSource("hades1", rules, stubLookups(), records);
}

function h1Facts(talent: "selected" | "notSelected" | null, ...traits: TraitId[]) {
  return makeFacts({
    held: held(...traits),
    equipped: talent === null ? {} : { talents: new Map([[TALENT, talent]]) },
  });
}

describe("deriveNodeView", () => {
  it("walks the whole ladder from one boon and one run at a time", () => {
    const source = h1();
    const stateOf = (facts: ReturnType<typeof h1Facts>) =>
      deriveNodeView(source, LIGHTNING_ROD, facts).state;

    expect(stateOf(h1Facts("selected", LIGHTNING_ROD))).toBe("Obtained");
    expect(stateOf(h1Facts("selected", ARTEMIS_BOON, ZEUS_BOON))).toBe("Available");
    expect(stateOf(h1Facts("selected", ARTEMIS_BOON))).toBe("Pending");
    expect(stateOf(h1Facts(null))).toBe("Locked");
    expect(stateOf(h1Facts("notSelected"))).toBe("Impossible");
  });

  it("puts the state in words, with the god a record has", () => {
    // Sweet Surrender is a plain rung on one god's ladder. Lightning Rod is the
    // other case: a talent-gated cross-god boon answers to no single god, and
    // every Duo is the same. The record's tier reaches neither name.
    const view = deriveNodeView(h1(), TIER_TWO, makeFacts());
    expect(view.tier).toBe(2);
    expect(view.label).toBe("Sweet Surrender — Locked — Aphrodite");

    const rod = deriveNodeView(h1(), LIGHTNING_ROD, h1Facts("selected", ARTEMIS_BOON));
    expect(rod.label).toBe("Lightning Rod — Pending");
  });

  it("says why, and does not ask why for a boon that can still be had", () => {
    const impossible = deriveNodeView(h1(), LIGHTNING_ROD, h1Facts("notSelected"));
    expect(impossible.notice?.body).toContain("Mirror row");

    const locked = deriveNodeView(h1(), LIGHTNING_ROD, h1Facts(null));
    expect(locked.notice).toBeNull();
  });

  it("reports the boon's own block ahead of anything its prerequisite says", () => {
    // Both are true here and only one is actionable: the prerequisite is a
    // thing to go and collect, the exclusive group is a door that shut.
    const rules = stubRules({
      blocked: new Map([
        [LIGHTNING_ROD, { kind: "slotConflict", trait: LIGHTNING_ROD, conflictsWith: ZEUS_BOON }],
      ]),
    });
    const view = deriveNodeView(h1(rules), LIGHTNING_ROD, h1Facts("notSelected"));

    expect(view.state).toBe("Impossible");
    expect(view.notice?.body).toContain("only one of the two can be held");
  });

  it("carries the required copy and the keepsake for a full pool", () => {
    // No shipped record asks for a god in the pool, so this verdict can't be
    // produced from the catalog -- the record is written here to prove the copy
    // is wired.
    const synthetic: Requirement = { kind: "godInPool", god: "Poseidon" };
    const records: Record<TraitId, TraitRecord> = {
      ...H1,
      demo: { ...(H1[LIGHTNING_ROD] as TraitRecord), id: "demo" as TraitId, prereq: synthetic },
    };
    const source = h1(stubRules({ poolFull: true }), records);
    const view = deriveNodeView(source, "demo" as TraitId, makeFacts());

    expect(view.state).toBe("Impossible");
    expect(view.notice?.lead).toBe("Impossible for now.");
    expect(view.notice?.body).toBe(POOL_FULL_BODY);
    // Named from the shipped forcing map, which since the pool model was
    // simplified exists for this sentence and for nothing else.
    expect(view.notice?.keepsake).toBe("Conch Shell");
  });
});

describe("what a node declines to show", () => {
  it("shows a rarity only where the record declares the boon has one", () => {
    // 191 records in this game declare no rarity, and the writer that records a
    // mark defaults to Common for them. Rendering that puts a value on screen
    // the data never claimed, dressed as an observation.
    const declared = Object.values(H1).find((r) => r.rarity.length > 0);
    const silent = Object.values(H1).find((r) => r.rarity.length === 0);
    expect(declared).toBeDefined();
    expect(silent).toBeDefined();

    const source = h1();
    const withRarity = deriveNodeView(
      source,
      declared!.id,
      makeFacts({ held: held([declared!.id, "Epic"]) }),
    );
    const withoutRarity = deriveNodeView(
      source,
      silent!.id,
      makeFacts({ held: held([silent!.id, "Common"]) }),
    );

    expect(withRarity.rarity).toBe("Epic");
    expect(withoutRarity.rarity).toBeNull();
  });

  it("shows no rarity for a boon nobody holds, declared or not", () => {
    const declared = Object.values(H1).find((r) => r.rarity.length > 0);
    expect(deriveNodeView(h1(), declared!.id, makeFacts()).rarity).toBeNull();
  });

  it("offers no rarity at all for a boon that has a kind", () => {
    // Lightning Rod is a Duo, and this game has no Duo rarity — all 28 of them
    // declare Legendary and nothing else, so a held one used to read
    // "Legendary" and wear the Legendary orange on four surfaces. The kind is
    // the word now, and there is nothing left to offer.
    const view = deriveNodeView(h1(), LIGHTNING_ROD, h1Facts("selected", LIGHTNING_ROD));
    expect(view.kind).toBe("duo");
    expect(view.rarity).toBeNull();
    expect(view.rarities).toEqual([]);
  });

  it("leaves a kindless boon its rarity", () => {
    const view = deriveNodeView(h1(), TIER_TWO, makeFacts({ held: held([TIER_TWO, "Epic"]) }));
    expect(view.kind).toBeNull();
    expect(view.rarity).toBe("Epic");
    expect(view.rarities.length).toBeGreaterThan(0);
  });
});

describe("the element affinity", () => {
  const h2 = createNodeSource("hades2", stubRules(), stubLookups(), H2);

  it("comes off the record, in the game that has elements", () => {
    // Flame Strike is Hestia's attack and counts toward Fire. Read from the
    // shipped record rather than stated, because which element a boon carries
    // is the extraction's fact and not this file's.
    expect(deriveNodeView(h2, FLAME_STRIKE, makeFacts({ game: "hades2" })).element).toBe("Fire");
  });

  it("is empty on an Infusion, which is gated on elements rather than carrying one", () => {
    // The case that looks backwards and is the schema's own rule: an Infusion
    // asks for element counts, so it counts toward nothing itself. Written down
    // because picking one for the test above is the obvious mistake.
    expect(deriveNodeView(h2, SELF_HEALING, makeFacts({ game: "hades2" })).element).toBeNull();
  });

  it("is null throughout Hades I", () => {
    // 0 of 449, so this is the whole game rather than the boon picked for it.
    expect(deriveNodeView(h1(), TIER_TWO, makeFacts()).element).toBeNull();
  });
});

describe("the dormant badge", () => {
  const source = createNodeSource("hades2", stubRules(), stubLookups(), H2);

  function h2Facts(fire: number) {
    return makeFacts({
      game: "hades2",
      held: held(SELF_HEALING),
      elements: new Map([["Fire" as const, fire]]),
    });
  }

  it("is a badge on Obtained rather than a state of its own", () => {
    const inert = deriveNodeView(source, SELF_HEALING, h2Facts(2));
    expect(inert.state).toBe("Obtained");
    expect(inert.dormant).toBe(true);
  });

  it("clears once the higher threshold is met", () => {
    const live = deriveNodeView(source, SELF_HEALING, h2Facts(3));
    expect(live.state).toBe("Obtained");
    expect(live.dormant).toBe(false);
  });

  it("never fires for a boon the run does not hold", () => {
    // Dormancy is about something you own doing nothing. A boon you haven't
    // taken is not inert, it is unobtained, and the two must not look alike.
    const facts = makeFacts({ game: "hades2", elements: new Map([["Fire" as const, 2]]) });
    expect(deriveNodeView(source, SELF_HEALING, facts).dormant).toBe(false);
  });

  it("names the shortfall as have against need when asked", () => {
    const view = deriveNodeView(source, SELF_HEALING, h2Facts(2));
    const detail = deriveNodeDetail(source, view, h2Facts(2));
    expect(detail.activation).toEqual(["needs 3 Fire — you have 2"]);
  });
});

describe("deriveNodeDetail", () => {
  it("lists what is still needed, and nothing once it is met", () => {
    const source = h1();
    const facts = h1Facts("selected", ARTEMIS_BOON);
    const pending = deriveNodeView(source, LIGHTNING_ROD, facts);
    expect(deriveNodeDetail(source, pending, facts).needed.length).toBeGreaterThan(0);

    const done = h1Facts("selected", ARTEMIS_BOON, ZEUS_BOON);
    const available = deriveNodeView(source, LIGHTNING_ROD, done);
    expect(deriveNodeDetail(source, available, done).needed).toEqual([]);
  });

  it("reads description text through the resolver rather than off the record", () => {
    const source = h1();
    const facts = h1Facts(null);
    const view = deriveNodeView(source, LIGHTNING_ROD, facts);
    const detail = deriveNodeDetail(source, view, facts);
    // Prose now rather than the ref, which is what a card had been drawing.
    // The ref is what the resolver is asked with, so seeing it come back out
    // would mean the bundle stopped answering.
    expect(detail.description).toBe(textFor("hades1", H1[LIGHTNING_ROD]?.descriptionRef ?? ""));
    expect(detail.description).not.toBe(H1[LIGHTNING_ROD]?.descriptionRef);
    expect(detail.description).toMatch(/lightning/i);
  });
});

describe("what a mark would displace", () => {
  /**
   * Two boons of one god's Melee slot. Taking the second replaces the first,
   * which is ordinary play — the cost is that the first may be holding up
   * something the player pinned, and nothing else in the product works that
   * out.
   */
  const ZEUS_MELEE = "ZeusWeaponTrait" as TraitId;
  const ARES_MELEE = "AresWeaponTrait" as TraitId;

  function occupied(...pins: TraitId[]) {
    const facts = makeFacts({
      held: held(ZEUS_MELEE),
      slots: new Map([[H1[ZEUS_MELEE]?.slot ?? "Melee", ZEUS_MELEE]]),
    });
    return { facts, pins: new Set(pins) };
  }

  it("names the boon in the slot", () => {
    const source = h1();
    const { facts } = occupied();
    const view = deriveNodeView(source, ARES_MELEE, facts);

    expect(deriveNodeDetail(source, view, facts).displaces?.trait).toBe(ZEUS_MELEE);
  });

  it("says nothing about a slot nobody is in, or about a boon already held", () => {
    const source = h1();
    const empty = makeFacts();
    const free = deriveNodeView(source, ARES_MELEE, empty);
    expect(deriveNodeDetail(source, free, empty).displaces).toBeNull();

    const { facts } = occupied();
    const itself = deriveNodeView(source, ZEUS_MELEE, facts);
    expect(deriveNodeDetail(source, itself, facts).displaces).toBeNull();
  });

  /**
   * The half worth the derivation. Without pins there is no sentence here the
   * Loadout does not already say.
   */
  it("names the goals whose prerequisite the displaced boon is", () => {
    const source = h1();
    const { facts } = occupied();
    const view = deriveNodeView(source, ARES_MELEE, facts);

    const withoutPins = deriveNodeDetail(source, view, facts);
    expect(withoutPins.displaces?.neededBy).toEqual([]);

    // Lightning Rod's gate asks for a Zeus boon by name.
    const withPins = deriveNodeDetail(source, view, facts, new Set([LIGHTNING_ROD]));
    expect(withPins.displaces?.neededBy).toEqual([source.naming.trait(LIGHTNING_ROD)]);
  });
});

describe("requirement rows", () => {
  it("marks the parts already met and counts the rest", () => {
    const source = h1();
    const facts = h1Facts("selected", ARTEMIS_BOON);
    const view = deriveNodeView(source, LIGHTNING_ROD, facts);
    const { rows, needed } = deriveNodeDetail(source, view, facts);

    expect(rows.length).toBeGreaterThan(needed.length);
    expect(rows.filter((row) => !row.met).map((row) => row.text)).toEqual([...needed]);
    expect(rows.some((row) => row.met)).toBe(true);
  });

  it("claims nothing met for a gate that cannot be met at all", () => {
    const source = h1();
    const facts = h1Facts("notSelected", ARTEMIS_BOON);
    const view = deriveNodeView(source, LIGHTNING_ROD, facts);

    expect(view.state).toBe("Impossible");
    expect(deriveNodeDetail(source, view, facts).rows.every((row) => !row.met)).toBe(true);
  });

  /**
   * The case that made matching by text wrong. An element gate is the one shape
   * whose residual is a *different number* rather than the same node, so the
   * gate and what is left of it never render to the same sentence and a row
   * comparing them found no match and called itself met. 24 Hades II records
   * carry one; this is the smallest of them.
   */
  it("does not call a half-met element gate met", () => {
    const source = createNodeSource("hades2", stubRules(), stubLookups(), H2);
    const gate = "ElementalBaseDamageBoon" as TraitId;
    const facts = makeFacts({ game: "hades2", elements: new Map([["Fire" as const, 1]]) });
    const view = deriveNodeView(source, gate, facts);
    const { rows, needed } = deriveNodeDetail(source, view, facts);

    expect(view.state).toBe("Pending");
    expect(needed).toEqual(["1 more Fire"]);
    // No option list: an element count names no boon to offer, so the row is
    // the sentence alone, which is how both games draw the same gate.
    expect(rows).toEqual([
      { text: "1 more Fire", met: false, god: null, options: [], need: 0 },
    ]);
  });

  /**
   * The shape both games' own requirement panels draw: a god's symbol, then the
   * boons of theirs that would do it. Lightning Rod asks for a Mirror talent and
   * one boon from each of two gods, so one record carries every case.
   */
  it("carries the god and the boons behind a one-god choice", () => {
    const source = h1();
    const facts = h1Facts("selected", ARTEMIS_BOON);
    const view = deriveNodeView(source, LIGHTNING_ROD, facts);
    const { rows } = deriveNodeDetail(source, view, facts);

    const artemis = rows.find((row) => row.god === "Artemis");
    expect(artemis?.need).toBe(1);
    expect(artemis?.options).toHaveLength(6);
    expect(artemis?.options.filter((option) => option.held).map((o) => o.trait)).toEqual([
      ARTEMIS_BOON,
    ]);

    // Held is the run's own answer, not the part's: the row is met and five of
    // its six options still read as boons the player does not have.
    expect(artemis?.met).toBe(true);
    expect(artemis?.options.filter((option) => !option.held)).toHaveLength(5);
  });

  it("leaves a part that names no boon as its sentence alone", () => {
    const source = h1();
    const facts = h1Facts("selected", ARTEMIS_BOON);
    const view = deriveNodeView(source, LIGHTNING_ROD, facts);
    const { rows } = deriveNodeDetail(source, view, facts);

    const talent = rows.find((row) => row.options.length === 0);
    expect(talent?.text).toContain("Mirror talent");
    expect(talent?.god).toBeNull();
    expect(talent?.need).toBe(0);
  });

  it("calls it met once the count is there", () => {
    const source = createNodeSource("hades2", stubRules(), stubLookups(), H2);
    const gate = "ElementalBaseDamageBoon" as TraitId;
    const facts = makeFacts({ game: "hades2", elements: new Map([["Fire" as const, 2]]) });
    const view = deriveNodeView(source, gate, facts);

    expect(deriveNodeDetail(source, view, facts).rows).toEqual([
      { text: "2 more Fire", met: true, god: null, options: [], need: 0 },
    ]);
  });
});

describe("what a node says it would replace", () => {
  const source = createNodeSource("hades2", stubRules(), stubLookups(), H2);
  /** Two Hades II Melee boons: taking the second pushes out the first. */
  const APHRODITE_MELEE = "AphroditeWeaponBoon" as TraitId;
  const ARES_MELEE = "AresWeaponBoon" as TraitId;

  function withMelee(occupant: TraitId | null) {
    return makeFacts({
      game: "hades2",
      held: occupant === null ? held() : held(occupant),
      slots: new Map([["Melee", occupant]]),
    });
  }

  /**
   * On the *view* rather than the detail, which is only sound because it reads
   * `facts.slots` and nothing else — the cache is keyed on the facts object, so
   * a field here that depended on the player's pins would go stale the moment
   * one moved without the facts moving.
   */
  it("names the boon in the slot, from the facts alone", () => {
    const view = deriveNodeView(source, ARES_MELEE, withMelee(APHRODITE_MELEE));
    expect(view.replaces?.trait).toBe(APHRODITE_MELEE);
    expect(view.replaces?.name).toBe(H2[APHRODITE_MELEE]?.name);
  });

  it("says nothing about an empty slot, or about a boon already in it", () => {
    expect(deriveNodeView(source, ARES_MELEE, withMelee(null)).replaces).toBeNull();
    // Re-marking what is already there displaces itself, which is nothing.
    expect(deriveNodeView(source, APHRODITE_MELEE, withMelee(APHRODITE_MELEE)).replaces).toBeNull();
  });

  /** The goals half stays on the detail, where the pins are. */
  it("leaves which goal wanted it to the detail", () => {
    const facts = withMelee(APHRODITE_MELEE);
    const view = deriveNodeView(source, ARES_MELEE, facts);
    const pinned = new Set(["AllCloseBoon" as TraitId]);
    expect(deriveNodeDetail(source, view, facts, pinned).displaces?.neededBy).toEqual([
      H2.AllCloseBoon?.name,
    ]);
  });
});
