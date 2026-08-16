import { type KeyboardEvent, type RefObject, useEffect, useRef } from "react";

/**
 * The rules a modal owes a keyboard, in one place.
 *
 * Focus moves in when it opens, cannot leave while it is open, and goes back to
 * whatever opened it on the way out; Escape dismisses it. A keyboard user who
 * reaches a control, opens a panel over it and then falls out behind that panel
 * has been handed a trap rather than a path, which is the opposite of what the
 * linear surfaces promise.
 *
 * Shared rather than copied for the reason the hover disclosure is: one of these
 * rules was wrong the first time it was written, and a second hand-written copy
 * is a second chance to get it wrong. What is shared is the behaviour; each
 * dialog writes its own markup.
 */
export interface Dialog {
  /** Put this on the dialog element. Everything below reads its contents. */
  readonly ref: RefObject<HTMLDivElement | null>;
  /** Spread onto the element wrapping the dialog, shade included. */
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}

/**
 * Deliberately narrow: everything a dialog here renders, and nothing that relies
 * on guessing whether an element happens to be reachable.
 */
const FOCUSABLE = "button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

export function useDialog(onClose: () => void): Dialog {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Captured before focus moves and restored on the way out. Without it,
    // closing lands a keyboard user at the top of the document, having lost the
    // control they opened this from.
    const opener = document.activeElement;
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  /**
   * On the document rather than on the dialog, which is the difference between a
   * way out that always exists and one that nearly does. A handler on the dialog
   * only hears keys pressed while focus is inside it — nearly always, since the
   * trap sees to that, and the exceptions are the moments it matters. A tap on
   * the shade, or a window that lost focus and came back to the body: focus is
   * outside, the keydown never arrives, and the one key everybody tries does
   * nothing. Found by pressing it.
   */
  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);

  return {
    ref,
    onKeyDown: (event) => {
      if (event.key !== "Tab") return;

      const stops = [...(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (first === undefined || last === undefined) return;

      // Only the two ends need handling; between them the browser's own tab
      // order is already right.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
  };
}
