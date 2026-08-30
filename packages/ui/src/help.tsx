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
          <h3>Tracking your run</h3>
          <p>{MARKING_HINT}</p>
        </section>

        <section className="help__part">
          <h3>Setting a boon goal</h3>
          <p>
            Set a boon as a goal by right-clicking on it (desktop), or by opening
            the boon description by clicking/tapping the boon icon. Then, visit the Goals panel to track what you already have, what you still need,
            and whether you can still obtain it this run.
          </p>
          <p>
            A boon that no longer fits the run says so rather than going quiet — a full
            god pool or a lost prerequisite is a verdict, not an absence.
          </p>
        </section>

        <section className="help__part">
          <h3>Getting around</h3>
          <p>
            The bar along the top lists gods, hammers, NPCs, and other sources of boons/offerings.
            The leftmost tab is the Hub, which shows a brief overview of your current
            build. For more build details, hit "Overview" in the top right of the header.
          </p>
          <p>
            The panel on the left shows your current build/Loadout.
          </p>
        </section>

        <p className="help__more">
          Press <kbd>{SHORTCUTS_KEY}</kbd> for the full list of keyboard shortcuts.
        </p>
      </div>
    </div>
  );
}
