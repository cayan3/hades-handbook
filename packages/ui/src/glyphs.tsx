import { markerIconFor } from "@repo/catalog";
import { MarkerArt } from "./boon-art.js";
import { useGame } from "./presentation.js";

/**
 * The two corner glyphs. The dormant ring is drawn and always will be — the
 * games have no such mark — and the pin now prefers the game's own asset with
 * this drawing behind it, the resolver owning the withdrawal path rather than a
 * component's choice. Drawn also means it takes the node's colour and scales
 * with it, which is what the fallback keeps.
 *
 * Neither has alternative text: what they mean is in the node's accessible name
 * already.
 */

/**
 * The pin, top right — a corner free because Obtained gave up its checkmark: a
 * full frame and full-colour art already say a boon is held. Same corner the
 * game puts it in.
 */
export function MarkerGlyph({ filled = true }: { readonly filled?: boolean } = {}) {
  const game = useGame();
  /**
   * The game's asset only where the marker has one thing to say. Hollow is a
   * *second* fact — a Goal Card's pin says whether the goal is finished — and
   * the game draws no unfinished pin, so that form stays this drawing rather
   * than losing the fill channel to an image that cannot express it.
   */
  if (filled && markerIconFor(game) !== null) return <MarkerArt game={game} />;

  return (
    <svg className="node__marker" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {/* Outline against fill is the same channel a requirement row uses, one
          level up: on a Goal Card the pin says whether the whole goal is done,
          and it says it by being hollow before colour is involved at all. On a
          node there is nothing to be half of, so it stays filled. */}
      <path
        d="M8 1.5 9.9 5.9 14.5 6.4 11 9.6 12 14.2 8 11.8 4 14.2 5 9.6 1.5 6.4 6.1 5.9Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The dormant ring, bottom left, since both top corners are spoken for and a
 * boon can be pinned and inert at once. Hollow is the message: you own it and it
 * is not switched on yet. A mark on a state rather than a sixth state, because
 * owning a thing and that thing working are different questions.
 */
export function DormantGlyph() {
  return (
    <svg className="node__dormant" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
