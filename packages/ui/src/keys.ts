/**
 * The keyboard command set, as one vocabulary rather than a binding per surface.
 *
 * It exists because the goal gesture is a `contextmenu` — a right-click or a
 * long press — which no keyboard reliably raises, so until now nothing in the
 * app could create a pin without a pointer. That is the one function this has to
 * restore; the traversal below is what makes it usable once it exists.
 *
 * Nothing here sets a tab index and nothing here needs to. Every node, tile and
 * card control is already a `button`, so moving between them is a `focus()` call
 * and the browser's own tab order is untouched: Tab still walks everything in
 * document order and the arrows are a shortcut across the structure.
 */

/** What the panels and the shortcut list print. One key, no modifier. */
export const GOAL_KEY = "g";
export const HELP_KEY = "?";

/**
 * A step through a surface's structure, never through its pixels.
 *
 * The god page has no coordinate model — its bands are flow layout and the node
 * positions are read back off the browser after the fact — so there is no grid
 * for a 2-D walk to consult. Up and down are a band, left and right a sibling,
 * which is what the graph already is.
 */
export type Step = "up" | "down" | "left" | "right" | "first" | "last";

const ARROWS: Readonly<Record<string, Step>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Home: "first",
  End: "last",
};

/**
 * Which step a key press asks for, or null for every other key.
 *
 * A modifier means the press belongs to somebody else: Alt-Left is the browser's
 * history, Command-Left is the start of a line, and taking either would be this
 * page overriding the platform.
 */
export function stepFor(event: KeyEvent): Step | null {
  if (hasModifier(event)) return null;
  return ARROWS[event.key] ?? null;
}

/** Set or clear a goal on whatever has focus. */
export function isGoalKey(event: KeyEvent): boolean {
  return !hasModifier(event) && event.key.toLowerCase() === GOAL_KEY && !isTyping(event.target);
}

/** Open the shortcut list. Shift is how `?` is typed, so it cannot disqualify it. */
export function isHelpKey(event: KeyEvent): boolean {
  return (
    !event.ctrlKey && !event.metaKey && !event.altKey && event.key === HELP_KEY && !isTyping(event.target)
  );
}

/**
 * Whether the press landed in something the player is typing into, which is the
 * guard every unmodified letter needs: a search box is coming with the quick-add,
 * and a `g` swallowed there would be a search that cannot spell "gain".
 */
export function isTyping(target: unknown): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * The events this module reads, which is the shape React's and the document's
 * own both satisfy. Written out rather than taking React's type, because the
 * global bindings listen on the document and never see a synthetic event.
 */
export interface KeyEvent {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly target: unknown;
}

function hasModifier(event: KeyEvent): boolean {
  return event.ctrlKey || event.metaKey || event.altKey;
}

/**
 * Move focus to one member of a surface, named by the `data-` attribute the
 * surface stamps on its cells.
 *
 * The control rather than the cell: a cell is a list item and focusing one puts
 * a keyboard user on something with nothing to press. Answers whether it found
 * anything, so a caller can leave the press alone when it did not.
 */
export function focusMember(
  root: HTMLElement | null,
  attribute: string,
  id: string,
): boolean {
  const cell = root?.querySelector<HTMLElement>(`[${attribute}="${cssValue(id)}"]`);
  const control = cell?.querySelector<HTMLElement>("button, [tabindex]") ?? cell;
  if (control == null) return false;
  control.focus();
  return true;
}

/**
 * Trait ids are Lua identifiers, so nothing here needs escaping today — but this
 * takes a slot name and a god name too, and a god with an apostrophe would end
 * the attribute selector early and throw.
 */
function cssValue(id: string): string {
  return id.replace(/["\\]/g, "\\$&");
}

/** Step through a list, clamped at both ends. Wrapping reads as teleporting. */
export function stepIndex(from: number, step: Step, length: number): number {
  switch (step) {
    case "left":
    case "up":
      return Math.max(0, from - 1);
    case "right":
    case "down":
      return Math.min(length - 1, from + 1);
    case "first":
      return 0;
    case "last":
      return length - 1;
  }
}
