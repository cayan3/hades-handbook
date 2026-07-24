/**
 * Identifiers and scalars.
 *
 * IDs are the game's own internal strings (verbatim from extracted data), and
 * should never be invented or localized. User-facing strings like display name,
 * Codex description, etc are separate lookups behind the text resolver, so the
 * shipped text can be easily swapped or withdrawn in just one place.
 */

/** The two (awesome) games. */
export type GameId = "hades1" | "hades2";

export type TraitId = string;
export type GodId = string;
export type SetId = string;
export type KeepsakeId = string;
export type AspectId = string;
export type SlotId = string;
/** A set of traits, at most one of which can be held at once. */
export type GroupId = string;
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
 * The values listed are the games' real
 * set of values; both treat "Duo" as a rarity, & Hades II adds "Elemental" for
 * Infusion boons as well as Perfect & Legacy (both of which appear in the game
 * data w/ no (found) consumers).
 */
export type Rarity =
  | "Common"
  | "Rare"
  | "Epic"
  | "Heroic"
  | "Legendary"
  | "Duo"
  | "Elemental"
  | "Perfect"
  | "Legacy";
