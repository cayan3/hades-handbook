import type { Element, SlotId, TraitId } from "@repo/core";
import { type CSSProperties, type KeyboardEvent, useState } from "react";
import type { BoonActions } from "./boon-actions.js";
import { ElementArt, SlotArt, chromeStyle } from "./boon-art.js";
import { BoonNode } from "./boon-node.js";
import { BoonRow } from "./boon-row.js";
import { HoverMenu } from "./hover-menu.js";
import { focusMember, memberAt, stepFor, stepIndex } from "./keys.js";
import { OverrideMarker } from "./chrome.js";
import { OVERRIDDEN_HINT, OVERRIDDEN_LABEL } from "./messages.js";
import { catalogNaming } from "./naming.js";
import type { NodeDetail, NodeView } from "./node-view.js";
import { useGame } from "./presentation.js";
import { byLadder, rarityColour, treatmentOf } from "./rarity-palette.js";

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

/**
 * How wide a card's title column is, in characters of the display face.
 *
 * Counted rather than measured, which is the point: the runner has no layout,
 * so a capacity read off the DOM would leave the no-room rule with no test.
 * Measured on the shipped card at its full width — a 369.7px column beside the
 * rarity word over a 13.5px mean glyph. A card bounded by the viewport instead
 * is narrower than this, so there it over-estimates and admits one sooner.
 */
const NAME_COLUMNS = 27;

