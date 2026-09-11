import type { Element, GodId, KeepsakeId, Rarity, SlotId, TalentId, TraitId, WeaponId } from "@repo/core";
import { type GameKey, dataFor } from "./data.js";
import { hammersFor } from "./hammers.js";
import { keepsakesFor } from "./keepsakes.js";
import type { GodRecord, TraitRecord } from "./schema.js";
import { talentsFor } from "./talents.js";
import { traitsFor } from "./traits.js";
import { weaponFor } from "./weapons.js";

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

  const from = BORROWED_SYMBOLS[game][god];
  return from === undefined ? `${ART_SET}/_missing` : `${ART_SET}/${from}/BoonSymbol${god}`;
}

/**
 * Gods one game grants boons for while naming no symbol for them, and the game
 * whose symbol they borrow.
 *
 * Written out rather than looked up: this asked the *other* game's table for the
 * key, which is a throw now that a game's catalog arrives at its own route. The
 * key is `BoonSymbol` plus the god's name in every case, so the lookup was
 * buying a string it could construct.
 *
 * Three of the four are Hades II's cameo gods, who grant boons without
 * appearing in its loot table and so have no symbol of their own. Measured over
 * every god a run can meet, these four are the whole of it, and a test holds
 * this table against the two it copies from.
 */
const BORROWED_SYMBOLS: Readonly<Record<GameKey, Readonly<Record<string, GameKey>>>> = {
  hades1: { Selene: "hades2" },
  hades2: { Artemis: "hades1", Athena: "hades1", Dionysus: "hades1" },
};

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
 * A weapon's own picture, which is that weapon drawn in its default form — the
 * only picture of a weapon either game keeps. Its own function because a weapon
 * is its own id space, the rule every arm here follows.
 */
export function weaponIconFor(game: GameKey, weapon: WeaponId): string {
  const key = weaponFor(game, weapon)?.icon;
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
 * What a Forget-Me-Not pin says: a goal, and whether its requirements are met.
 *
 * A key rather than a boolean because the game draws the two states as two
 * pictures — `_Complete` turns the knot green and adds a star — instead of
 * recolouring one.
 *
 * The game has a second pair, the bare hand it draws for a thing that merely
 * counts toward a tracked one. Not shipped: a pinned goal names a median of
 * seven boons against a god page's median of fifteen, so marking them would put
 * a pin on half of every page, in hue.
 */
export type MarkerKind = "goal" | "goalMet";

/**
 * The Forget-Me-Not marker, and the second arm allowed to answer with nothing.
 *
 * **The game's own asset is the default and the drawn glyph is the fallback**,
 * which is the reverse of what this marker shipped as: it was drawn precisely so
 * it would survive the shipped art being withdrawn, and the withdrawal path is
 * this function rather than a component's choice. Answering `null` is that path
 * — one edit here and every marker is the glyph again.
 *
 * Hades I has no such resource and never will: Forget-Me-Not is a Hades II
 * thing, so `null` there is the answer rather than a gap waiting on extraction.
 */
export function markerIconFor(game: GameKey, kind: MarkerKind): string | null {
  const key = MARKER_ICONS[game]?.[kind];
  return key === undefined ? null : `${ART_SET}/${game}/${key}`;
}

const MARKER_ICONS: Readonly<Partial<Record<GameKey, Readonly<Record<MarkerKind, string>>>>> = {
  hades2: {
    goal: "Marker_Goal",
    goalMet: "Marker_GoalMet",
  },
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
 * An entry that had at least one of its numbers recovered: the sentence with a
 * `{n}` where each goes, and the row of values to splice in per rarity.
 *
 * `values` is absent where a record recovered no number in its sentence but did
 * recover a stat line, which is the common case rather than the odd one — 160
 * of Hades II's 218 god-page sentences carry no number at all.
 */
interface DescriptionEntry {
  readonly text: string;
  readonly values?: Readonly<Record<string, readonly string[]>>;
  readonly stats?: StatLineEntry;
}

/**
 * A record's stat lines: the games' own labels, and one value each per rarity.
 *
 * Labels do not move with the rarity and are stored once. Values follow the
 * sentence's own shape — a `default` row, plus a row only for a rarity that
 * differs from it.
 */
interface StatLineEntry {
  readonly labels: readonly string[];
  readonly values: Readonly<Record<string, readonly string[]>>;
}

/** One stat line as a caller draws it. */
export interface StatLine {
  readonly label: string;
  readonly value: string;
}

const SLOT = /\{(\d+)\}/g;

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
 *
 * `rarity` is the rarity the run holds this boon at. Without one — a boon on a
 * god page nobody has taken — the sentence reads at the ladder's floor, which
 * is the number the game shows when it first offers the boon. A rarity the
 * record has no row for falls to the same place rather than to the mark: the
 * row is missing because the value does not change there.
 */
export function textFor(game: GameKey, ref: string, rarity?: Rarity): string | null {
  // A hammer's own prose wins: it carries the Rank II values as well, which are
  // not in the record the extraction reads. The ref is the trait id for every
  // record that has one.
  const hammer = hammersFor(game)[ref];
  if (hammer !== undefined) return hammer.description;
  const entry = (dataFor(game).descriptions as Record<string, string | DescriptionEntry>)[ref];
  if (entry === undefined) return null;
  if (typeof entry === "string") return entry;
  const values = rowFor(entry.values, rarity);
  if (values === undefined) return entry.text;
  return entry.text.replace(SLOT, (whole, index: string) => values[Number(index)] ?? whole);
}

/** The row a rarity reads, falling back to the one every other rarity shares. */
function rowFor(
  values: Readonly<Record<string, readonly string[]>> | undefined,
  rarity: Rarity | undefined,
): readonly string[] | undefined {
  if (values === undefined) return undefined;
  return (rarity !== undefined ? values[rarity] : undefined) ?? values.default;
}

/**
 * A record's stat lines at one rarity — the row the games' own Codex draws
 * under the description, and where a god boon's number actually is.
 *
 * The sentence usually has no number in it: 153 of Hades II's 218 god-page
 * descriptions carry none, and not one of the 58 that do moves with the rarity,
 * so without this a player changing a boon's rarity sees nothing change.
 *
 * A line the extraction could not resolve is not here at all rather than
 * carrying the mark a description uses. A label is a field name, so the value is
 * the whole of what the row says and a marked one reads as a row saying nothing.
 *
 * Empty rather than null where there are none, since every caller draws a list.
 */
export function statLinesFor(game: GameKey, ref: string, rarity?: Rarity): readonly StatLine[] {
  const entry = (dataFor(game).descriptions as Record<string, string | DescriptionEntry>)[ref];
  if (entry === undefined || typeof entry === "string" || entry.stats === undefined) return [];
  const values = rowFor(entry.stats.values, rarity);
  if (values === undefined) return [];
  return entry.stats.labels.flatMap((label, index) => {
    const value = values[index];
    return value === undefined ? [] : [{ label, value }];
  });
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
