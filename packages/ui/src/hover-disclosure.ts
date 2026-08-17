import type { FocusEvent, KeyboardEvent, RefObject } from "react";
import { useRef, useState } from "react";

/**
 * A panel that opens under the pointer and is still reachable without one.
 *
 * Shared by the two the header carries — the god picker and the run's own menu —
 * because the rules are fiddly and one of them was wrong the first time. What is
 * shared is the behaviour and not the markup: the two triggers do different
 * things when clicked, so each writes its own.
 */
export interface HoverDisclosure {
  readonly open: boolean;
  /** Put this on the control, so Escape has somewhere to hand the focus back to. */
  readonly opener: RefObject<HTMLButtonElement | null>;
  /**
   * Spread onto the element wrapping the control *and* the panel. The panel
   * being a descendant is what lets the pointer travel from one to the other
   * without the panel going out from under it.
   */
  readonly wrapper: {
    readonly onMouseEnter: () => void;
    readonly onMouseLeave: () => void;
    readonly onFocus: () => void;
    readonly onBlur: (event: FocusEvent<HTMLElement>) => void;
    readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  };
  /**
   * For a trigger whose click opens the panel rather than doing something.
   *
   * A click on a control the pointer is already resting on **opens and stays
   * open**: hovering it opened the panel, so toggling would close what the
   * player just reached for. Without a pointer — a touch screen, a keyboard —
   * it toggles, which is the only way in and the only way out.
   */
  readonly toggle: () => void;
  /** For a control inside the panel, which puts it away after acting. */
  readonly close: () => void;
}

export interface HoverDisclosureOptions {
  /**
   * Whether hovering the control opens it. Off where opening is a decision
   * rather than a look — the Loadout card's rarity menu sits inside a card that
   * is itself under the pointer, so a hover-opened one springs up on the way
   * past. Leaving still closes it either way.
   */
  readonly onHover?: boolean;
}

export function useHoverDisclosure({ onHover = true }: HoverDisclosureOptions = {}): HoverDisclosure {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  /** Whether a pointer is resting on any of this, which decides what a click means. */
  const hovered = useRef(false);
  /**
   * Set by Escape, and it is the whole of why that key works: closing hands the
   * focus back to the control, which is a focus event on the wrapper, which
   * opens it — so the panel came straight back. Invisible to a test that presses
   * Escape with the focus already on the control.
   */
  const dismissed = useRef(false);

  function leave(): void {
    dismissed.current = false;
    hovered.current = false;
    setOpen(false);
  }

  return {
    open,
    opener,
    toggle: () => setOpen(onHover && hovered.current ? true : !open),
    close: () => setOpen(false),
    wrapper: {
      // Focus opens it as hover does, or the panel is a thing only a mouse can
      // reach.
      onMouseEnter: () => {
        dismissed.current = false;
        hovered.current = true;
        if (onHover) setOpen(true);
      },
      onMouseLeave: leave,
      // Focus opens it exactly where hover does, and **only** there. A browser
      // focuses a button on the way into clicking it, so where hover does not
      // open, this one did — and the click behind it toggled straight back, so
      // the first click on any card's menu did nothing. The keyboard still
      // reaches it, that path going through `toggle`.
      onFocus: () => {
        if (onHover && !dismissed.current) setOpen(true);
      },
      onBlur: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) leave();
      },
      onKeyDown: (event) => {
        if (event.key !== "Escape" || !open) return;
        // Focus goes back to the control, or a keyboard user closing the panel
        // is left standing on nothing.
        event.stopPropagation();
        dismissed.current = true;
        setOpen(false);
        opener.current?.focus();
      },
    },
  };
}
