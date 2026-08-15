import type { GodId } from "@repo/core";
import { type CSSProperties, type KeyboardEvent, useRef, useState } from "react";
import { GodArt } from "./boon-art.js";
import { godColour } from "./god-palette.js";
import { useGame } from "./presentation.js";

/**
 * The gods not on the bar, reached without a dialog.
 *
 * A disclosure rather than a menu widget: a `menu` role promises arrow-key
 * traversal and a roving index, which is a second traversal model on a page
 * whose keyboard story is DOM order and nothing overriding it.
 *
 * Every entry is named as well as drawn. Icon-only was the request and the data
 * refuses it: 1 of the 10 Hades I gods reaching a tab and 4 of the 14 Hades II
 * ones have no symbol in the shipped set.
 */
export interface GodPickerProps {
  /** The gods this bar is not already showing, in the order to offer them. */
  readonly gods: readonly GodId[];
  readonly onPick: (god: GodId) => void;
  /** The word on the control that opens it. */
  readonly label?: string;
}

export function GodPicker({ gods, onPick, label = "+ god" }: GodPickerProps) {
  const game = useGame();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  /**
   * Set by Escape, and it is the whole of why that key works: closing hands the
   * focus back to the control, which is a focus event here, which opens it — so
   * the list came straight back. Invisible to a test that presses Escape with
   * the focus already on the control, which is how the first one was written.
   */
  const dismissed = useRef(false);

  if (gods.length === 0) return null;

  /** Leaving the picker altogether both closes it and forgets the dismissal. */
  function close(): void {
    dismissed.current = false;
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "Escape" || !open) return;
    // Focus goes back to the control that opened it, or a keyboard user closing
    // the list is left standing on nothing.
    event.stopPropagation();
    dismissed.current = true;
    setOpen(false);
    opener.current?.focus();
  }

  return (
    // Focus opens it as hover does, or the control is a thing only a mouse can
    // reach. Both handlers are on the wrapper: the list is a descendant, so the
    // pointer travelling into it never leaves this element.
    <div
      className="godpicker"
      onMouseEnter={() => {
        dismissed.current = false;
        setOpen(true);
      }}
      onMouseLeave={close}
      onFocus={() => {
        if (!dismissed.current) setOpen(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close();
      }}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        ref={opener}
        className="godpicker__open"
        aria-expanded={open}
        // A pointer that opened it by hovering can close it again here, and a
        // keyboard that dismissed it with Escape asks for it again here — the
        // dismissal only blocks the focus route back in, which is the one that
        // fires on its own.
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>

      {!open ? null : (
        <ul className="godpicker__list">
          {gods.map((god) => (
            <li key={god}>
              <button
                type="button"
                className="godpicker__god"
                style={{ "--god": godColour(god) } as CSSProperties}
                onClick={() => {
                  onPick(god);
                  setOpen(false);
                }}
              >
                <GodArt game={game} god={god} className="godpicker__art" />
                <span className="godpicker__name">{god}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
