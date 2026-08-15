import type { GodId } from "@repo/core";
import { type CSSProperties, useState } from "react";
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
  /** What the control that opens it is called. Drawn as a bare `+`. */
  readonly label?: string;
}

/**
 * Which ends of a scrolled list have something past them. A list that fits says
 * nothing, so the fades only ever appear where there is more to see.
 */
function edgesOf(list: HTMLElement): "none" | "above" | "below" | "both" {
  const above = list.scrollTop > 1;
  const below = list.scrollTop + list.clientHeight < list.scrollHeight - 1;
  if (above && below) return "both";
  return above ? "above" : below ? "below" : "none";
}

export function GodPicker({ gods, onPick, label = "Add a god" }: GodPickerProps) {
  const game = useGame();
  const { open, opener, wrapper, toggle, close } = useHoverDisclosure();
  const [edges, setEdges] = useState<"none" | "above" | "below" | "both">("none");

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
        <span aria-hidden="true">+</span>
        <span className="visually-hidden">{label}</span>
      </button>

      {!open ? null : (
        /* An L beside the control, with rows that are rectangles rather than
           the squares a tab is. `data-more` names the ends that have gods past
           them, read off the element rather than counted: what fits is a fact
           about the box and this component owns no layout. */
        <ul
          className="godpicker__list"
          data-more={edges}
          onScroll={(event) => setEdges(edgesOf(event.currentTarget))}
          ref={(list) => {
            if (list !== null) setEdges(edgesOf(list));
          }}
        >
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
