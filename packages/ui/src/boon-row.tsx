import { type CSSProperties, type ReactNode } from "react";
import { NodeBox } from "./boon-node.js";
import { RarityMark } from "./chrome.js";
import { godColour } from "./god-palette.js";
import type { NodeView } from "./node-view.js";
import { useGame, useLadder } from "./presentation.js";
import { treatmentOf } from "./rarity-palette.js";

/**
 * One boon as the games' own Codex draws it: the icon at the left, the name and
 * what kind of boon it is on one line, the description under the name.
 *
 * Shared by the two surfaces that show one boon's text — the **Action Sheet**
 * over the page and the **Boon Card** beside the Loadout's grid. They were the
 * same thing drawn twice, and the second one did not follow the first when it
 * was restyled; one component is what stops that happening again.
 *
 * The frame is per game: Hades I runs its list inside one panel so rarity shows
 * on an edge, and Hades II slabs each entry with a tint across it. The tint is a
 * custom property rather than a class per rarity, so Common paints nothing and a
 * rarity the data adds later needs no rule.
 */
export interface BoonRowProps {
  readonly view: NodeView;
  /** Codex text, already resolved. */
  readonly description: string | null;
  /** The heading element, since one surface labels a dialog with it. */
  readonly title: ReactNode;
  /**
   * Whether the boon is pinned to a **Goal**, which draws the marker on its
   * corner. Off in the Loadout, where a Goal never appears at all.
   */
  readonly pinned?: boolean;
  /** Anything else belonging inside the row, under the description. */
  readonly children?: ReactNode;
}

export function BoonRow({ view, description, title, pinned = false, children }: BoonRowProps) {
  const game = useGame();
  const ladder = useLadder();
  // The kind where the boon has one and the rarity otherwise, already settled
  // between by the view. Common has no colour and still writes its word, so the
  // tint asks about the colour and the line asks about the word.
  const treatment = treatmentOf(view);

  return (
    <div
      className="boonrow"
      data-game={game}
      data-treatment={treatment?.colour == null ? undefined : treatment.word}
      style={
        treatment?.colour == null ? undefined : ({ "--rarity": treatment.colour } as CSSProperties)
      }
    >
      {/* The node's own drawing with the control taken off: the surface is
          already about this boon, so a button here is a tab stop that does
          nothing and takes the focus the close control is meant to get. */}
      <span
        className="boonrow__icon node"
        data-game={game}
        data-ladder={ladder}
        data-state={view.state}
        style={{ "--god": godColour(view.god) } as CSSProperties}
      >
        <NodeBox view={view} pinned={pinned} />
      </span>

      <div className="boonrow__body">
        <div className="boonrow__head">
          {title}
          {/* Right-aligned on the name's own line, where the game puts it. */}
          <RarityMark view={view} />
        </div>

        {description === null ? null : (
          // Extracted game text, through the resolver that can withdraw it, as
          // text rather than markup.
          <p className="boonrow__desc">{description}</p>
        )}

        {children}
      </div>
    </div>
  );
}
