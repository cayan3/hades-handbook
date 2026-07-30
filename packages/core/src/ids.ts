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
 * set of values; only Hades II treats "Duo" as a rarity (Hades I marks its duos
 * by inheritance instead, so no rarity value carries them), & Hades II adds
 * "Elemental" for Infusion boons as well as "Perfect" and "Legacy" (the former
 * is for weapon aspects, the latter doesn't actually have any (found)
 * consumers, in either game, so it stays commented out until one turns up).
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
