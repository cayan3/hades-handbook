import { type KeyboardEvent, useEffect, useId, useMemo, useRef } from "react";
import { type BoonActions, BoonActionBar } from "./boon-actions.js";
import { RarityMark } from "./chrome.js";
import { displacementLines, stateSentence } from "./describe.js";
import { OVERRIDDEN_HINT, OVERRIDDEN_LABEL } from "./messages.js";
import type { NodeDetail, NodeView } from "./node-view.js";

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

/**
 * Deliberately narrow: everything the sheet renders, and nothing that relies on
 * guessing whether an element happens to be reachable.
 */
const FOCUSABLE = "button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

export function ActionSheet({
  view,
  detail,
  pinned = false,
  overridden = false,
  onClose,
  actions = {},
}: ActionSheetProps) {
  const sheet = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const held = view.state === "Obtained";

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

  useEffect(() => {
    // Captured before focus moves and restored on the way out. Without it,
    // closing the sheet lands a keyboard user at the top of the document, having
    // lost the node they were reading about.
    const opener = document.activeElement;
    sheet.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  /**
   * On the document rather than on the sheet, which is the difference between a
   * way out that always exists and one that nearly does. A handler on the sheet
   * only hears keys pressed while focus is inside it — nearly always, since the
   * trap below sees to that, and the exceptions are the moments it matters. A tap
   * on the shade, or a window that lost focus and came back to the body: focus is
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

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;

    const stops = [...(sheet.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (first === undefined || last === undefined) return;

    // Only the two ends need handling; between them the browser's own tab order
    // is already right.
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

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
        data-state={view.state}
      >
        <div className="sheet__head">
          <h2 className="sheet__title" id={titleId}>
            {view.name}
            {/* Beside the name rather than on a line of its own: the boon's
                kind where it has one, and otherwise the rarity, and only where
                the record says this boon has rarities at all. */}
            <RarityMark view={view} />
          </h2>
          <button type="button" className="sheet__close" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="sheet__state">
          {stateSentence(view.state)}
          {pinned ? " Pinned to a goal." : null}
        </p>

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

        {detail.description === null ? null : (
          // Extracted game text, through the resolver that can withdraw it, as
          // text rather than markup.
          <p className="sheet__description">{detail.description}</p>
        )}

        <BoonActionBar view={view} held={held} pinned={pinned} actions={closing} />
      </div>
    </div>
  );
}
