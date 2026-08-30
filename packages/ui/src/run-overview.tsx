import type { TraitId } from "@repo/core";
import { type CSSProperties, useId, useState } from "react";
import { ElementArt, GodArt, WeaponArt } from "./boon-art.js";
import { NodeBox } from "./boon-node.js";
import { BoonRow } from "./boon-row.js";
import { useDialog } from "./dialog.js";
import type { FinishedBoon, FinishedRun, FinishedRunGroup } from "./finished-run.js";
import { godColour } from "./god-palette.js";
import { UNAFFILIATED } from "./messages.js";
import { useGame, useLadder } from "./presentation.js";
import { boonAccent } from "./rarity-palette.js";

/**
 * The run that was filed last, drawn after the games' own results screen: what
 * the run held, grouped the way the run collected it.
 *
 * It says nothing about how the run ended, because nothing in the model knows:
 * the app never sees the game and a manual source has never been asked.
 *
 * One view for both games, and the only content that differs is the element row,
 * which Hades I has no system for.
 *
 * The detail is part of this view rather than something it opens: a finished run
 * is read to look things up in, so a tile answers on the pointer and opens its
 * Codex row on a click.
 */
export interface RunOverviewProps {
  readonly run: FinishedRun;
  /**
   * Goes into the run being looked at, making it the run in play.
   *
   * One meaning in both cases the caller has: the run already open, where it is
   * a plain dismissal, and a filed run, where going into it is what makes it
   * the open one. There is no *finished* run in the model — only the run in
   * whichever slot is open — so the label does not change with the case.
   *
   * **Null where the run cannot be resumed**, which is a filed run while
   * another is still in play: there is one active slot, so adopting over a run
   * somebody is playing would overwrite it. The source refuses this too, and a
   * control that is drawn and then throws is the half that was missing.
   */
  readonly onResume: (() => void) | null;
  /**
   * Back to the save screen, and Escape does the same. Always available: it is
   * the one way out that is safe whatever slot is open and whatever is in it.
   */
  readonly onSaveSlots: () => void;
}

/**
 * One tile's place in the view: which group it is drawn in, and which boon it
 * is. A Duo answers to two gods and is drawn under both, so the boon alone does
 * not name a tile.
 */
type Spot = string;

function spotOf(groupKey: string, trait: TraitId): Spot {
  return `${groupKey} ${trait}`;
}

/** The kit's own tile sits outside every group and needs a key of its own. */
const KIT = "kit";

