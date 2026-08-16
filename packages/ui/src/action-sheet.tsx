import { useId, useMemo } from "react";
import { type BoonActions, BoonActionBar } from "./boon-actions.js";
import { BoonRow } from "./boon-row.js";
import { PINNED_SENTENCE, displacementLines, stateSentence } from "./describe.js";
import { useDialog } from "./dialog.js";
import { OVERRIDDEN_HINT, OVERRIDDEN_LABEL } from "./messages.js";
import type { NodeDetail, NodeView } from "./node-view.js";
import { useGame } from "./presentation.js";

/**
 * Everything about one boon, on a tap. The disclosure ladder puts an icon and a
 * state on the node and the rest here, which is what keeps a page of a hundred
 * and thirty diamonds readable. One surface on both platforms rather than a page
 * of its own: losing the graph to read one node's requirements is how a planning
 * tool stops being one.
 *
 * A modal dialog and it behaves like one — focus moves in on open, cannot leave,
 * and goes back where it came from on close; Escape closes it. That is the half
 * of the accessible path a focusable node does not buy on its own: a keyboard
 * user who reaches a node and then falls out behind the sheet has been given a
 * trap rather than a path.
 *
 * Every action is optional and absent until something can perform it. They all
 * write run state, which needs a source, and this package deliberately has
 * none; a control that looked live and did nothing would be worse than no
 * control.
 */
export interface ActionSheetProps {
  readonly view: NodeView;
  readonly detail: NodeDetail;
  readonly pinned?: boolean;
  /** Whether this boon's held state is one the user is holding by hand. */
  readonly overridden?: boolean;
  readonly onClose: () => void;
  readonly actions?: BoonActions;
}

export function ActionSheet({
  view,
  detail,
  pinned = false,
  overridden = false,
  onClose,
  actions = {},
}: ActionSheetProps) {
  // The trap, the focus hand-back and Escape are the same rules every modal
  // here owes a keyboard, and they live in one place now.
  const { ref: sheet, onKeyDown } = useDialog(onClose);
  const titleId = useId();
  const held = view.state === "Obtained";
  const game = useGame();

  /**
   * What is left to say about the run once the heading has said whether the
   * boon is held: the state, for a boon the run does not have, and the goal.
   *
   * Nothing opens a sheet on an unheld boon today — a click on one marks it —
   * but this component takes any view, and dropping the sentence would be
   * relying on that staying true.
   */
  const status = [held ? null : stateSentence(view.state), pinned ? PINNED_SENTENCE : null]
    .filter((part): part is string => part !== null)
    .join(" ");

  /**
   * Every edit closes the sheet behind it.
   *
   * The sheet is a dialog you opened to do one thing — say what rarity you took
   * it at, hand a field back, record that it is gone — and leaving it standing
   * afterwards means the answer to "did that work" is behind the thing you were
   * answering it about. Wrapped here rather than at each control, so an action
   * added later cannot forget.
   */
  const closing: BoonActions = useMemo(() => {
    const wrapped: Record<string, unknown> = {};
    for (const [name, act] of Object.entries(actions)) {
      if (typeof act !== "function") continue;
      wrapped[name] = (...args: unknown[]) => {
        (act as (...a: unknown[]) => void)(...args);
        onClose();
      };
    }
    return wrapped as BoonActions;
  }, [actions, onClose]);

  return (
    // Tapping the shade closes it, which on a phone is the gesture people reach
    // for before they find a close control. Guarded on the target being the shade
    // itself, or a click that started inside and drifted would dismiss it.
    <div
      className="sheet-scrim"
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet"
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-game={game}
        data-state={view.state}
      >
        {/* First in the document, so it is where focus lands on open and where
            tab starts. It is drawn in the corner, which is the place the
            Loadout's own card already puts its way out. */}
        <button type="button" className="sheet__close" onClick={onClose}>
          Close
        </button>

        {/* The same row the Loadout's card draws, so the two surfaces that show
            one boon's text cannot drift apart again. */}
        <BoonRow
          view={view}
          description={detail.description}
          pinned={pinned}
          title={
            <h2 className="boonrow__title" id={titleId}>
              {view.name}
              {/* In a parenthesis after the name — the sheet opens on a held
                  boon, so that is a confirmation rather than news. */}
              {held ? <span className="boonrow__held">(held)</span> : null}
            </h2>
          }
        >
          {status === "" ? null : <p className="boonrow__state">{status}</p>}
        </BoonRow>

        {!overridden ? null : (
          <p className="sheet__overridden">
            <strong>{OVERRIDDEN_LABEL}.</strong> {OVERRIDDEN_HINT}
            {actions.clearOverride === undefined ? null : (
              <button
                type="button"
                className="sheet__handback"
                onClick={() => closing.clearOverride?.(view.trait)}
              >
                Hand it back
              </button>
            )}
          </p>
        )}

        {view.notice === null ? null : (
          <p className="sheet__notice">
            {/* Word for word what it has to be: the emphasis is markup around
                the sentence, never a rewrite of it. */}
            {view.notice.lead === null ? null : <strong>{view.notice.lead}</strong>}
            {view.notice.lead === null ? view.notice.body : ` ${view.notice.body}`}
            {view.notice.keepsake === null ? null : (
              <span className="sheet__keepsake"> Keepsake: {view.notice.keepsake}</span>
            )}
          </p>
        )}

        {detail.activation.length === 0 ? null : (
          <section className="sheet__activation">
            <h3>Owned, and not active yet</h3>
            <ul>
              {detail.activation.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        )}

        {detail.needed.length === 0 ? null : (
          <section className="sheet__needed">
            <h3>Still needed</h3>
            <ul>
              {detail.needed.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        )}

        {detail.displaces === null || held ? null : (
          <section className="sheet__displaces">
            {/* Announced before the mark, never instead of it: a filled slot is
                ordinary play, and a control that refused it would be refusing
                the game. */}
            {displacementLines(detail.displaces).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </section>
        )}

        <BoonActionBar view={view} held={held} pinned={pinned} actions={closing} />
      </div>
    </div>
  );
}
