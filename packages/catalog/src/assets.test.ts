import { describe, expect, it } from "vitest";
import { iconFor, keepsakeNameFor, nameFor, textFor } from "./assets.js";
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

  it("resolves a record with no icon and an id it has never heard of alike", () => {
    // Two different absences that look identical from here, and neither can be
    // told from a file that fails to load until a browser has tried. They land
    // on the same placeholder because to a player they are the same thing.
    expect(iconFor("hades1", "NoSuchTraitAnywhere")).toBe("official/_missing");
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
