import { useId } from "react";
import { useDialog } from "./dialog.js";
import { SHORTCUTS_KEY } from "./keys.js";
import { MARKING_HINT } from "./messages.js";

/**
 * How to use the Handbook, in one popup reachable from every page.
 *
 * Game-agnostic on purpose: everything it explains — marking, goals, the bar —
 * works the same in both games, and a per-game copy would be two texts to keep
 * in step for no difference in what they say.
 */
export interface HelpProps {
  readonly onClose: () => void;
}

export function Help({ onClose }: HelpProps) {
  const { ref, onKeyDown } = useDialog(onClose);
  const titleId = useId();

  return (
    <div
      className="sheet-scrim"
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="sheet help"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {/* First in the document, so it is where focus lands and where Tab
            starts — the same place every other dialog here puts its way out. */}
        <button type="button" className="sheet__close" onClick={onClose}>
          Close
        </button>
        <h2 className="help__title" id={titleId}>
          How to use this Handbook
        </h2>

        <section className="help__part">
          <h3>Marking what a run gives you</h3>
          <p>{MARKING_HINT}</p>
          <p>
            Nothing is guessed for you. The Handbook only knows what you tell it, and it
            keeps that in this browser as you go.
          </p>
        </section>

        <section className="help__part">
          <h3>Working toward a boon</h3>
          <p>
            Set a boon as a goal and Goals tracks it: what it still needs, what it
            already has, and whether this run can still reach it at all.
          </p>
          <p>
            A boon that no longer fits the run says so rather than going quiet — a full
            god pool or a lost prerequisite is a verdict, not an absence.
          </p>
        </section>

        <section className="help__part">
          <h3>Getting around</h3>
          <p>
            The bar along the top is the gods this run has met, plus any you added to
            plan with. Its first tab is the Hub, which is where a run starts and returns
            to.
          </p>
          <p>
            The panel on the left is your Loadout — everything the run holds, in the
            order the game lays it out.
          </p>
        </section>

        <p className="help__more">
          Press <kbd>{SHORTCUTS_KEY}</kbd> for the full list of keyboard shortcuts.
        </p>
      </div>
    </div>
  );
}
