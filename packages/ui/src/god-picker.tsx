import type { GodId } from "@repo/core";
import { type CSSProperties, type KeyboardEvent, useRef, useState } from "react";
import { GodArt } from "./boon-art.js";
import { godColour } from "./god-palette.js";
import { useGame } from "./presentation.js";

/**
 * The gods not on the bar, reached without a dialog.
 *
 * A disclosure rather than a menu widget: the panel holds ordinary buttons in
 * document order, so tab reaches them the way it reaches everything else here
 * and nothing sets a tab index. A `menu` role would promise arrow-key traversal
 * and a roving index, which is a second traversal model on a page whose whole
 * keyboard story is "DOM order, and nobody overrides it".
 *
 * Every entry draws the god's symbol **and** names them. Icon-only was the
 * request and does not survive the data: one of the 10 Hades I gods reaching a
 * tab has no symbol in the shipped set, and four of the 14 Hades II ones, so a
 * strip of pictures is a strip with unreadable gaps in it.
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
   * Set by Escape, and it is the whole of why that key works. Closing hands the
   * focus back to the control, which is a focus event on this element, which
   * opens it — so the list came straight back and the key looked broken. Found
   * by writing the test with the focus somewhere else first; with the focus
   * already on the control the assertion was true before the key was sent.
   */
  const dismissed = useRef(false);

  if (gods.length === 0) return null;

  /**
   * Hover opens it and focus opens it too, or the whole control is a thing only
   * a mouse can reach. Both handlers are on the wrapper rather than on the
   * button: the panel is a descendant, so the pointer travelling from the
   * control into the list never leaves this element and the list never goes out
   * from under it.
   */
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
