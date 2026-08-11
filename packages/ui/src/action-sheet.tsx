import type { Rarity, TraitId } from "@repo/core";
import { type KeyboardEvent, useEffect, useId, useRef } from "react";
import { displacementLines, stateSentence } from "./describe.js";
import {
  OVERRIDDEN_HINT,
  OVERRIDDEN_LABEL,
  PURGE_HINT,
  PURGE_LABEL,
  REMOVE_HINT,
  REMOVE_LABEL,
} from "./messages.js";
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
 * The gestures a surface can offer about one boon.
 *
 * **The two removals are separate on purpose and the difference is a fact about
 * the run, not wording.** A mis-tap never happened, so the god goes back out of
 * the pool if nothing else holds them there; a boon lost in game was really
 * taken, so the god stays. One control would have to pick one of those
 * silently, and picking the mis-tap would under-report the pool for the rest of
 * the run — a god the player has met reading as one they have not.
 *
 * Displacement is the third and is not a gesture at all: it happens on its own
 * when a mark fills an occupied slot. It is announced before the mark rather
 * than offered as a choice, because refusing it would mean refusing ordinary
 * play.
 */
export interface BoonActions {
  /**
   * Records the boon as held. The rarity is what the player was offered, or
   * `null` where the data declares none and there was nothing to ask.
   */
  readonly mark?: (trait: TraitId, rarity: Rarity | null) => void;
  /** A mis-tap: it never happened. */
  readonly remove?: (trait: TraitId) => void;
  /** Held, and then lost in game. */
  readonly purge?: (trait: TraitId) => void;
  readonly pin?: (trait: TraitId) => void;
  readonly unpin?: (trait: TraitId) => void;
  /** Hands this boon's held state back to the source, which repopulates it. */
  readonly clearOverride?: (trait: TraitId) => void;
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
          </h2>
          <button type="button" className="sheet__close" onClick={onClose}>
            Close
          </button>
        </div>

        <p className="sheet__state">
          {stateSentence(view.state)}
          {pinned ? " Pinned to a goal." : null}
        </p>

        {view.rarity === null ? null : (
          <p className="sheet__rarity">
            {/* Only where the data says this boon has rarities at all. */}
            Rarity: {view.rarity}
          </p>
        )}

        {!overridden ? null : (
          <p className="sheet__overridden">
            <strong>{OVERRIDDEN_LABEL}.</strong> {OVERRIDDEN_HINT}
            {actions.clearOverride === undefined ? null : (
              <button
                type="button"
                className="sheet__handback"
                onClick={() => actions.clearOverride?.(view.trait)}
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

        <MarkControls view={view} held={held} pinned={pinned} actions={actions} />
      </div>
    </div>
  );
}

/**
 * The write path, and the shape of the questions it asks.
 *
 * **Marking asks the rarity by being the rarity**, where the record declares
 * any: one control per rarity instead of one control and then a dialog. The
 * marking gesture is the one interaction that has to stay instant, so a
 * question in front of it would be the wrong trade — but the choice *is* the
 * tap here, so it costs nothing and it stops the run storing a rarity nobody
 * observed. Where the record declares none there is nothing to ask and one
 * plain control does it.
 */
function MarkControls({
  view,
  held,
  pinned,
  actions,
}: {
  readonly view: NodeView;
  readonly held: boolean;
  readonly pinned: boolean;
  readonly actions: BoonActions;
}) {
  const { mark, remove, purge, pin, unpin } = actions;
  const marking = !held && mark !== undefined;
  const removing = held && (remove !== undefined || purge !== undefined);
  const pinning = pinned ? unpin !== undefined : pin !== undefined;
  if (!marking && !removing && !pinning) return null;

  return (
    <div className="sheet__actions">
      {!marking ? null : view.rarities.length === 0 ? (
        <button type="button" onClick={() => mark?.(view.trait, null)}>
          Mark as have
        </button>
      ) : (
        <fieldset className="sheet__rarities">
          <legend>Mark as have, at</legend>
          {view.rarities.map((rarity) => (
            <button key={rarity} type="button" onClick={() => mark?.(view.trait, rarity)}>
              {rarity}
            </button>
          ))}
        </fieldset>
      )}

      {!removing ? null : (
        <fieldset className="sheet__removals">
          {/* Two controls because they are two different facts. The verb
              carries the meaning, so neither needs an interrupting note. */}
          <legend>No longer have it?</legend>
          {remove === undefined ? null : (
            <button type="button" title={REMOVE_HINT} onClick={() => remove(view.trait)}>
              {REMOVE_LABEL}
            </button>
          )}
          {purge === undefined ? null : (
            <button type="button" title={PURGE_HINT} onClick={() => purge(view.trait)}>
              {PURGE_LABEL}
            </button>
          )}
        </fieldset>
      )}

      {!pinning ? null : pinned ? (
        <button type="button" onClick={() => unpin?.(view.trait)}>
          Remove goal
        </button>
      ) : (
        <button type="button" onClick={() => pin?.(view.trait)}>
          Set as goal
        </button>
      )}
    </div>
  );
}
