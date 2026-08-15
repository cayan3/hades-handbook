import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
} from "react";
import { type BoonActions, BoonActionBar } from "./boon-actions.js";
import { NodeBox } from "./boon-node.js";
import { RarityMark } from "./chrome.js";
import { displacementLines, stateSentence } from "./describe.js";
import { godColour } from "./god-palette.js";
import { OVERRIDDEN_HINT, OVERRIDDEN_LABEL } from "./messages.js";
import type { NodeDetail, NodeView } from "./node-view.js";
import { useGame, useLadder } from "./presentation.js";
import { treatmentOf } from "./rarity-palette.js";

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
  const game = useGame();
  const ladder = useLadder();
  // The kind where the boon has one and the rarity otherwise, already settled
  // between by the view. Common has no colour and still writes its word, so the
  // tint asks about the colour and the line asks about the word.
  const treatment = treatmentOf(view);

  /**
   * What is left to say about the run once the heading has said whether the
   * boon is held: the state, for a boon the run does not have, and the goal.
   *
   * Nothing opens a sheet on an unheld boon today — a click on one marks it —
   * but this component takes any view, and dropping the sentence would be
   * relying on that staying true.
   */
  const status = [held ? null : stateSentence(view.state), pinned ? "Pinned to a goal." : null]
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
        data-game={game}
        data-state={view.state}
      >
        {/* First in the document, so it is where focus lands on open and where
            tab starts. It is drawn in the corner, which is the place the
            Loadout's own card already puts its way out. */}
        <button type="button" className="sheet__close" onClick={onClose}>
          Close
        </button>

        {/*
         * A row rather than a card, after the games' own Codex: the icon at the
         * left, the name and what kind of boon it is on one line, the
         * description under the name, and whatever is indented under that.
         * Hades I frames its list in one panel and Hades II gives each entry a
         * slab tinted by rarity, so the tint is a custom property here and the
         * shape of it is per game in the stylesheet.
         */}
        <div
          className="sheet__row"
          data-treatment={treatment?.colour == null ? undefined : treatment.word}
          style={
            treatment?.colour == null
              ? undefined
              : ({ "--rarity": treatment.colour } as CSSProperties)
          }
        >
          <span
            className="sheet__icon node"
            data-game={game}
            data-ladder={ladder}
            data-state={view.state}
            style={{ "--god": godColour(view.god) } as CSSProperties}
          >
            <NodeBox view={view} pinned={pinned} />
          </span>

          <div className="sheet__body">
            <div className="sheet__head">
              <h2 className="sheet__title" id={titleId}>
                {view.name}
                {/* In a parenthesis after the name — the sheet opens on a held
                    boon, so that is a confirmation rather than news. */}
                {held ? <span className="sheet__held">(held)</span> : null}
              </h2>
              {/* Right-aligned on the name's own line, where the game puts it:
                  the kind where the boon has one, the rarity otherwise. */}
              <RarityMark view={view} />
            </div>

            {detail.description === null ? null : (
              // The game's own words lead, where "Held." used to. Extracted
              // text, through the resolver that can withdraw it, as text rather
              // than markup.
              <p className="sheet__description">{detail.description}</p>
            )}

            {status === "" ? null : <p className="sheet__state">{status}</p>}
          </div>
        </div>

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
