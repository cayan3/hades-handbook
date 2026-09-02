import type { CSSProperties } from "react";
import { chromeStyle } from "./boon-art.js";
import { useDialog } from "./dialog.js";
import { useGame } from "./presentation.js";

/**
 * The menu behind the header's own control and behind Escape.
 *
 * Four rows in two groups: the first two stay in the run and the second two
 * leave it, separated by a gap and nothing else, which is what both games' own
 * pause screens draw.
 */
/**
 * MOCKUP, not a setting. Which candidate skin to draw, so both can be looked at
 * in the running app before either is chosen: `none` is what ships, `panel` the
 * tray skin the Loadout and the save slots already wear, `box` the games' own
 * pause frame. Delete this and its two stylesheet blocks once the call is made.
 */
export type PauseSkin = "none" | "panel" | "box";

export interface PausePanelProps {
  /** Dismisses it, which is what the shade and Escape do too. */
  readonly onContinue: () => void;
  /** Help — the same dialog the header's own control opens. */
  readonly onHelp: () => void;
  /** The save screen, which is where the header's control used to go directly. */
  readonly onSaveSlots: () => void;
  /** Home, exactly where the save screen's own *Return to Home* goes. */
  readonly onHome: () => void;
  /** Mockup only; absent everywhere but a `?skin=` URL. */
  readonly skin?: PauseSkin;
}

export function PausePanel({
  onContinue,
  onHelp,
  onSaveSlots,
  onHome,
  skin = "none",
}: PausePanelProps) {
  const game = useGame();
  const { ref, onKeyDown } = useDialog(onContinue);
  // One property carries whichever chrome part the element asked for, which is
  // what lets the two skins share a stylesheet variable and differ by attribute.
  const skinned =
    skin === "none" ? {} : chromeStyle(game, skin === "box" ? "pausebox" : "panel");

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
        /* The rows glow in the game's own colour, which is the one thing the
           save screen beside it differs by too. */
        data-game={game}
        data-skin={skin === "none" ? undefined : skin}
        style={skinned as CSSProperties}
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
