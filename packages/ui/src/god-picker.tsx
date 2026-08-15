import type { GodId } from "@repo/core";
import type { CSSProperties } from "react";
import { GodArt } from "./boon-art.js";
import { godColour } from "./god-palette.js";
import { useHoverDisclosure } from "./hover-disclosure.js";
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
 * ones have no symbol of their own, three of which now borrow the other game's.
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
  const { open, opener, wrapper, toggle, close } = useHoverDisclosure();

  if (gods.length === 0) return null;

  return (
    <div className="godpicker" {...wrapper}>
      <button
        type="button"
        ref={opener}
        className="godpicker__open"
        aria-expanded={open}
        // A pointer that opened it by hovering can close it again here, and a
        // keyboard that dismissed it with Escape asks for it again here — the
        // dismissal only blocks the focus route back in, which is the one that
        // fires on its own.
        onClick={toggle}
      >
        {label}
      </button>

      {!open ? null : (
        /* Beside the control rather than under it, with the first entry level
           with it and the rest dropping from there. A row is a rectangle with
           the symbol at the left, which is not how a tab is drawn — the two are
           different controls and read as such. */
        <ul className="godpicker__list">
          {gods.map((god) => (
            <li key={god}>
              <button
                type="button"
                className="godpicker__god"
                style={{ "--god": godColour(god) } as CSSProperties}
                onClick={() => {
                  onPick(god);
                  close();
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
