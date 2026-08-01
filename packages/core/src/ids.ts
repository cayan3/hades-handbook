/**
 * Identifiers and scalars.
 *
 * IDs are the game's own internal strings (verbatim from extracted data), and
 * should never be invented or localized. User-facing strings like display name,
 * Codex description, etc are separate lookups behind the text resolver, so the
 * shipped text can be easily swapped or withdrawn in just one place.
 */

/** The two (awesome!!) games. */
export type GameId = "hades1" | "hades2";

export type TraitId = string;
export type GodId = string;
export type SetId = string;
export type KeepsakeId = string;
export type AspectId = string;
export type SlotId = string;
/** A set of traits, at most one of which can be held at once. */
export type GroupId = string;
/**
 * A Mirror of Night talent (hades1). This names which talent the run has
 * *selected*, never which ones the save file has unlocked (ownership is out of
 * scope; every talent is assumed unlocked).
 */
export type TalentId = string;
export type ResourceId = string;

/**
 * Hades II only (there are no elements in Hades I
 * ("except the element of surprise!" - Skelly, probably, before jumping you))
 */
export type Element = "Air" | "Water" | "Earth" | "Fire" | "Aether";

/**
 * Rarity is abt display state (never abt drop probability bc this project
 * doesn't model loot tables (thought abt it but seems pretty hard o_0 & also
 * probably not worth the effort tbh)).
 *
 * The values listed are the games' real set of values :O. Only Hades II treats
 * "Duo" as a rarity (Hades I marks its duos by inheritance instead), & Hades II
 * also adds "Elemental", "Perfect", and "Legacy". "Perfect" is for weapon
 * aspects lol, and "Elemental" is what Infusion boons *display* as (not just
 * "what rarity the boon is" since apparently there's an ordinary Common/Rare/Epic
 * assignment under an Infusion boon but the display color & "rarity name" are
 * yk unique to "Infusions" lol; keeping this bc it's what we players actually
 * see lolol even though it won't actually turn up in extracted data). "Legacy"
 * shows up in the data but doesn't actually have any like consumers (we'll list
 * it here but commented out, so it doesn't look like a new discovery to any
 * future patches).
 */
export type Rarity =
  | "Common"
  | "Rare"
  | "Epic"
  | "Heroic"
  | "Legendary"
  | "Duo"
  | "Elemental"
  | "Perfect";
  // | "Legacy"