/** What one card costs the stack: a name that wraps hides twice as much. */
function nameLines(name: string): number {
  return Math.max(1, Math.ceil(name.length / NAME_COLUMNS));
}

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
   * How much room the stack has, counted in **boon-name lines**.
   *
   * The cards split the panel's height between them, so a card is refused when
   * admitting it would squeeze the strip that shows an open card's name. Room
   * is pixels and this panel owns no layout to measure — so the caller says how
   * many name lines its area holds, and a card costs the lines its own name
   * needs. Ten is the shipped desktop profile solved: a 490.4px panel over a
   * 9.6px gap leaves each of ten a 40.4px band against the 40.2px a name takes,
   * and eleven leaves 35.9.
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
  capacity = 10,
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

  /**
   * What one more card would cost the stack, in the name lines `capacity`
   * counts. A card is refused when paying it would leave an open card's name
   * with nowhere to be drawn.
   */
  const cost = (trait: TraitId) =>
    nameLines(entries.find((entry) => entry.view.trait === trait)?.view.name ?? "");
  const spent = open.reduce((lines, trait) => lines + cost(trait), 0);
  const roomFor = (trait: TraitId) => spent + cost(trait) <= capacity;

  /**
   * A hovered tile is in the held-open view too, so the glow and the stack are
   * one set — except where there is no room for it, and then nothing is added
   * or lit. A tile that lit on hover and then refused to open would be the
   * panel lying about what a click does.
   *
   * `held` is asked here as well as of the stack, and for the same reason: a
   * boon can leave the run while the pointer is still on its tile.
   */
  const preview =
    hovered !== null && held.has(hovered) && !open.includes(hovered) && roomFor(hovered)
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
      if (roomFor(trait)) setStack([...open, trait]);
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

  /**
   * The arrows across the tiles, in the order the panel draws them.
   *
   * This panel owns no coordinate model either — the core is a column of one
   * game's slot count and the rest is a grid whose width is the stylesheet's —
   * so all four arrows step through the tiles as drawn rather than pretending
   * to a row and a column. Home and End reach the ends.
   */
  function walk(event: KeyboardEvent<HTMLElement>): void {
    const step = stepFor(event);
    const root = event.currentTarget;
    const from = step === null ? null : memberAt(event.target, "data-trait");
    if (step === null || from === null) return;

    const tiles = [...root.querySelectorAll<HTMLElement>("[data-trait]")].map(
      (cell) => cell.dataset["trait"] ?? "",
    );
    const next = tiles[stepIndex(tiles.indexOf(from), step, tiles.length)];
    if (next === undefined || !focusMember(root, "data-trait", next)) return;
    event.preventDefault();
  }

  return (
    <section
      className="loadout"
      onKeyDown={walk}
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
            <div className="loadout__stack">
              {elements === undefined ||
              game !== "hades2" ||
              !showRest ? null : (
                /* Inside the stack and above the grid, which is where the game's
                   own tray puts it — count first, then the symbol. Drawn only
                   while the panel is open; the heading reserves the space either
                   way, so the boons never move and the backdrop grows up to meet
                   the row. In the stack rather than beside it because the panel
                   puts its own gap between its children and the reserve cannot
                   know about that. */
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
              <div className="loadout__grid">
                <Tiles
                  className="loadout__core"
                  entries={core}
                  rows={coreSlots.length}
                  open={open}
                  lit={shown}
                  onToggle={toggle}
                  onPreview={setHovered}
                />
                {showRest ? (
                  <Tiles
                    className="loadout__rest"
                    entries={rest}
                    rows={coreSlots.length}
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
              // The stack splits the panel's height between the cards it holds,
              // so the count is what the stylesheet needs to lay them out.
              <div
                className="loadout__cards"
                style={{ "--slots": String(shown.length) } as CSSProperties}
              >
                {shown.map((trait, slot) => {
                  const entry = cardFor(trait);
                  if (entry === undefined) return null;
                  return (
                    <BoonCard
                      key={trait}
                      entry={entry}
                      detail={detailOf(trait)}
                      slot={slot}
                      onHover={() => setHovered(trait)}
                      // Whether the two removals differ for this boon: they only
                      // do when it is the last one the run holds from its god.
                      alone={
                        entry.view.god !== null &&
                        entries.filter(
                          (other) => other.view.god === entry.view.god,
                        ).length === 1
                      }
                      // Hovering a held-open tile — or the card itself — brings
                      // that card forward and leaves it where it is in the
                      // stack, so a glance at one does not rearrange the others.
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
  rows,
  ...gestures
}: {
  readonly className: string;
  readonly entries: readonly Cell[];
  /**
   * The grid's row count, which is the game's slot count. The list is flat and
   * the grid fills a column at a time, so this is the only way to say which
   * column an entry landed in — and Hades I staggers every other one.
   */
  readonly rows: number;
} & TileGestures) {
  if (entries.length === 0) return null;
  // Every other column drops half a step in Hades I, so the diamonds pack along
  // their edges the way the game's own tray does. The **first** is the dropped
  // one, the game staggering it against the core column beside it. The
  // stylesheet owns whether this means anything; here it only says which.
  const column = (at: number) => String((Math.floor(at / Math.max(rows, 1)) + 1) % 2);

  return (
    <ul className={`loadout__list ${className}`}>
      {entries.map((cell, at) =>
        cell.view === null ? (
          <li key={cell.slot} className="loadout__entry" data-column={column(at)}>
            <EmptySlot slot={cell.slot} />
          </li>
        ) : (
          // The arrows walk what carries this, so an empty slot is skipped by
          // not having one — which is the same reason it is not a control.
          <li
            key={cell.view.trait}
            className="loadout__entry"
            data-column={column(at)}
            data-trait={cell.view.trait}
          >
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
  // The ladder rather than the record's own order, which is alphabetical in all
  // 784 records declaring one and reads as a jumble.
  const rarities = mark === undefined ? [] : byLadder(view.rarities);
  // The pool question only differs on the last boon a god has left, and there
  // it is a second choice under Remove rather than a second button beside it.
  const pooled = alone && remove !== undefined;
  if (rarities.length === 0 && !pooled && purge === undefined) return null;

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
                // The colour it will paint, so the list reads as the ladder.
                // Common has none anywhere and falls through to the ink.
                style={{ "--choice": rarityColour(rarity) } as CSSProperties}
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

      {!pooled ? (
        purge === undefined ? null : (
          <button
            type="button"
            className="loadout__cardremove"
            onClick={() => purge(view.trait)}
          >
            Remove
          </button>
        )
      ) : (
        <HoverMenu label="Remove" className="cardmenu" onHover={false}>
          {(close) => (
            <>
              {purge === undefined ? null : (
                <button
                  type="button"
                  onClick={() => {
                    purge(view.trait);
                    close();
                  }}
                >
                  Remove
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  remove(view.trait);
                  close();
                }}
              >
                Remove boon and god from pool
              </button>
            </>
          )}
        </HoverMenu>
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
  slot,
  onHover,
  onClose,
  actions = {},
}: {
  readonly entry: LoadoutEntry;
  readonly detail: NodeDetail;
  readonly front: boolean;
  /** The last boon the run holds from this god, which is when the two removals differ. */
  readonly alone: boolean;
  /** Where it sits in the stack, which is the band the stylesheet gives it. */
  readonly slot: number;
  readonly onHover: () => void;
  readonly onClose: () => void;
  readonly actions?: BoonActions | undefined;
}) {
  const { view, overridden = false } = entry;

  return (
    <article
      className="loadout__card"
      data-state={view.state}
      data-front={front ? "true" : undefined}
      style={{ "--slot": String(slot) } as CSSProperties}
      // The card answers the pointer as well as its tile: a squeezed stack
      // shows little more than a name, and the card is the bigger target.
      onMouseEnter={onHover}
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
