import type { Element, GodId, KeepsakeId, TraitId } from "@repo/core";
import { type GameKey, dataFor } from "./data.js";
import { keepsakesFor } from "./keepsakes.js";
import type { GodRecord, TraitRecord } from "./schema.js";
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
export function godIconFor(game: GameKey, god: GodId): string {
  const own = godIconKey(game, god);
  if (own !== null) return `${ART_SET}/${game}/${own}`;

  /**
   * Hades II attributes boons to three gods it draws no symbol for — Artemis,
   * Athena and Dionysus — so their tabs would carry the placeholder. Borrowing
   * is sound for a god where it would not be for a trait: a shared trait key is
   * never the same drawing, and a god's symbol is that god. Hades has none in
   * either set, so he still falls through.
   */
  const other: GameKey = game === "hades1" ? "hades2" : "hades1";
  const borrowed = godIconKey(other, god);
  return borrowed === null ? `${ART_SET}/_missing` : `${ART_SET}/${other}/${borrowed}`;
}

function godIconKey(game: GameKey, god: GodId): string | null {
  const key = (dataFor(game).gods as Record<string, GodRecord>)[god]?.iconKey;
  return key === undefined || key === null || key === "" ? null : key;
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
 * Codex text for a description key.
 *
 * Bundle isn't actually shipped yet (descriptions are official/used in-game,
 * so were held back until this fn existed to give it a way out (one could even
 * say that without this fn, "there is no escape" haha get it :smile: :smile?).
 * Right now, this resolves against nothing and just returns the key itself
 * (which is stable, clearly not actual prose lol, and yk safe to render yay).
 *
 * Callers must go through this even while it's a passthrough. If a component
 * just reads a description off a record instead, the single edit that would
 * withdraw the text stops actually being "single" (:pensive: :pensive:).
 */
export function textFor(ref: string): string {
  return ref;
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

function orId(name: string | null | undefined, id: string): string {
  return name == null || name === "" ? id : name;
}
