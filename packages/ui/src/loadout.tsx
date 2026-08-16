import type { Element, SlotId, TraitId } from "@repo/core";
import { type CSSProperties, useState } from "react";
import type { BoonActions } from "./boon-actions.js";
import { ElementArt, SlotArt, chromeStyle } from "./boon-art.js";
import { BoonNode } from "./boon-node.js";
import { BoonRow } from "./boon-row.js";
import { HoverMenu } from "./hover-menu.js";
import { OverrideMarker } from "./chrome.js";
import { OVERRIDDEN_HINT, OVERRIDDEN_LABEL } from "./messages.js";
import { catalogNaming } from "./naming.js";
import type { NodeDetail, NodeView } from "./node-view.js";
import { useGame } from "./presentation.js";
import { treatmentOf } from "./rarity-palette.js";

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
 * A core slot with a boon in it, or the position itself where the run has not
 * filled one. An empty core slot is drawn rather than skipped: the column is
 * read by position, so a missing rung would shift every slot below it.
 */
type Cell = LoadoutEntry | { readonly slot: SlotId; readonly view: null };

/**
 * The order the game's own tray draws them in, so the row does not rearrange as
 * a run picks elements up — a `Map` hands them back in the order they arrived.
 *
 * Taken from a capture of that tray rather than from a declared list: the game
 * builds the row by iterating a hash table, so its data has no order to read.
 */
const ELEMENTS: readonly Element[] = [
  "Earth",
  "Water",
  "Air",
  "Fire",
  "Aether",
];

export interface LoadoutProps {
  readonly entries: readonly LoadoutEntry[];
  /**
   * The slots a collapsed panel shows, in the order it shows them. The caller's
   * because which slots are "core" is a fact about the game, and this package
   * deliberately knows about neither.
   */
  readonly coreSlots?: readonly SlotId[];
  /** The equipped kit, which is not the Loadout and is shown beside it. */
  readonly equipped?: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  /**
   * How much of each Element the run has, which is a Hades II question and empty
   * in Hades I. Asked once over the whole panel rather than marked on every
   * tile: which element a boon counts toward is on the node in the God View, and
   * how many of them a run has is a fact about the run.
   *
   * Hades II only, guarded on the game rather than on the map being empty: 0 of
   * 449 Hades I records declare an affinity, so that run would carry five
   * permanent zeroes.
   */
  readonly elements?: ReadonlyMap<Element, number>;
  /**
   * Starts expanded. Collapsed by default, which is the core slots alone — and
   * the panel expands under the pointer regardless, so this is the state that
   * survives the pointer leaving.
   */
  readonly expanded?: boolean;
  readonly onExpanded?: (expanded: boolean) => void;
  /**
   * The rest of a boon's card, asked for only where one is drawn.
   *
   * A function rather than a value: which cards are open is this component's
   * own state, while the text inside one comes from the catalog and the engine,
   * which this package has neither of.
   */
  readonly detailOf?: (trait: TraitId) => NodeDetail;
  /**
   * How many cards fit beside the grid — "until they run out of room" counted
   * in cards, since this component owns no layout to measure.
   */
  readonly capacity?: number;
  /** The edits a card offers — the two removals and the rarity. */
  readonly actions?: BoonActions;
}

