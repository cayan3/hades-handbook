import { type TraitRecord, traitsFor } from "@repo/catalog";
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

  it("puts the state in words, with the god and depth a record has", () => {
    // Sweet Surrender is a plain rung on one god's ladder. Lightning Rod is the
    // other case: a talent-gated cross-god boon has neither god nor tier, and
    // every Duo is the same.
    const view = deriveNodeView(h1(), TIER_TWO, makeFacts());
    expect(view.label).toBe("Sweet Surrender — Locked — Aphrodite, tier 2");

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
    expect(detail.description).toBe(H1[LIGHTNING_ROD]?.descriptionRef);
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
});
