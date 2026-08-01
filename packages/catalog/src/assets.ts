import type { TraitId } from "@repo/core";
import { type GameKey, dataFor } from "./data.js";
import type { TraitRecord } from "./schema.js";

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
  return `${ART_SET}/${key}`;
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
