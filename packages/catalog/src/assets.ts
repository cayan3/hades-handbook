import type { Element, GodId, KeepsakeId, SlotId, TalentId, TraitId } from "@repo/core";
import { type GameKey, dataFor } from "./data.js";
import { keepsakesFor } from "./keepsakes.js";
import type { GodRecord, TraitRecord } from "./schema.js";
import { talentsFor } from "./talents.js";
import { traitsFor } from "./traits.js";

/**
 * Where art and text come from.
 *
 * Both exist for the same reason: ermmmm copyright laws :no_mouth: :no_mouth:.
 * The shipped art and description texts are the two most "exposed" things this
 * project redistributes, so we'll design resolvers for each in order to
 * withdraw all arts or texts at once (instead of like individually going
 * through and changing every component that ever renders one :sobbing:
 * :sobbing:). These are called by components, which never actually build paths
 * (or inline descriptions) by themselves. If the art and/or text descriptions
 * in this project ever need to like be replaced or something, all that's
 * needed is to make a change here.
 *
 * The symmetry is also purposeful. Original plan was to read text straight off
 * the record lol, which would have left it without any kind of withdrawal or
 * replacement path despite there being one for art.
 */

/** Art set currently displayed. Swapping this swaps every icon in the product. */
const ART_SET = "official";

export function iconFor(game: GameKey, traitId: TraitId): string {
  const record = (dataFor(game).boons as Record<string, TraitRecord>)[traitId];
  const key = record?.icon;
  /**
   * A missing record and a record with no icon will look the same, i.e. there's
   * nothing to point at :no_mouth: :no_mouth:. Resolving to some placeholder
   * path here would actually be worse than returning one bc it gives back a URL
   * without ever knowing if it loaded or not, so this can't actually detect
   * per-file failures. Any recovery needed due to a broken image should be
   * owned by the component that renders it in the first place (i.e. where the
   * error event actually arrives).
   */
  if (key === undefined || key === null) return `${ART_SET}/_missing`;
  /**
   * The game is in the path because 16 keys are used by both games, and a
   * shared key is never the same drawing — Zeus's symbol is 191x302 in Hades I
   * and 509x508 in Hades II. Flat, one game would serve the other's art. The
   * placeholder stays shared; it's ours, not either game's.
   */
  return `${ART_SET}/${game}/${key}`;
}

/**
 * A god's own symbol, withdrawn by the same edit as everything else here.
 *
 * Separate from `iconFor` because a god is keyed by its bare name rather than a
 * trait id — the same reason `nameFor` and `keepsakeNameFor` are two functions.
 *
 * It takes the game even though every god uses one key in both, which makes the
 * parameter look spare. The two sets are drawn at different resolutions and may
 * or may not be the same artwork; nobody has compared them. Keeping it costs a
 * duplicated file if they match, against a signature change on every tab if
 * they don't.
 */
/**
 * **This game's own set first**, the other game's where this one names no symbol,
 * and the shared placeholder where neither does.
 *
 * It preferred Hades I's set for both games for three rounds, on the argument
 * that one authored style beats two. That ended when the user supplied Hades II
 * symbols for all 16 of its gods, Hades and Selene included — there is no longer
 * a gap to paper over, and a god's own game drawing its own god is the rule that
 * needs no exceptions.
 */
export function godIconFor(game: GameKey, god: GodId): string {
  const own = godIconKey(game, god);
  if (own !== null) return `${ART_SET}/${game}/${own}`;

  const other = game === "hades1" ? "hades2" : "hades1";
  const borrowed = godIconKey(other, god);
  return borrowed === null ? `${ART_SET}/_missing` : `${ART_SET}/${other}/${borrowed}`;
}

/**
 * Gods this product ships a symbol for that the games' own tables name none for.
 * Hades is on a tab in both games and in neither table; Selene grants the Hexes
 * without being a boon god. Their art is the user's rather than extracted, which
 * is why nothing in the catalog knows about it.
 */
const EXTRA_SYMBOLS: Readonly<Record<GameKey, readonly string[]>> = {
  hades1: ["Hades"],
  hades2: ["Hades", "Selene"],
};

function godIconKey(game: GameKey, god: GodId): string | null {
  const key = (dataFor(game).gods as Record<string, GodRecord>)[god]?.iconKey;
  if (key !== undefined && key !== null && key !== "") return key;
  return EXTRA_SYMBOLS[game].includes(god) ? `BoonSymbol${god}` : null;
}

/**
 * A Mirror talent's own symbol. Its own function because a talent is its own id
 * space, which is the rule every arm here follows.
 */
export function talentIconFor(game: GameKey, talent: TalentId): string {
  const key = talentsFor(game)[talent]?.icon;
  if (key === undefined || key === null) return `${ART_SET}/_missing`;
  return `${ART_SET}/${game}/${key}`;
}

/**
 * An element's own symbol, withdrawn by the same edit as the rest. A third
 * function rather than a case in `iconFor` because no record names one — the key
 * is built from the element, the way a god's is built from its name.
 */
export function elementIconFor(game: GameKey, element: Element): string {
  if (game !== "hades2") return `${ART_SET}/_missing`;
  return `${ART_SET}/${game}/Element_${element}`;
}

/**
 * A part of the games' own interface, rather than a picture of a thing in them.
 * Two entries; the boon card's frame is the next.
 */
export type ChromePart = "panel" | "saveslot";

