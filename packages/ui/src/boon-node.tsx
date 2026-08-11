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
/**
 * What a boon can have done to it, wherever one is drawn.
 *
 * One shape rather than three loose callbacks per container, because every
 * surface that draws a node hands the same three through and a surface that
 * forgot one would silently be a surface where that gesture does nothing.
 */
export interface BoonGestures {
  /**
   * Records the boon as held. The primary gesture on a boon the run does not
   * have, because marking is what a player does dozens of times a run and it
   * should cost one tap.
   */
  readonly onMark?: ((trait: string) => void) | undefined;
  /**
   * Opens the detail surface. The primary gesture on a boon the run *does*
   * have: marking it again would mean nothing, and the things worth doing to a
   * held boon — correcting a mis-tap, recording a loss, saying which rarity it
   * came at — are edits to details rather than the common case.
   */
  readonly onOpen?: ((trait: string) => void) | undefined;
  /**
   * Pins or unpins. Right-click on a pointer and long-press on a touch screen,
   * which is one handler because a long press fires `contextmenu` on both. A
   * double-tap was the other candidate and costs more than it looks: the first
   * tap has to be held back a quarter-second to find out whether a second is
   * coming, and the tap it delays is the mark.
   */
  readonly onGoal?: ((trait: string) => void) | undefined;
}

export interface BoonNodeProps extends BoonGestures {
  readonly view: NodeView;
  /** Pinned to a goal. Intent rather than fact, so it is passed, not derived. */
  readonly pinned?: boolean;
  /**
   * Draws the name under the diamond. Off in the Loadout, which is a menu of
   * icons — the name is still in the control's accessible name, so nothing a
   * reader gets depends on this.
   */
  readonly showName?: boolean;
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

export function BoonNode({
  view,
  pinned = false,
  onMark,
  onOpen,
  onGoal,
  showName = true,
}: BoonNodeProps) {
  const ladder = useLadder();
  const describedBy = useId();
  const held = view.state === "Obtained";

  /**
   * What a click does, and it depends on whether the run has the boon. Marking
   * something you already hold means nothing, and opening a sheet on something
   * you do not is a dialog in front of the one gesture that has to stay
   * instant.
   */
  const primary = held ? onOpen : onMark;

  const description = [
    stateSentence(view.state),
    view.dormant ? DORMANT_SENTENCE : null,
    view.rarity === null ? null : `${view.rarity}.`,
    view.notice === null ? null : noticeText(view.notice),
  ]
    .filter((part): part is string => part !== null)
    .join(" ");

  const tip = tipFor(view);

  return (
    <div className="node" data-state={view.state} data-ladder={ladder} style={godProperty(view.god)}>
      <button
        type="button"
        className="node__control"
        aria-label={view.label}
        aria-describedby={describedBy}
        /**
         * Not a toggle, so not `aria-pressed`. A button advertising a pressed
         * state that its own activation does not change is a control that lies,
         * and nothing is lost by dropping it: the accessible name carries
         * "Obtained" in words, which is what a reader hears first.
         *
         * A sheet is claimed only where there is one, which is a held boon.
         */
        aria-haspopup={held && onOpen !== undefined ? "dialog" : undefined}
        aria-current={pinned ? "true" : undefined}
        onClick={primary === undefined ? undefined : () => primary(view.trait)}
        onContextMenu={
          onGoal === undefined
            ? undefined
            : (event) => {
                // The platform's menu would cover the thing it was opened on.
                event.preventDefault();
                onGoal(view.trait);
              }
        }
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
        {showName ? <span className="node__name">{view.name}</span> : null}
        {/* The soft half of a hard verdict, on the node rather than only behind
            a tap: someone scanning a page of dead ends has to see that one of
            them is not one. */}
        {view.notice?.lead == null ? null : (
          <span className="node__lead">{view.notice.lead}</span>
        )}
      </button>
      {tip === null ? null : (
        /**
         * Why a boon cannot be had, or why one you own is doing nothing, on
         * hover and on keyboard focus. The game says this the same way and in
         * the same place, which is the argument for a tooltip over a panel: it
         * is an answer to a question you asked by looking at something.
         *
         * Hidden from the accessibility tree on purpose. Every word of it is
         * already in the description the control points at, and a reader that
         * met both would hear the verdict twice.
         */
        <span className="node__tip" aria-hidden="true">
          {tip.lead === null ? null : <strong>{tip.lead}</strong>}
          {tip.lead === null ? tip.body : ` ${tip.body}`}
        </span>
      )}
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

const DORMANT_SENTENCE = "Owned, and not active yet.";

/**
 * What the hover tooltip says, or nothing where there is nothing to warn about.
 * An impossible verdict wins over dormancy, which cannot co-occur with it
 * anyway — dormancy is a badge on Obtained.
 */
function tipFor(view: NodeView): { lead: string | null; body: string } | null {
  if (view.notice !== null) {
    const { lead, body, keepsake } = view.notice;
    return { lead, body: keepsake === null ? body : `${body} The keepsake is ${keepsake}.` };
  }
  return view.dormant ? { lead: null, body: DORMANT_SENTENCE } : null;
}
