import type { CSSProperties } from "react";
import { useId } from "react";
import { BoonArt } from "./boon-art.js";
import { stateSentence } from "./describe.js";
import { DormantGlyph, MarkerGlyph } from "./glyphs.js";
import { godColour } from "./god-palette.js";
import type { NodeView } from "./node-view.js";
import { useLadder } from "./presentation.js";

/**
 * One boon, as a node.
 *
 * It is a real control, which is what the accessible path rests on: a diamond in
 * a graph is the least reachable shape here, so each is a focusable button whose
 * accessible name carries its state in words rather than in a frame weight or a
 * glow. The linear surfaces are still the primary accessible rendering, but a
 * node that is only a shape leaves the graph a picture of the data instead of a
 * second way through it.
 *
 * State is structural: every step of the ladder is frame weight, brightness or
 * saturation, and none of them is a hue. Hue means which god granted the boon,
 * and a channel meaning two things means neither. The ladder is legible in
 * greyscale as a consequence, which is the cheap way to be sure it survives
 * colourblindness.
 *
 * The name is extracted game text and everything else is ours; both go to the
 * renderer as text, which escapes them.
 */
export interface BoonNodeProps {
  readonly view: NodeView;
  /** Pinned to a goal. Intent rather than fact, so it is passed, not derived. */
  readonly pinned?: boolean;
  /** Opens the detail surface. Absent while nothing has one to open. */
  readonly onOpen?: ((trait: string) => void) | undefined;
}

/**
 * Set through the object model rather than written into the page as a style
 * element, which is the distinction the page's content policy draws. A class per
 * god would avoid the question and cost a rule per god plus a build that knows
 * the roster.
 */
function godProperty(god: string | null): CSSProperties {
  return { "--god": godColour(god) } as CSSProperties;
}

export function BoonNode({ view, pinned = false, onOpen }: BoonNodeProps) {
  const ladder = useLadder();
  const describedBy = useId();

  const obtained = view.state === "Obtained";
  const description = [
    stateSentence(view.state),
    view.dormant ? "Owned, and not active yet." : null,
    view.rarity === null ? null : `${view.rarity}.`,
    view.notice === null ? null : noticeText(view.notice),
  ]
    .filter((part): part is string => part !== null)
    .join(" ");

  return (
    <div className="node" data-state={view.state} data-ladder={ladder} style={godProperty(view.god)}>
      <button
        type="button"
        className="node__control"
        aria-label={view.label}
        aria-describedby={describedBy}
        // Reflects "the run holds this". Note that pressing the control does
        // not change it: activation opens the detail surface, and marking a boon
        // as held happens there.
        aria-pressed={obtained}
        aria-current={pinned ? "true" : undefined}
        onClick={onOpen === undefined ? undefined : () => onOpen(view.trait)}
      >
        {/* Three elements, each load-bearing. The frame positions the corner
            glyphs and is deliberately not clipped, since a clip here cuts them
            off — which it did. The shape is the diamond, filled with the frame
            colour; the fill sits inside it by the frame's weight, and the ring
            showing between the two is the frame. */}
        <span className="node__frame">
          <span className="node__shape">
            <span className="node__fill">
              {/* No artwork at all on the fallback ladder rather than artwork
                  the stylesheet hides: a hidden image is still fetched, and the
                  fallback is for when there is nothing to fetch. */}
              {ladder === "real-art" ? <BoonArt iconKey={view.iconKey} /> : null}
            </span>
          </span>
          {pinned ? <MarkerGlyph /> : null}
          {view.dormant ? <DormantGlyph /> : null}
        </span>
        <span className="node__name">{view.name}</span>
        {/* The soft half of a hard verdict, on the node rather than only behind
            a tap: someone scanning a page of dead ends has to see that one of
            them is not one. */}
        {view.notice?.lead == null ? null : (
          <span className="node__lead">{view.notice.lead}</span>
        )}
      </button>
      <span id={describedBy} hidden>
        {description}
      </span>
    </div>
  );
}

/** The whole verdict as one string, for the description a reader hears. */
function noticeText(notice: NonNullable<NodeView["notice"]>): string {
  const sentence = notice.lead === null ? notice.body : `${notice.lead} ${notice.body}`;
  return notice.keepsake === null ? sentence : `${sentence} The keepsake is ${notice.keepsake}.`;
}
