import { useDialog } from "./dialog.js";

/**
 * The menu behind the header's own control and behind Escape.
 *
 * Four rows in two groups: the first two stay in the run and the second two
 * leave it, separated by a gap and nothing else, which is what both games' own
 * pause screens draw.
 */
export interface PausePanelProps {
  /** Dismisses it, which is what the shade and Escape do too. */
  readonly onContinue: () => void;
  /** Help — the same dialog the header's own control opens. */
  readonly onHelp: () => void;
  /** The save screen, which is where the header's control used to go directly. */
  readonly onSaveSlots: () => void;
  /** Home, exactly where the save screen's own *Return to Home* goes. */
  readonly onHome: () => void;
}

export function PausePanel({ onContinue, onHelp, onSaveSlots, onHome }: PausePanelProps) {
  const { ref, onKeyDown } = useDialog(onContinue);

  return (
    <div
      className="sheet-scrim"
      onKeyDown={onKeyDown}
      onClick={(event) => {
        // Dismissing is continuing, so a stray click off the panel costs
        // nothing — which is what makes both this and Escape safe here.
        if (event.target === event.currentTarget) onContinue();
      }}
    >
      <div
        className="sheet pause"
        ref={ref}
        role="dialog"
        aria-modal="true"
        // No drawn title. Each row says where it goes, and a heading over four
        // of those would be a fifth line saying less than any of them.
        aria-label="Menu"
      >
        {/* Continue is first, so it is where focus lands and where Tab starts:
            the row that costs nothing, ahead of the two that leave the run. */}
        <div className="pause__group">
          <button type="button" className="pause__option" onClick={onContinue}>
            Continue
          </button>
          <button type="button" className="pause__option" onClick={onHelp}>
            How to use this Handbook
          </button>
        </div>

        {/* Named for the controls they duplicate rather than for this menu: a
            player who reads the same words twice must arrive in the same place
            both times, which is the one rule a pause menu owes. */}
        <div className="pause__group">
          <button type="button" className="pause__option" onClick={onSaveSlots}>
            Save slots
          </button>
          <button type="button" className="pause__option" onClick={onHome}>
            Return to Home
          </button>
        </div>
      </div>
    </div>
  );
}