export function RunOverview({ run, onResume, onSaveSlots }: RunOverviewProps) {
  const game = useGame();
  const { ref, onKeyDown } = useDialog(onSaveSlots);
  const titleId = useId();
  /**
   * The tile whose card is showing, and how it got there.
   *
   * Hovering shows a card and clicking holds it open, which is the Loadout's
   * own model: the pointer answers without committing to anything, and a click
   * is how you keep an answer while the pointer goes elsewhere. One at a time —
   * two open cards push the groups under them apart twice over, and the
   * question being asked is about one boon.
   *
   * Held as a **spot** rather than a trait id, because a Duo is drawn under
   * both of its gods: keyed on the id alone, one click opened its card in both
   * groups at once, which is the opposite of the one-at-a-time rule above.
   */
  const [opened, setOpened] = useState<Spot | null>(null);
  const [hovered, setHovered] = useState<Spot | null>(null);
  const showing = opened ?? hovered;

  /**
   * Clicking an open tile closes it, and drops the hover with it: the pointer
   * is still on the tile that was clicked, so otherwise the hover rule puts the
   * card straight back and the second click looks like it did nothing. The
   * Loadout learned the same thing.
   */
  const toggle = (spot: Spot): void => {
    if (opened === spot) {
      setOpened(null);
      setHovered(null);
      return;
    }
    setOpened(spot);
  };

  return (
    <div className="sheet-scrim" onKeyDown={onKeyDown}>
      <div
        className="overview"
        data-game={game}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 className="overview__title" id={titleId}>
          Run Overview
        </h2>

        <dl className="overview__stats">
          <Stat label="Boons" value={String(run.held)} />
          <Stat label="Gods met" value={String(run.gods)} />
          <Stat label="Goals" value={run.goals === 0 ? "—" : `${run.goalsMet}/${run.goals}`} />
        </dl>

        {run.weapon === null ? null : (
          <section className="overview__kit">
            <h3>Weapon</h3>
            <p className="overview__weapon">
              <WeaponArt game={game} weapon={run.weapon.weapon} className="overview__wpnart" />
              <span>{run.weapon.name}</span>
            </p>
            {run.weapon.form === null ? null : (
              <>
                <ul className="overview__boons" onMouseLeave={() => setHovered(null)}>
                  <li>
                    <Tile
                      boon={run.weapon.form}
                      spot={spotOf(KIT, run.weapon.form.view.trait)}
                      showing={showing}
                      opened={opened}
                      onToggle={toggle}
                      onHover={setHovered}
                    />
                  </li>
                </ul>
                {spotOf(KIT, run.weapon.form.view.trait) !== showing ? null : (
                  <Detail boon={run.weapon.form} />
                )}
              </>
            )}
          </section>
        )}

        {run.elements.length === 0 ? null : (
          <section className="overview__elements">
            <h3>Elements</h3>
            {/* The symbol and the number. Five marks and five counts say it
                already, so the word is carried for a reader who gets no symbol
                rather than drawn beside one. */}
            <ul>
              {run.elements.map(({ element, count }) => (
                <li key={element}>
                  <ElementArt game={game} element={element} className="overview__elmart" />
                  <span aria-hidden="true">{count}</span>
                  <span className="visually-hidden">
                    {element}: {count}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {run.groups.length === 0 ? (
          /* A run with pins and no boons is a real run: ending one is allowed
             precisely because somebody put the pins there. So it reads as
             itself rather than as a page with a section missing. */
          <p className="overview__nothing">This run held no boons.</p>
        ) : (
          run.groups.map((group) => (
            <Group
              key={group.key}
              group={group}
              showing={showing}
              opened={opened}
              onToggle={toggle}
              onHover={setHovered}
            />
          ))
        )}

        {/* Neither hides anything behind it. There is no *start a new run*
            here: it only ever put the save screen up, which is what the control
            beside it does, so two buttons carried one behaviour. Starting a run
            is a thing you choose at the door, among the slots. */}
        <div className="overview__actions">
          {/* Withheld rather than disabled where the run cannot be picked up:
              a greyed control on a screen reached from a save slot reads as
              this run being damaged, when what is true is that another run is
              still in play. */}
          {onResume === null ? null : (
            <button type="button" className="overview__close" onClick={onResume}>
              Resume this run
            </button>
          )}
          <button type="button" className="overview__slots" onClick={onSaveSlots}>
            Back to save slots
          </button>
        </div>

        {/* The one place this product's disclaimer leaves the site, an exported
            screenshot carrying whatever the view drew. One constant, so it
            cannot say something different here than on the front page. */}
        <p className="overview__unaffiliated">{UNAFFILIATED}</p>
      </div>
    </div>
  );
}

/** One count, in the label-above-value arrangement both games' screens use. */
function Stat({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="overview__stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/**
 * One heading and its boons. A god's heading takes the god's own colour, the
 * same one their tab and their page carry; a weapon's has none to take.
 *
 * A Duo appears under both of its gods, so a group's boons can total more than
 * the count above them — which is the member lists' own rule and what every
 * other surface here does.
 */
function Group({
  group,
  showing,
  opened,
  onToggle,
  onHover,
}: {
  readonly group: FinishedRunGroup;
  readonly showing: Spot | null;
  readonly opened: Spot | null;
  readonly onToggle: (spot: Spot) => void;
  readonly onHover: (spot: Spot | null) => void;
}) {
  const game = useGame();
  const open =
    group.boons.find((boon) => spotOf(group.key, boon.view.trait) === showing) ?? null;

  return (
    <section
      className="overview__group"
      style={{ "--god": godColour(group.god) } as CSSProperties}
      /* The leave belongs to the whole group, never to a tile. Per tile there
         is a render between one leaving and the next arriving, so the card
         unmounts and comes back and the run flickers as the pointer crosses it.
         Here, moving between tiles never leaves, and the card under them swaps
         in place. */
      onMouseLeave={() => onHover(null)}
    >
      <h3 className="overview__groupname">
        {group.god === null ? (
          group.weapon === null ? null : (
            <WeaponArt game={game} weapon={group.weapon} className="overview__groupart" />
          )
        ) : (
          <GodArt game={game} god={group.god} className="overview__groupart" />
        )}
        {group.label}
      </h3>
      <ul className="overview__boons">
        {group.boons.map((boon) => (
          <li key={boon.view.trait}>
            <Tile
              boon={boon}
              spot={spotOf(group.key, boon.view.trait)}
              showing={showing}
              opened={opened}
              onToggle={onToggle}
              onHover={onHover}
            />
          </li>
        ))}
      </ul>
      {/* Under the whole row rather than beside the tile, so opening one does
          not reflow the grid it sits in. */}
      {open === null ? null : <Detail boon={open} />}
    </section>
  );
}

/**
 * A boon as this view draws one: the node's own artwork with the control taken
 * off, and its name beside it.
 *
 * A button, because the run being over does not make it inert. The pointer shows
 * the card and a click holds it there.
 *
 * Focus deliberately does not show it, as in the Loadout: the dialog moves
 * focus to its first control on open, and that is the first tile — so a card
 * sprang open on a view nobody had pointed at anything in. A keyboard reaches
 * the same card by pressing the button.
 *
 * No `title`: a native tooltip saying less, slower, over a card is two answers
 * to one question and the slower one lands on top.
 */
function Tile({
  boon,
  spot,
  showing,
  opened,
  onToggle,
  onHover,
}: {
  readonly boon: FinishedBoon;
  readonly spot: Spot;
  readonly showing: Spot | null;
  readonly opened: Spot | null;
  readonly onToggle: (spot: Spot) => void;
  readonly onHover: (spot: Spot | null) => void;
}) {
  const game = useGame();
  const ladder = useLadder();
  const { view } = boon;
  const isOpen = opened === spot;

  return (
    <button
      type="button"
      className="overview__tile"
      data-open={isOpen ? "true" : undefined}
      data-showing={showing === spot ? "true" : undefined}
      aria-expanded={showing === spot}
      onMouseEnter={() => onHover(spot)}
      onClick={() => onToggle(spot)}
    >
      <span
        className="overview__tileicon node"
        data-game={game}
        data-ladder={ladder}
        data-state={view.state}
        style={{ "--god": boonAccent(view) } as CSSProperties}
      >
        <NodeBox view={view} showElement={false} />
      </span>
      <span className="overview__tilename">{view.name}</span>
    </button>
  );
}

/**
 * The Codex row, which is the component the Action Sheet and the Loadout's own
 * card draw. Rarity or kind rides on the row already; the level is this view's
 * to add, nothing else having a run to read it from.
 *
 * **The level is written only past the first.** Every boon is level 1, so
 * saying so on all of them is noise around the two or three a player actually
 * poured a Pom into — and a hammer's rank arrives in the same field.
 */
function Detail({ boon }: { readonly boon: FinishedBoon }) {
  return (
    <div className="overview__detail">
      <BoonRow
        view={boon.view}
        description={boon.detail.description}
        showElement={false}
        title={<h4 className="boonrow__title">{boon.view.name}</h4>}
      >
        {boon.level > 1 ? <p className="overview__level">Level {boon.level}</p> : null}
        {boon.detail.activation.length === 0 ? null : (
          <ul className="overview__activation">
            {boon.detail.activation.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </BoonRow>
    </div>
  );
}
