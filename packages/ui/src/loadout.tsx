import type { SlotId, TraitId } from "@repo/core";
import { type BoonActions, BoonActionBar } from "./boon-actions.js";
import { type BoonGestures, BoonNode } from "./boon-node.js";
import { OverrideMarker, RarityMark } from "./chrome.js";
import { OVERRIDDEN_HINT, OVERRIDDEN_LABEL } from "./messages.js";
import type { NodeDetail, NodeView } from "./node-view.js";
import { rarityColour } from "./rarity-palette.js";
import type { CSSProperties } from "react";

/**
 * The run's obtained boons, styled after the game's own boon menu: icons, no
 * names, the core slots on their own and everything else a click away.
 *
 * Names are off the tiles rather than absent — every tile is a control whose
 * accessible name carries the boon, its state, its god and its rarity, so the
 * list surface promises exactly what it did when the names were drawn. What
 * changes is that a held run reads as a shape at a glance, which is how a
 * player recognises their own build and is the whole reason the game draws it
 * this way.
 *
 * Rarity rides here as a colour behind the tile and **only here**. On a graph
 * node it would be a third channel beside state and god identity at 40px, which
 * is where legibility goes; in a menu the tile is bigger, the name is already
 * gone, and the game itself puts the colour on the icon. Common carries none,
 * as in the game — an absent treatment for the ordinary case.
 */

export interface LoadoutEntry {
  readonly view: NodeView;
  /** The slot it occupies, where it occupies one. */
  readonly slot: SlotId | null;
  /** Whether this boon's held state is the user's rather than the source's. */
  readonly overridden?: boolean;
}

/**
 * The boon the grid has selected, with everything the card beside it draws.
 *
 * Passed rather than derived, like everything else here: the description comes
 * through the catalog's resolver and the requirement lines through the engine,
 * and a component that fetched either would be a component with a catalog in
 * it.
 */
export interface LoadoutSelection {
  readonly view: NodeView;
  readonly detail: NodeDetail;
  /** Whether this boon's held state is the user's rather than the source's. */
  readonly overridden?: boolean;
}

export interface LoadoutProps extends BoonGestures {
  readonly entries: readonly LoadoutEntry[];
  /**
   * The slots a collapsed panel shows, in the order it shows them. The caller's
   * because which slots are "core" is a fact about the game, and this package
   * deliberately knows about neither.
   */
  readonly coreSlots?: readonly SlotId[];
  /** The equipped kit, which is not the Loadout and is shown beside it. */
  readonly equipped?: readonly { readonly label: string; readonly value: string }[];
  /** Starts expanded. Collapsed by default, which is the core slots alone. */
  readonly expanded?: boolean;
  readonly onExpanded?: (expanded: boolean) => void;
  /**
   * The boon whose card is open beside the grid, if one is.
   *
   * The game shows a held boon's text next to the icons rather than over them,
   * and it is right to: reading what you have is what this panel is *for*, and
   * a modal to do it covers the grid you were comparing against.
   */
  readonly selection?: LoadoutSelection | null;
  readonly onSelect?: (trait: TraitId | null) => void;
  /** The edits a card offers — the two removals and the rarity. */
  readonly actions?: BoonActions;
}