export function Loadout({
  entries,
  coreSlots = [],
  equipped = [],
  elements,
  expanded = false,
  onExpanded,
  detailOf,
  capacity = 3,
  actions,
}: LoadoutProps) {
  // The element symbols are the game's own art, and the two games' sets differ.
  const game = useGame();
  /**
   * The cards stuck beside the grid, and the tile under the pointer. Neither is
   * a fact about the run, which is why they live here: the node views are
   * cached on the facts object's identity, so a field that moved when a card
   * opened would go stale with nothing to notice.
   */
  const [stack, setStack] = useState<readonly TraitId[]>([]);
  const [hovered, setHovered] = useState<TraitId | null>(null);
  /** Whether the pointer or the keyboard is inside the panel. */
  const [inside, setInside] = useState(false);

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
  const core: readonly Cell[] = coreSlots.map(
    (slot) =>
      entries.find((entry) => entry.slot === slot) ?? { slot, view: null },
  );
  const rest = entries.filter((entry) => !core.includes(entry));

  /** A card whose boon has left the run describes a boon nobody holds. */
  const held = new Set(entries.map((entry) => entry.view.trait));
  const open = stack.filter((trait) => held.has(trait));
  const full = open.length >= capacity;

  /**
   * A hovered tile is in the held-open view too, so the glow and the stack are
   * one set — except when the stack is full, where nothing further can be added
   * or lit. A tile that lit on hover and then refused to open would be the
   * panel lying about what a click does.
   *
   * `held` is asked here as well as of the stack, and for the same reason: a
   * boon can leave the run while the pointer is still on its tile.
   */
  const preview =
    hovered !== null && held.has(hovered) && !open.includes(hovered) && !full
      ? hovered
      : null;
  const shown = preview === null ? open : [...open, preview];

  /**
   * Clicking a held-open tile takes it back out, so the control that opened a
   * card is the one that closes it.
   *
   * Taking one out drops the hover with it. The pointer is still on the tile
   * that was clicked, so otherwise the preview rule puts the card straight back
   * and the second click looks like it did nothing.
   */
  function toggle(trait: TraitId): void {
    if (!open.includes(trait)) {
      if (!full) setStack([...open, trait]);
      return;
    }
    setStack(open.filter((other) => other !== trait));
    setHovered((now) => (now === trait ? null : now));
  }

  const cardFor = (trait: TraitId) =>
    entries.find((entry) => entry.view.trait === trait);
  // Expanded under the pointer as well as by the control, which is what M2 asks
  // for; the control owns the half that survives the pointer leaving.
  const showRest = expanded || inside;

  return (
    <section
      className="loadout"
      data-game={game}
      data-open={showRest ? "true" : undefined}
      data-expanded={showRest}
      // On the panel rather than on each tile: moving from a tile to the card
      // it opened crosses the gap between them, and a handler per tile would
      // take the card away halfway across. Focus counts as well as the pointer,
      // or everything here is a thing only a mouse can reach.
      onMouseEnter={() => setInside(true)}
      onMouseLeave={() => {
        setInside(false);
        setHovered(null);
      }}
      onFocus={() => setInside(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setInside(false);
          setHovered(null);
        }
      }}
    >
      <h2>Loadout</h2>

      {entries.length === 0 ? (
        <p className="loadout__empty">No boons yet.</p>
      ) : (
        <>
          {/* The core column stays leftmost when the rest arrives beside it,
              rather than the two flowing together — the slots every run has
              one of are the spine of a build and keeping them put is what
              makes the panel readable at a glance after it opens. */}
          <div
            className="loadout__panel"
            data-game={game}
            data-open={showRest ? "true" : undefined}
            // The rest of the run fills a column of this many before starting
            // the next, which is the slot count rather than how many are held:
            // a shape that changed as boons arrived would rearrange under the
            // pointer.
            // The frame rides here as a property the stylesheet nine-slices,
            // and unset it computes to none — the skin, not the structure.
            style={
              {
                "--core-rows": String(coreSlots.length),
                ...chromeStyle(game, "panel"),
              } as CSSProperties
            }
          >
            {elements === undefined || game !== "hades2" || !showRest ? null : (
              /* Inside the panel and above the grid, which is where the game's
                 own tray puts it — count first, then the symbol. Drawn only
                 while the panel is open; the space it takes is reserved by the
                 panel's own margin either way, so the boons never move and the
                 backdrop simply grows up to meet the row. */
              <ul className="loadout__elements">
                {ELEMENTS.map((element) => (
                  <li
                    key={element}
                    data-met={elements.has(element) ? "true" : undefined}
                  >
                    <span>{elements.get(element) ?? 0}</span>
                    <ElementArt
                      game={game}
                      element={element}
                      className="loadout__element"
                    />
                    <span className="visually-hidden">{element}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="loadout__stack">
              <div className="loadout__grid">
                <Tiles
                  className="loadout__core"
                  entries={core}
                  open={open}
                  lit={shown}
                  onToggle={toggle}
                  onPreview={setHovered}
                />
                {showRest ? (
                  <Tiles
                    className="loadout__rest"
                    entries={rest}
                    open={open}
                    lit={shown}
                    onToggle={toggle}
                    onPreview={setHovered}
                  />
                ) : null}
              </div>
            </div>
            {/* Only while the panel has the pointer or the focus, the same rule
                the rest of the grid follows. The stack itself is untouched, so
                the cards that come back are the ones that were there — a card
                lies over the god page, and one left behind is covering
                something nobody is reading the Loadout to see. */}
            {!inside || shown.length === 0 || detailOf === undefined ? null : (
              <div className="loadout__cards">
                {shown.map((trait) => {
                  const entry = cardFor(trait);
                  if (entry === undefined) return null;
                  return (
                    <BoonCard
                      key={trait}
                      entry={entry}
                      detail={detailOf(trait)}
                      // Whether the two removals differ for this boon: they only
                      // do when it is the last one the run holds from its god.
                      alone={
                        entry.view.god !== null &&
                        entries.filter(
                          (other) => other.view.god === entry.view.god,
                        ).length === 1
                      }
                      // Hovering a held-open tile brings its card forward and
                      // leaves it where it is in the stack, so a glance at one
                      // card does not rearrange the others.
                      front={trait === hovered}
                      onClose={() => toggle(trait)}
                      actions={actions}
                    />
                  );
                })}
              </div>
            )}
          </div>
          {rest.length === 0 || onExpanded === undefined ? null : (
            <button
              type="button"
              className="loadout__more"
              // The control's own state, not the pointer's: it says what will
              // still be true once the pointer has gone.
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

interface TileGestures {
  readonly open: readonly TraitId[];
  readonly lit: readonly TraitId[];
  readonly onToggle: (trait: TraitId) => void;
  readonly onPreview: (trait: TraitId | null) => void;
}

function Tiles({
  className,
  entries,
  ...gestures
}: {
  readonly className: string;
  readonly entries: readonly Cell[];
} & TileGestures) {
  if (entries.length === 0) return null;
  return (
    <ul className={`loadout__list ${className}`}>
      {entries.map((cell) =>
        cell.view === null ? (
          <li key={cell.slot} className="loadout__entry">
            <EmptySlot slot={cell.slot} />
          </li>
        ) : (
          <li key={cell.view.trait} className="loadout__entry">
            <Tile entry={cell} {...gestures} />
            {cell.overridden === true ? <OverrideMarker /> : null}
          </li>
        ),
      )}
    </ul>
  );
}

/**
 * A core slot the run has not filled: the position's own glyph, in the box the
 * boon will occupy. Not a control — a boon arrives by being marked on its god's
 * page, so this is named in text and left out of the tab order.
 */
function EmptySlot({ slot }: { readonly slot: SlotId }) {
  const game = useGame();
  // The word the game's own equip bar uses, which is not the one the data files
  // the slot under: `Melee` is Attack in both games.
  const word = catalogNaming(game).slot(slot) ?? slot;

  return (
    <span className="loadout__emptyslot" data-game={game}>
      <SlotArt game={game} slot={slot} />
      <span className="visually-hidden">{word} — empty</span>
    </span>
  );
}

/**
 * One held boon as a tile. The treatment's colour is a custom property rather
 * than a class per rarity, so the palette stays in one module and a rarity the
 * data adds later needs no rule; Common sets nothing, which is what makes a
 * treated tile mean something.
 *
 * The attribute carries the *word*, which is the boon's kind where it has one —
 * a Hades I Duo is `Duo` here and not the `Legendary` its record declares.
 */
function Tile({
  entry,
  open,
  lit,
  onToggle,
  onPreview,
}: { readonly entry: LoadoutEntry } & TileGestures) {
  const trait = entry.view.trait;
  const treatment = treatmentOf(entry.view);
  const painted = treatment !== null && treatment.colour !== null;
  // The rarity band is a shape drawn behind the tile, so it has to follow the
  // same silhouette the node does or a rounded icon gets a diamond halo.
  const game = useGame();

  return (
    <span
      className="loadout__tile"
      data-game={game}
      data-open={open.includes(trait) ? "true" : undefined}
      data-lit={lit.includes(trait) ? "true" : undefined}
      data-treatment={painted ? treatment.word : undefined}
      style={
        painted
          ? ({ "--rarity": treatment.colour } as CSSProperties)
          : undefined
      }
      onMouseEnter={() => onPreview(trait)}
    >
      <BoonNode
        view={entry.view}
        showName={false}
        // The panel answers the element question once, over the whole run,
        // rather than a mark on every tile.
        showElement={false}
        expanded={open.includes(trait)}
        onOpen={onToggle}
        // The touch equivalent of hovering: a long press raises `contextmenu`
        // on both mobile platforms and a right-click raises it on the desktop,
        // so previewing a card costs no gesture of its own. A second press
        // puts it away, since a touch screen has nothing to leave.
        onGoal={() => onPreview(open.includes(trait) ? null : trait)}
      />
    </span>
  );
}

/**
 * Less than the **Action Sheet** offers, on purpose. No goal control, a boon
 * here being one the run holds. One removal rather than two: they differ only in
 * whether the god leaves the pool, which only differs on the last boon a god has
 * left, so the pool question appears exactly where it is a question. And the
 * rarity is behind a word, four of them beside a Remove reading as four removals.
 */
function CardActions({
  view,
  alone,
  actions,
}: {
  readonly view: NodeView;
  readonly alone: boolean;
  readonly actions: BoonActions;
}) {
  const { mark, remove, purge } = actions;
  const rarities = mark === undefined ? [] : view.rarities;
  if (rarities.length === 0 && remove === undefined && purge === undefined)
    return null;

  return (
    <div className="loadout__cardactions">
      {rarities.length === 0 ? null : (
        <HoverMenu label="Edit rarity" className="cardmenu" onHover={false}>
          {(close) =>
            rarities.map((rarity) => (
              <button
                key={rarity}
                type="button"
                aria-pressed={view.rarity === rarity}
                onClick={() => {
                  mark?.(view.trait, rarity);
                  close();
                }}
              >
                {rarity}
              </button>
            ))
          }
        </HoverMenu>
      )}

      {purge === undefined ? null : (
        <button
          type="button"
          className="loadout__cardremove"
          onClick={() => purge(view.trait)}
        >
          Remove
        </button>
      )}

      {/* Only where it changes anything. With another of this god's boons held
          the two removals agree, and offering a choice that makes no difference
          is a choice to get wrong. */}
      {!alone || remove === undefined ? null : (
        <button
          type="button"
          className="loadout__cardremove"
          onClick={() => remove(view.trait)}
        >
          Remove boon and god from pool
        </button>
      )}
    </div>
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
  entry,
  detail,
  front,
  alone,
  onClose,
  actions = {},
}: {
  readonly entry: LoadoutEntry;
  readonly detail: NodeDetail;
  readonly front: boolean;
  /** The last boon the run holds from this god, which is when the two removals differ. */
  readonly alone: boolean;
  readonly onClose: () => void;
  readonly actions?: BoonActions | undefined;
}) {
  const { view, overridden = false } = entry;

  return (
    <article
      className="loadout__card"
      data-state={view.state}
      data-front={front ? "true" : undefined}
    >
      {/* First in the document, and drawn in the corner, which is where the
          Action Sheet puts its own way out. */}
      <button
        type="button"
        className="loadout__cardclose"
        aria-label="Close"
        onClick={onClose}
      >
        ×
      </button>

      {/* The same row the Action Sheet draws. The two say the same things about
          one boon and were drawn twice, so restyling one left the other behind. */}
      <BoonRow
        view={view}
        description={detail.description}
        // The panel counts each element once over the whole run, so a card
        // inside it does not mark one; and a Goal never touches this panel.
        showElement={false}
        title={<h3 className="boonrow__title">{view.name}</h3>}
      >
        {detail.activation.length === 0 ? null : (
          <ul className="boonrow__lines">
            {detail.activation.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {/* Inside the row's text column rather than under the whole card, so it
            starts where the name and the description start rather than under
            the icon. */}
        <CardActions view={view} alone={alone} actions={actions} />
      </BoonRow>

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
    </article>
  );
}
