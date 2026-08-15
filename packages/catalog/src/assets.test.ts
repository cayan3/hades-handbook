import { describe, expect, it } from "vitest";
import {
  elementIconFor,
  godIconFor,
  iconFor,
  keepsakeNameFor,
  nameFor,
  textFor,
} from "./assets.js";
import { keepsakesFor } from "./keepsakes.js";
import { traitsFor } from "./traits.js";

/**
 * The withdrawal path, which had no test at all until it had three arms.
 *
 * All three exist for one reason: the art and the text this project ships are
 * the most exposed things it redistributes, and every one of them has to be
 * removable in a single edit. That property is only real if nothing goes round
 * the side — so what these assert is less "the resolver returns a string" than
 * "the resolver is the thing that knows", which is why the fallbacks are pinned
 * as carefully as the hits.
 */

describe("iconFor", () => {
  it("returns a set-relative key rather than a path", () => {
    // The set name is this file's to change and the mount point is the
    // component's; splitting it that way is what keeps swapping the whole art
    // set a one-line edit here.
    expect(iconFor("hades1", "AmmoBoltTrait")).toMatch(/^official\//);
  });

  it("keeps the two games' art apart", () => {
    // 16 keys are used by both games, so a flat set would have one of them
    // serving the other's drawing for those. Pinned on a shared key rather than
    // an arbitrary one, since an unshared key passes this whatever the layout.
    expect(iconFor("hades1", "ZeusWeaponTrait")).toMatch(/^official\/hades1\//);
    expect(iconFor("hades2", "AphroditeCastBoon")).toMatch(/^official\/hades2\//);
  });

  it("resolves a record with no icon and an id it has never heard of alike", () => {
    // Two different absences that look identical from here, and neither can be
    // told from a file that fails to load until a browser has tried. They land
    // on the same placeholder because to a player they are the same thing.
    expect(iconFor("hades1", "NoSuchTraitAnywhere")).toBe("official/_missing");
  });
});

describe("godIconFor", () => {
  it("draws every god Hades I has from Hades I's set, in either game", () => {
    // The user's preference, and it survives the framing being fixed: one set
    // for as many gods as it covers, which is 9 of the 14 reaching a Hades II
    // tab. Sound for a god and a defect for a trait, where a shared key is never
    // the same drawing.
    expect(godIconFor("hades1", "Zeus")).toBe("official/hades1/BoonSymbolZeus");
    expect(godIconFor("hades2", "Zeus")).toBe("official/hades1/BoonSymbolZeus");
    for (const god of ["Artemis", "Athena", "Dionysus", "Poseidon"]) {
      expect(godIconFor("hades2", god)).toBe(`official/hades1/BoonSymbol${god}`);
    }
  });

  it("keeps the Hades II file for a god Hades I never had", () => {
    // The four Hades II Olympians with no Hades I counterpart. They match the
    // rest now rather than needing a correction, the extractor having re-framed
    // them on emit.
    for (const god of ["Apollo", "Hephaestus", "Hera", "Hestia"]) {
      expect(godIconFor("hades2", god)).toBe(`official/hades2/BoonSymbol${god}`);
    }
  });

  it("lands on the shared placeholder for a god neither game draws", () => {
    // Same absence as a trait with no icon, and the placeholder is deliberately
    // not per-game: it is ours to draw, not either game's.
    expect(godIconFor("hades2", "NoSuchGod")).toBe("official/_missing");
    // Hades himself, who has a page in Hades II and a symbol in neither set.
    expect(godIconFor("hades2", "Hades")).toBe("official/_missing");
  });
});

describe("elementIconFor", () => {
  it("builds the key from the element, no record naming one", () => {
    // The one resolver whose key comes from neither a record nor a name: a
    // boon's affinity is a field, and the picture for it belongs to the element.
    expect(elementIconFor("hades2", "Fire")).toBe("official/hades2/Element_Fire");
    expect(elementIconFor("hades2", "Aether")).toBe("official/hades2/Element_Aether");
  });

  it("has nothing to answer with in Hades I", () => {
    // Elements are Hades II's, and 0 of 449 Hades I records carry an affinity.
    // The placeholder rather than a Hades II path, which would serve one game's
    // art on the other's page.
    expect(elementIconFor("hades1", "Fire")).toBe("official/_missing");
  });
});

describe("textFor", () => {
  it("is a passthrough today and is still the only way in", () => {
    // The Codex bundle is deliberately not shipped yet -- it is the most
    // exposed text in the project and was held back until something existed to
    // withdraw it. Callers go through this while it is an identity function,
    // because the moment one reads a description off a record instead, the
    // single edit stops being single.
    expect(textFor("SomeDescriptionRef")).toBe("SomeDescriptionRef");
  });
});

describe("nameFor", () => {
  it("gives the game's own name, never a paraphrase", () => {
    expect(nameFor("hades1", "AmmoBoltTrait")).toBe("Lightning Rod");
    expect(nameFor("hades2", "ElementalRallyBoon")).toBe("Self Healing");
  });

  it("falls back to the id where the text bundle has no entry", () => {
    // Roughly a fifth of the records in each game have no name: debug entries,
    // cut content, inheritance templates. An id is stable, plainly not prose and
    // safe to render; a blank label gives a player nothing to search for and
    // nothing to tell us about.
    const nameless = Object.values(traitsFor("hades1")).find((record) => record.name === null);
    expect(nameless).toBeDefined();
    expect(nameFor("hades1", nameless!.id)).toBe(nameless!.id);
    expect(nameFor("hades1", "NoSuchTraitAnywhere")).toBe("NoSuchTraitAnywhere");
  });

  it("reads a keepsake from the keepsake space, which is not the trait space", () => {
    expect(keepsakeNameFor("hades1", "ForcePoseidonBoonTrait")).toBe("Conch Shell");
    expect(keepsakeNameFor("hades2", "ForceZeusBoonKeepsake")).toBe("Cloud Bangle");
  });

  it("would be wrong as a single function, and this is the measurement", () => {
    // Every Hades II keepsake is *also* emitted as a trait record under the
    // same id, so a resolver that searched traits and then keepsakes agrees
    // with itself in that game -- and finds nothing at all in Hades I, where
    // the two spaces share none. The agreement is the trap rather than the
    // evidence, so the id space comes from the caller.
    const h2Traits = traitsFor("hades2");
    expect(Object.keys(keepsakesFor("hades2")).every((id) => id in h2Traits)).toBe(true);

    const h1Traits = traitsFor("hades1");
    expect(Object.keys(keepsakesFor("hades1")).some((id) => id in h1Traits)).toBe(false);
  });
});