export function Loadout({
  entries,
  coreSlots = [],
  equipped = [],
  expanded = false,
  onExpanded,
  selection = null,
  onSelect,
  actions,
  ...gestures
}: LoadoutProps) {
  /**
   * The core column is in **slot order**, always the same one; everything else
   * is in the order the run took it.
   *
   * The two halves want opposite rules and that is the whole of it. A core slot
   * is a position — Attack, Special, Cast, and so on — and a player reads the
   * column by position, so it has to be the same column every run whatever
   * order they filled it in. The rest have no positions to be in, so the only
   * order that means anything is when they arrived.
   */
  const core = coreSlots
    .map((slot) => entries.find((entry) => entry.slot === slot))
    .filter((entry): entry is LoadoutEntry => entry !== undefined);
  const rest = entries.filter((entry) => !core.includes(entry));

  return (
    <section className="loadout" data-expanded={expanded}>
      <h2>Loadout</h2>

      {entries.length === 0 ? (
        <p className="loadout__empty">No boons yet.</p>
      ) : (
        <>
          {/* The core column stays leftmost when the rest arrives beside it,
              rather than the two flowing together — the slots every run has
              one of are the spine of a build and keeping them put is what
              makes the panel readable at a glance after it opens. */}
          <div className="loadout__panel">
            <div className="loadout__grid">
              <Tiles
                className="loadout__core"
                entries={core}
                selected={selection?.view.trait ?? null}
                {...gestures}
              />
              {expanded ? (
                <Tiles
                  className="loadout__rest"
                  entries={rest}
                  selected={selection?.view.trait ?? null}
                  {...gestures}
                />
              ) : null}
            </div>
            {selection === null ? null : (
              <BoonCard selection={selection} onClose={() => onSelect?.(null)} actions={actions} />
            )}
          </div>
          {rest.length === 0 || onExpanded === undefined ? null : (
            <button
              type="button"
              className="loadout__more"
              aria-expanded={expanded}
              onClick={() => onExpanded(!expanded)}
            >
              {expanded ? "Core slots only" : "Show all boons"}
            </button>
          )}
        </>
      )}

      {equipped.length === 0 ? null : (
        <dl className="loadout__equipped">
          {equipped.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function Tiles({
  className,
  entries,
  selected,
  ...gestures
}: {
  readonly className: string;
  readonly entries: readonly LoadoutEntry[];
  readonly selected: TraitId | null;
} & BoonGestures) {
  if (entries.length === 0) return null;
  return (
    <ul className={`loadout__list ${className}`}>
      {entries.map((entry) => (
        <li key={entry.view.trait} className="loadout__entry">
          <Tile entry={entry} selected={entry.view.trait === selected} {...gestures} />
          {entry.overridden === true ? <OverrideMarker /> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * One held boon as a tile.
 *
 * The rarity colour is a custom property rather than a class per rarity, so the
 * palette stays in one module and a rarity the data adds later needs no rule.
 * Common resolves to nothing at all, which is what makes the coloured ones mean
 * something.
 */
function Tile({
  entry,
  selected,
  ...gestures
}: { readonly entry: LoadoutEntry; readonly selected: boolean } & BoonGestures) {
  const rarity = entry.view.rarity;
  const marked = rarity !== null && rarity !== "Common";

  return (
    <span
      className="loadout__tile"
      data-selected={selected ? "true" : undefined}
      data-rarity={marked ? rarity : undefined}
      style={marked ? ({ "--rarity": rarityColour(rarity) } as CSSProperties) : undefined}
    >
      <BoonNode view={entry.view} showName={false} {...gestures} />
    </span>
  );
}

/**
 * One held boon's card, beside the grid rather than over it.
 *
 * The game's own boon menu reads this way — icons on the left, the text of
 * whichever one you picked next to them — and the reason it does is that you
 * are usually comparing, so covering the grid to read one entry is the one
 * thing this surface must not do.
 */
function BoonCard({
  selection,
  onClose,
  actions = {},
}: {
  readonly selection: LoadoutSelection;
  readonly onClose: () => void;
  readonly actions?: BoonActions | undefined;
}) {
  const { view, detail, overridden = false } = selection;

  return (
    <article className="loadout__card" data-state={view.state}>
      <div className="loadout__cardhead">
        <h3 className="loadout__cardname">{view.name}</h3>
        {view.rarity === null ? null : <RarityMark rarity={view.rarity} />}
        <button type="button" className="loadout__cardclose" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      {!overridden ? null : (
        <p className="loadout__overridden">
          <strong>{OVERRIDDEN_LABEL}.</strong> {OVERRIDDEN_HINT}
          {/* The control belongs beside the words. A card that says a field is
              held by hand and offers no way to hand it back is the same gap as
              a field with no view at all. */}
          {actions.clearOverride === undefined ? null : (
            <button
              type="button"
              className="loadout__handback"
              onClick={() => actions.clearOverride?.(view.trait)}
            >
              Hand it back
            </button>
          )}
        </p>
      )}

      {detail.description === null ? null : (
        // Extracted game text, through the resolver that can withdraw it, as
        // text rather than markup.
        <p className="loadout__carddesc">{detail.description}</p>
      )}

      {detail.activation.length === 0 ? null : (
        <ul className="loadout__cardlines">
          {detail.activation.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      <BoonActionBar view={view} held actions={actions} pinned={false} />
    </article>
  );
}
