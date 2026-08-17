import { type CSSProperties, useId } from "react";
import { chromeStyle } from "./boon-art.js";
import { useDialog } from "./dialog.js";
import { useGame } from "./presentation.js";

/**
 * The door into a game, drawn the way both games draw theirs: a row of slots,
 * the one holding something showing what it holds, and the rest saying they are
 * empty.
 *
 * Two slots rather than four, because that is how many states a run can be in
 * here — the one you are in and the one you have not started.
 */
export interface RunSummary {
  readonly held: number;
  readonly gods: number;
  readonly goals: number;
}

export interface SaveScreenProps {
  /** What the stored run holds, or null where there is nothing to resume. */
  readonly run: RunSummary | null;
  readonly onResume: () => void;
  /** Files the run above as the previous one and opens a fresh one. */
  readonly onNew: () => void;
  /** Back out of the game entirely, which is what the games' own arrow does. */
  readonly onLeave: () => void;
}

export function SaveScreen({ run, onResume, onNew, onLeave }: SaveScreenProps) {
  const game = useGame();
  const { ref, onKeyDown } = useDialog(onLeave);
  const titleId = useId();

  /* No click-away, unlike the two dialogs that share this shade: leaving here
     goes back to the front page rather than dismissing something, and a stray
     click should not take a player out of the game they just opened. */
  return (
    <div className="sheet-scrim" onKeyDown={onKeyDown}>
      <div
        className="saves"
        data-game={game}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 className="saves__title" id={titleId}>
          Choose a save slot to begin
        </h2>

        {/* The game's own slot frame, on the list rather than on each slot: one
            declaration inherits to all three, and a slot that is only ever
            drawn beside its siblings never differs from them. Absent art sets
            nothing and the plain border stays. */}
        <ul className="saves__slots" style={chromeStyle(game, "saveslot") as CSSProperties}>
          {run === null ? null : (
            <li className="saves__slot" data-filled="true">
              <button type="button" className="saves__take" onClick={onResume}>
                <span className="saves__what">Continue run</span>
                <dl className="saves__stats">
                  <Stat label="Boons" value={run.held} />
                  <Stat label="Gods met" value={run.gods} />
                  <Stat label="Goals" value={run.goals} />
                </dl>
              </button>
            </li>
          )}

          <li className="saves__slot">
            <button type="button" className="saves__take" onClick={onNew}>
              <span className="saves__what">Start a new run</span>
              {/* Said here rather than found out afterwards: the run in the slot
                  beside this one is kept, not thrown away. */}
              <p className="saves__note">
                {run === null
                  ? "Nothing is stored yet, so this is where you begin."
                  : "The run beside this is filed as your previous run."}
              </p>
            </button>
          </li>

          {run === null ? (
            <li className="saves__slot" data-empty="true">
              <span className="saves__empty">( Empty Save Slot )</span>
            </li>
          ) : null}
        </ul>

        <button type="button" className="saves__back" onClick={onLeave}>
          Back
        </button>
      </div>
    </div>
  );
}

/** One line of a filled slot, the way both games lay their own out. */
function Stat({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="saves__stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