/**
 * Panel art, and the first arm here allowed to answer with nothing. Everything
 * above falls back to the placeholder, an unresolved icon leaving a hole where a
 * picture belongs; the panel is built to work with no art, so a placeholder
 * frame around a working one would be worse than the plain frame it draws.
 *
 * The part names the file rather than the sprite: Hades II's panel is one sprite
 * and Hades I's is three the game composites, so provenance would be true for
 * one game and a fiction for the other.
 */
export function chromeFor(game: GameKey, part: ChromePart): string | null {
  const key = CHROME[game][part];
  return key === undefined ? null : `${ART_SET}/${game}/${key}`;
}

const CHROME: Readonly<Record<GameKey, Partial<Record<ChromePart, string>>>> = {
  hades1: { panel: "Chrome_Panel", saveslot: "Chrome_SaveSlot" },
  hades2: { panel: "Chrome_Panel", saveslot: "Chrome_SaveSlot" },
};

/**
 * The Forget-Me-Not marker, and the second arm allowed to answer with nothing.
 *
 * **The game's own asset is the default and the drawn glyph is the fallback**,
 * which is the reverse of what this marker shipped as: it was drawn precisely so
 * it would survive the shipped art being withdrawn, and the withdrawal path is
 * this function rather than a component's choice. Answering `null` is that path
 * — one edit here and every marker is the glyph again.
 *
 * **Null today, because the art is not extracted.** The marker's own consumer —
 * a card that says whether a goal is finished — is newer than the extraction
 * pass that skipped it, and a key naming a file that is not there resolves to
 * the missing-art placeholder rather than to nothing. So this stays honest until
 * `ForgetMeNot`/`TrackedRecipes` land, and the component draws its glyph.
 *
 * Hades I has no such resource and never will: Forget-Me-Not is a Hades II
 * thing, so the game is a parameter with one answer today and a real one later.
 */
export function markerIconFor(game: GameKey): string | null {
  const key = MARKER_ICONS[game];
  return key === undefined ? null : `${ART_SET}/${game}/${key}`;
}

const MARKER_ICONS: Readonly<Partial<Record<GameKey, string>>> = {
  hades2: "Marker_ForgetMeNot",
};

/**
 * The glyph the game draws in a core slot nobody has filled. Null where the game
 * draws none — 5 of 6 core slots in Hades II, the Hex having none, against 5 of
 * 5 in Hades I — since a placeholder in a slot the run really has reads as a
 * broken file rather than as an open position.
 *
 * The mapping is out of the games' HUD tables, not guessed from the names: Hades
 * II files its Magick slot under `SlotIcon_Wrath`, the first game's Call.
 */
export function slotIconFor(game: GameKey, slot: SlotId): string | null {
  const key = SLOT_ICONS[game][slot];
  return key === undefined ? null : `${ART_SET}/${game}/${key}`;
}

const SLOT_ICONS: Readonly<Record<GameKey, Readonly<Record<string, string>>>> = {
  hades1: {
    Melee: "SlotIcon_Attack",
    Secondary: "SlotIcon_Secondary",
    Ranged: "SlotIcon_Ranged",
    Rush: "SlotIcon_Dash",
    Shout: "SlotIcon_Wrath",
  },
  hades2: {
    Melee: "SlotIcon_Attack",
    Secondary: "SlotIcon_Secondary",
    Ranged: "SlotIcon_Ranged",
    Rush: "SlotIcon_Dash",
    Mana: "SlotIcon_Wrath",
  },
};

/**
 * Codex text for a description key.
 *
 * The bundle it was waiting for ships now, and returning `ref` again is what a
 * withdrawal is: one function body, no call site moved, which is the whole
 * reason this was written as a passthrough rather than left out.
 *
 * It takes the game, which the passthrough did not need. Five refs are named by
 * a record in both games and all five carry different prose — the two
 * Temporary* families read as Hades I passives and Hades II blessings — so a
 * flat bundle would hand one game the other's sentence.
 */
export function textFor(game: GameKey, ref: string): string | null {
  const bundle = dataFor(game).descriptions as Record<string, string>;
  return bundle[ref] ?? null;
}

/**
 * Display names, resolved here so they can be withdrawn the way art and Codex
 * text can: one edit, rather than a sweep through everything that draws a name.
 *
 * The name is always the game's own, because a name we invented is one nobody
 * can search for. Where the bundle has no entry — roughly a fifth of each game,
 * being debug entries, cut content and inheritance templates — the id comes
 * back, which is at least something a player can quote at us.
 *
 * Two functions rather than one: a single resolver searching both spaces works
 * in Hades II and fails silently in Hades I, since all 35 Hades II keepsakes
 * are also trait records under the same id while Hades I's two spaces share
 * none. The agreement is the trap, not the evidence, so the id space comes from
 * the caller.
 */
export function nameFor(game: GameKey, traitId: TraitId): string {
  return orId(traitsFor(game)[traitId]?.name, traitId);
}

export function keepsakeNameFor(game: GameKey, keepsake: KeepsakeId): string {
  return orId(keepsakesFor(game)[keepsake]?.name, keepsake);
}

/** A Mirror talent's name — a third id space, so a third function. */
export function talentNameFor(game: GameKey, talent: TalentId): string {
  return orId(talentsFor(game)[talent]?.name, talent);
}

function orId(name: string | null | undefined, id: string): string {
  return name == null || name === "" ? id : name;
}
