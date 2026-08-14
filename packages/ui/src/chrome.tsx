import type { CSSProperties, ReactNode } from "react";
import { OVERRIDDEN_HINT, OVERRIDDEN_LABEL } from "./messages.js";
import type { NodeView } from "./node-view.js";
import { treatmentOf } from "./rarity-palette.js";

/**
 * The furniture a run wears: what a load could not carry, what a save could not
 * store, what another tab is doing, and what the last tap can take back.
 *
 * Each of these existed as a field on the source and had no view, which is the
 * same as not existing — a player met an empty run with no explanation, or a
 * run that had silently stopped saving. Presentational like everything else
 * here: the sentences come from `messages.ts` and the caller passes them in.
 */

export interface NoticeBarProps {
  readonly title: string;
  readonly body: string;
  /**
   * Loud enough to interrupt, or quiet enough to live in the header. A storage
   * failure and a second open tab are not the same size of problem.
   */
  readonly tone?: "alert" | "note";
  readonly children?: ReactNode;
  readonly onDismiss?: () => void;
  readonly dismissLabel?: string;
}

/**
 * `role="status"` rather than `alert`: every one of these describes something
 * that has already happened and none needs to interrupt what a screen reader is
 * saying. An alert that fires on load, which the migration notice does, is one
 * that talks over the page it is about.
 */
export function NoticeBar({
  title,
  body,
  tone = "note",
  children,
  onDismiss,
  dismissLabel = "Got it",
}: NoticeBarProps) {
  return (
    <section className="notice" data-tone={tone} role="status">
      <p className="notice__title">{title}</p>
      <p className="notice__body">{body}</p>
      {children}
      {onDismiss === undefined ? null : (
        <button type="button" className="notice__dismiss" onClick={onDismiss}>
          {dismissLabel}
        </button>
      )}
    </section>
  );
}

export interface UndoToastProps {
  /** What just happened, in the past tense and without the word "undo" in it. */
  readonly what: string;
  /**
   * What the edit cost that nothing else says — today, the boon a mark pushed
   * out of a filled slot, and which of the player's goals wanted it.
   *
   * It reads here rather than as a warning before the mark, because there is no
   * before: marking is one tap. That is the better place for it anyway. It was
   * never a choice — a control that could refuse a displacement would be
   * refusing ordinary play — so a warning ahead of it was a sentence with
   * nothing to do, and this one arrives beside a working Undo.
   */
  readonly cost?: readonly string[];
  readonly onUndo: () => void;
  readonly onDismiss: () => void;
}

/**
 * One level, which is the whole offer: a wrong mark is re-doable by hand, and
 * an ordered history interacts badly with fields the user is holding by hand.
 * So this shows the last edit only and disappears when it is taken back.
 */
export function UndoToast({ what, cost = [], onUndo, onDismiss }: UndoToastProps) {
  return (
    <div className="toast" role="status">
      <span className="toast__what">{what}</span>
      {cost.length === 0 ? null : (
        <span className="toast__cost">
          {cost.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      )}
      <button type="button" className="toast__undo" onClick={onUndo}>
        Undo
      </button>
      <button type="button" className="toast__dismiss" aria-label="Dismiss" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}

/**
 * What a boon is, in a word, beside its name: its **kind** where it has one and
 * its rarity otherwise, in that word's own colour.
 *
 * It was a swatch for a while, on the argument that the word cost a line of its
 * own. Beside the name it costs nothing — and the swatch had the usual problem
 * with colour, which is that two of the game's own rarity colours are
 * identical, so the dot could not be told apart at all in those cases. The word
 * carries the meaning and the colour decorates it, rather than the other way
 * round, so nothing depends on distinguishing two hues or on reading any.
 *
 * Common paints nothing and still writes its word, which is why the colour is
 * allowed to be absent while the word is not.
 */
export function RarityMark({ view }: { readonly view: NodeView }) {
  const treatment = treatmentOf(view);
  if (treatment === null) return null;
  return (
    <span
      className="rarity"
      style={{ "--rarity": treatment.colour ?? "currentColor" } as CSSProperties}
    >
      {treatment.word}
    </span>
  );
}

/**
 * The "diverges from live" marker: per field, and never a mode the run is in.
 *
 * A glyph with a real accessible name rather than a colour, since the whole
 * point is that the user always knows which fields are theirs and which are
 * being kept up to date for them.
 */
export function OverrideMarker() {
  return (
    <span className="override-marker" title={OVERRIDDEN_HINT}>
      <span aria-hidden="true">✎</span>
      <span className="visually-hidden">{OVERRIDDEN_LABEL}</span>
    </span>
  );
}
