/**
 * The two corner glyphs, drawn rather than fetched. The pin has a game asset it
 * could use and deliberately does not: shipped art sits behind a resolver so it
 * can be withdrawn, and a glyph that must survive that withdrawal is better off
 * never being part of it. Drawn also means they inherit the node's colour and
 * scale with it.
 *
 * Neither has alternative text. What they mean is in the node's accessible name
 * and description already, and announcing "pinned" twice is worse than once.
 */

/**
 * The pin, top right. That corner is free because Obtained gave up its
 * checkmark: a full frame and full-colour art already say a boon is held, so a
 * tick said it twice and spent the one corner a small diamond has. The placement
 * mirrors where the game puts the same idea.
 */
export function MarkerGlyph() {
  return (
    <svg className="node__marker" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path
        d="M8 1.5 9.9 5.9 14.5 6.4 11 9.6 12 14.2 8 11.8 4 14.2 5 9.6 1.5 6.4 6.1 5.9Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * The dormant ring, bottom right. Hollow is the message: the boon is owned — the
 * node keeps its whole Obtained treatment — and what it does is not switched on
 * yet. Ownership and liveness are different questions, so this is a mark on a
 * state rather than a sixth state.
 *
 * Bottom right because the top right is the pin's, and a boon can be both.
 */
export function DormantGlyph() {
  return (
    <svg className="node__dormant" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
