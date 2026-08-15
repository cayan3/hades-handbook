import type { ReactNode } from "react";
import { useHoverDisclosure } from "./hover-disclosure.js";

/**
 * A label that opens a short list of choices beside itself.
 *
 * The **God picker** is the same idea and writes its own markup, because its
 * trigger stands in a row of tabs and its rows carry artwork. This is the plain
 * case: a word, and a few words under it.
 *
 * A disclosure rather than a menu widget, for the reason every one of these has
 * here — a `menu` role promises arrow-key traversal and a roving index, which is
 * a second traversal model on a page whose keyboard story is DOM order.
 */
export interface HoverMenuProps {
  readonly label: string;
  readonly className?: string;
  /**
   * The choices. Each should close the menu when it acts, which is what `onPick`
   * is handed to them for.
   */
  readonly children: (close: () => void) => ReactNode;
}

export function HoverMenu({ label, className = "hovermenu", children }: HoverMenuProps) {
  const { open, opener, wrapper, toggle, close } = useHoverDisclosure();

  return (
    <span className={className} {...wrapper}>
      <button
        type="button"
        ref={opener}
        className={`${className}__open`}
        aria-expanded={open}
        onClick={toggle}
      >
        {label}
      </button>
      {!open ? null : <span className={`${className}__list`}>{children(close)}</span>}
    </span>
  );
}
