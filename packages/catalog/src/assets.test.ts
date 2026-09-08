import type { Rarity } from "@repo/core";
import { describe, expect, it } from "vitest";
import {
  type ChromePart,
  chromeFor,
  elementIconFor,
  godIconFor,
  iconFor,
  keepsakeNameFor,
  markerIconFor,
  nameFor,
  slotIconFor,
  talentIconFor,
  talentNameFor,
  textFor,
} from "./assets.js";
import { type GameKey, dataFor } from "./data.js";
import { keepsakesFor } from "./keepsakes.js";
import { talentsFor } from "./talents.js";
import { traitsFor } from "./traits.js";

/** Every rarity a run can hold, so a check over "the text" reaches every row. */
const RARITIES: readonly Rarity[] = [
  "Common",
  "Rare",
  "Epic",
  "Heroic",
  "Legendary",
  "Duo",
  "Elemental",
  "Perfect",
];

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
  it("draws each game's gods from that game's own set", () => {
    // Hades I's set was preferred in both games for three rounds, to buy one
    // authored style where Hades II had gaps. The user's own Hades II symbols
    // cover all 16 of its gods, so the gap is gone and so is the exception.
    expect(godIconFor("hades1", "Zeus")).toBe("official/hades1/BoonSymbolZeus");
    expect(godIconFor("hades2", "Zeus")).toBe("official/hades2/BoonSymbolZeus");
    for (const god of ["Apollo", "Hephaestus", "Hera", "Hestia", "Poseidon", "Hermes"]) {
      expect(godIconFor("hades2", god)).toBe(`official/hades2/BoonSymbol${god}`);
    }
  });

  it("draws the gods whose symbol neither game's tables name", () => {
    // Hades is on a tab in both games and in neither table; Selene grants the
    // Hexes without being a boon god. Their art is the user's rather than
    // extracted, so nothing in the catalog knows it exists and the resolver has
    // to. Each game gets its own cut here — no glow in Hades I.
    expect(godIconFor("hades1", "Hades")).toBe("official/hades1/BoonSymbolHades");
    expect(godIconFor("hades2", "Hades")).toBe("official/hades2/BoonSymbolHades");
    expect(godIconFor("hades2", "Selene")).toBe("official/hades2/BoonSymbolSelene");
  });

  it("borrows the other game's file where this one names no symbol", () => {
    // The arm that keeps a god drawn rather than placeheld when one game's
    // tables are short. Selene is Hades II's and Hades I never had her; the
    // other three are Hades II's cameo gods, who grant boons there without
    // appearing in its loot table and so have no symbol of their own.
    expect(godIconFor("hades1", "Selene")).toBe("official/hades2/BoonSymbolSelene");
    for (const god of ["Artemis", "Athena", "Dionysus"]) {
      expect(godIconFor("hades2", god)).toBe(`official/hades1/BoonSymbol${god}`);
    }
  });

  /**
   * The borrow list is written out because asking the other game's table for
   * the key is a cross-game data read, and a game's catalog now arrives at its
   * own route — so that read is a throw on a page drawing the other game.
   *
   * Which makes the list a copy of something the tables know, and this is what
   * holds the two together: every god either game names a symbol for is absent
   * from it, and every god that reaches a page and has no symbol of its own is
   * in it. A patch either way fails here rather than shipping a placeholder.
   */
  it("borrows exactly the gods whose own game names no symbol", () => {
    // Every god a page can reach: the loot table's own, plus every god a trait
    // record answers to — which is wider, because three Hades II gods grant
    // boons without appearing in its table at all.
    const reachable = (game: GameKey): readonly string[] => {
      const gods = new Set<string>(
        Object.keys(dataFor(game).gods as Record<string, unknown>).filter(
          (name) => !name.startsWith("__mechanic_"),
        ),
      );
      for (const record of Object.values(traitsFor(game))) {
        if (record.god !== null) gods.add(record.god);
        for (const god of record.duoGods ?? []) gods.add(god);
      }
      return [...gods].sort();
    };

    const borrowed = (game: GameKey): readonly string[] =>
      reachable(game).filter((god) => !godIconFor(game, god).includes(`/${game}/`));

    expect(borrowed("hades1")).toEqual([]);
    expect(borrowed("hades2")).toEqual(["Artemis", "Athena", "Dionysus"]);
    // And nothing a page can reach falls through to the placeholder.
    for (const game of ["hades1", "hades2"] as const) {
      for (const god of reachable(game)) {
        expect(godIconFor(game, god), `${game}/${god}`).not.toBe("official/_missing");
      }
    }
  });

  it("lands on the shared placeholder for a god neither game draws", () => {
    // The placeholder is deliberately not per-game: it is ours to draw, not
    // either game's.
    expect(godIconFor("hades2", "NoSuchGod")).toBe("official/_missing");
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

describe("chromeFor", () => {
  it("keys the file on the part, not on the sprite it came from", () => {
    // Hades II's panel is one sprite and Hades I's is three the game composites
    // itself, so a name carrying provenance would be true for one game only.
    expect(chromeFor("hades1", "panel")).toBe("official/hades1/Chrome_Panel");
    expect(chromeFor("hades2", "panel")).toBe("official/hades2/Chrome_Panel");
  });

  it("answers with nothing rather than the placeholder", () => {
    // The one behaviour that separates this arm from the three above it. The
    // panel is built to work with no art at all, so an absence has to be
    // distinguishable from a hole -- a placeholder frame around a working panel
    // is worse than the plain one it already draws.
    expect(chromeFor("hades1" as GameKey, "nosuchpart" as ChromePart)).toBeNull();
  });
});

describe("slotIconFor", () => {
  it("takes the game's own mapping, which does not follow the names", () => {
    // Read out of the games' HUD tables rather than inferred: Hades II files its
    // Magick slot under the first game's Call.
    expect(slotIconFor("hades1", "Shout")).toBe("official/hades1/SlotIcon_Wrath");
    expect(slotIconFor("hades2", "Mana")).toBe("official/hades2/SlotIcon_Wrath");
    expect(slotIconFor("hades1", "Rush")).toBe("official/hades1/SlotIcon_Dash");
  });

  it("covers every core slot the games draw one for, and says so where they do not", () => {
    // 5 of 5 in Hades I and 5 of 6 in Hades II -- the Hex has no glyph in the
    // game's own tray, and a placeholder in a slot the run really has would read
    // as a broken file rather than as an empty position.
    for (const slot of ["Melee", "Secondary", "Ranged", "Rush", "Shout"]) {
      expect(slotIconFor("hades1", slot)).toMatch(/^official\/hades1\/SlotIcon_/);
    }
    for (const slot of ["Melee", "Secondary", "Ranged", "Rush", "Mana"]) {
      expect(slotIconFor("hades2", slot)).toMatch(/^official\/hades2\/SlotIcon_/);
    }
    expect(slotIconFor("hades2", "Spell")).toBeNull();
    // Not a core slot in either game: the Companion and the equipped kit.
    expect(slotIconFor("hades2", "Assist")).toBeNull();
    expect(slotIconFor("hades1", "Keepsake")).toBeNull();
  });
});

describe("textFor", () => {
  it("gives the game's own sentence rather than the key", () => {
    expect(textFor("hades2", "AphroditeWeaponBoon")).toBe(
      "Your Attacks deal more damage to nearby foes.",
    );
    expect(textFor("hades1", "AphroditeWeaponTrait")).toBe(
      "Your Attack deals more damage and inflicts Weak.",
    );
  });

  it("answers nothing for a ref the bundle has no prose for", () => {
    // Two refs in Hades I and thirty-three in Hades II name an entry with no
    // description at all. Returning the id was the defect this closes, so the
    // absence has to be an absence.
    expect(textFor("hades1", "HadesShoutTrait")).toBeNull();
    expect(textFor("hades2", "NotARealRef")).toBeNull();
  });

  it("answers per game, because five refs mean different things in each", () => {
    // Both games have a record naming `TemporaryBoonRarityTrait`, and the two
    // sentences are not the same sentence. A flat bundle would hand one game
    // the other's prose with nothing to notice it.
    const h1 = textFor("hades1", "TemporaryBoonRarityTrait");
    const h2 = textFor("hades2", "TemporaryBoonRarityTrait");
    expect(h1).not.toBeNull();
    expect(h2).not.toBeNull();
    expect(h1).not.toBe(h2);
  });

  it("carries no markup through to a caller, at every rarity", () => {
    // The games write descriptions as display markup and this renders text, so
    // a surviving brace is a construction the extractor did not resolve. Read
    // through `textFor` rather than off the bundle: half the entries are a
    // template plus its values now, and a regex run over one of those matches
    // nothing and passes for the wrong reason. Every rarity rather than the
    // default row, because one format answers a word and a word arrives as the
    // game's own markup — so a row is somewhere markup can reach a card.
    for (const game of ["hades1", "hades2"] as const) {
      const bundle = dataFor(game).descriptions as Record<string, unknown>;
      const withMarkup = Object.keys(bundle).filter((ref) =>
        [undefined, ...RARITIES].some((rarity) => /[{}]/.test(textFor(game, ref, rarity) ?? "")),
      );
      expect(withMarkup).toEqual([]);
    }
  });

  it("keeps the brace where a row has no value for the slot", () => {
    // Nothing shipped is short of a value — the extractor refuses to emit one
    // — so this is about which way it fails if that ever stops being true. A
    // stray `{1}` reads as a defect; the word "undefined" reads as a number
    // that happens to be missing.
    const entry = { text: "Gain +{0} Armor for {1} Sec.", values: { default: ["30"] } };
    const bundle = dataFor("hades2").descriptions as Record<string, unknown>;
    const ref = "__short_row__";
    bundle[ref] = entry;
    try {
      expect(textFor("hades2", ref)).toBe("Gain +30 Armor for {1} Sec.");
    } finally {
      delete bundle[ref];
    }
  });

  it("says the number for the rarity the run holds", () => {
    // The Hades II costume grants a flat 30 Armor at every rarity and scales
    // only the channel speed, which is the pairing that makes reading the
    // ladder onto both look right and be wrong.
    expect(textFor("hades2", "AgilityCostume", "Common")).toBe(
      "Don a +30 Armor Outfit that makes you Channel 40% faster.",
    );
    expect(textFor("hades2", "AgilityCostume", "Heroic")).toBe(
      "Don a +30 Armor Outfit that makes you Channel 60% faster.",
    );
  });

  it("reads an unheld boon at the ladder's floor", () => {
    // A boon on a god page has no rarity, and the floor is the number the game
    // shows when it first offers one.
    expect(textFor("hades2", "AgilityCostume")).toBe(
      textFor("hades2", "AgilityCostume", "Common"),
    );
  });

  it("falls to the floor for a rarity the entry has no row of its own for", () => {
    // A row is absent because the value does not move there, so falling back is
    // the answer rather than a gap — and `Duo` is a rarity this record never has.
    expect(textFor("hades2", "AgilityCostume", "Duo")).toBe(
      textFor("hades2", "AgilityCostume", "Common"),
    );
  });

  it("still keeps the mark where the number could not be recovered", () => {
    // Sixty-one Hades II sentences and nine Hades I ones name a value that
    // needs the run, and a mark reading in all three positions is why it is a
    // question mark rather than a dash.
    const marked = Object.keys(dataFor("hades2").descriptions as Record<string, unknown>).filter(
      (ref) => (textFor("hades2", ref) ?? "").includes("?"),
    );
    expect(marked.length).toBeGreaterThan(0);
  });

  it("leaves a sentence with no numbers in it alone at every rarity", () => {
    const plain = "Your Attacks deal more damage to nearby foes.";
    expect(textFor("hades2", "AphroditeWeaponBoon")).toBe(plain);
    expect(textFor("hades2", "AphroditeWeaponBoon", "Heroic")).toBe(plain);
  });

  it("lets a hammer's own prose win over the extracted sentence", () => {
    // A hammer's table carries the Rank II values as well, which are not in the
    // record the extraction reads.
    expect(textFor("hades1", "BowChainShotTrait")).toBe(
      "Your Attack hits up to 3 foes, dealing +15% base damage for each.",
    );
  });
});

describe("talentNameFor", () => {
  it("names both sides of every Mirror row", () => {
    // The gap this closes was a gate rendering "the AmmoMetaUpgrade Mirror
    // talent" on a Goal Card. Both sides, because the B-side names are the ones
    // the text bundle annotates with a trailing comment and the parser dropped.
    expect(talentNameFor("hades1", "AmmoMetaUpgrade")).toBe("Infernal Soul");
    expect(talentNameFor("hades1", "ReloadAmmoMetaUpgrade")).toBe("Stygian Soul");
    expect(talentNameFor("hades1", "FirstStrikeMetaUpgrade")).toBe("Fiery Presence");
    for (const talent of Object.keys(talentsFor("hades1"))) {
      expect(talentNameFor("hades1", talent)).not.toBe(talent);
    }
  });

  it("falls back to the id, like every other name resolver", () => {
    expect(talentNameFor("hades2", "AmmoMetaUpgrade")).toBe("AmmoMetaUpgrade");
  });
});

describe("talentIconFor", () => {
  it("resolves under the game like everything else here", () => {
    expect(talentIconFor("hades1", "AmmoMetaUpgrade")).toBe(
      "official/hades1/MirrorIcon_AmmoSupply",
    );
  });

  it("lands on the placeholder where there is no talent", () => {
    // The ordinary rule rather than chrome's: nothing here is designed to work
    // without a picture, so an absence is a hole.
    expect(talentIconFor("hades2", "AmmoMetaUpgrade")).toBe("official/_missing");
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

/**
 * The Forget-Me-Not marker, and the arm that is allowed to answer nothing.
 *
 * The pin was drawn precisely so it would survive the shipped art being
 * withdrawn; the withdrawal path is this function now rather than a component's
 * choice, so what it answers is the whole of the decision.
 */
describe("markerIconFor", () => {
  it("gives met and unmet two pictures rather than one recoloured", () => {
    // The game's own model: `_Complete` is a second sprite that turns the knot
    // green and adds a star, so a caller asks for a state and never for a tint.
    expect(markerIconFor("hades2", "goal")).toBe("official/hades2/Marker_Goal");
    expect(markerIconFor("hades2", "goalMet")).toBe("official/hades2/Marker_GoalMet");
    expect(markerIconFor("hades2", "goal")).not.toBe(markerIconFor("hades2", "goalMet"));
  });

  it("answers nothing in the game with no Forget-Me-Not", () => {
    // Null rather than the missing-art placeholder, which is the rule the panel
    // chrome and the empty slots follow: a broken-file mark in a card's corner
    // says the opposite of what a pin means. Hades I has no such resource, so
    // the drawn glyph is not a fallback there -- it is the answer.
    for (const kind of ["goal", "goalMet"] as const) {
      expect(markerIconFor("hades1", kind)).toBeNull();
    }
  });
});
