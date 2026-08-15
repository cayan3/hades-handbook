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
  /** For a trigger whose click toggles the panel rather than doing something. */
  readonly toggle: () => void;
  /** For a control inside the panel, which puts it away after acting. */
  readonly close: () => void;
}

export function useHoverDisclosure(): HoverDisclosure {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);
  /**
   * Set by Escape, and it is the whole of why that key works: closing hands the
   * focus back to the control, which is a focus event on the wrapper, which
   * opens it — so the panel came straight back. Invisible to a test that presses
   * Escape with the focus already on the control.
   */
  const dismissed = useRef(false);

  function leave(): void {
    dismissed.current = false;
    setOpen(false);
  }

  return {
    open,
    opener,
    toggle: () => setOpen(!open),
    close: () => setOpen(false),
    wrapper: {
      // Focus opens it as hover does, or the panel is a thing only a mouse can
      // reach.
      onMouseEnter: () => {
        dismissed.current = false;
        setOpen(true);
      },
      onMouseLeave: leave,
      onFocus: () => {
        if (!dismissed.current) setOpen(true);
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
