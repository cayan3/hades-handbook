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
import { kindWordColour, treatmentOf } from "./rarity-palette.js";

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
 * **The detail is part of this view rather than something it opens.** A finished
 * run is read to look things up in, so a tile says what it is on the pointer and
 * opens its Codex row on a click — the same row the Action Sheet and the Boon
 * Card draw.
 */
export interface RunOverviewProps {
  readonly run: FinishedRun;
  readonly onClose: () => void;
  /**
   * Puts the filed run back as the run in progress, where the caller offers it.
   * Absent where there is nothing to pick back up.
   */
  readonly onReopen?: (() => void) | undefined;
}

export function RunOverview({ run, onClose, onReopen }: RunOverviewProps) {
  const game = useGame();
  const { ref, onKeyDown } = useDialog(onClose);
  const titleId = useId();
  /* One at a time: two open rows push the groups under them apart twice over,
     and the question a player is asking is about one boon. */
  const [opened, setOpened] = useState<TraitId | null>(null);

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
          Your last run
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
                <ul className="overview__boons">
                  <li>
                    <Tile boon={run.weapon.form} opened={opened} onOpen={setOpened} />
                  </li>
                </ul>
                {run.weapon.form.view.trait !== opened ? null : (
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
            <Group key={group.key} group={group} opened={opened} onOpen={setOpened} />
          ))
        )}

        <div className="overview__actions">
          {onReopen === undefined ? null : (
            <button type="button" className="overview__reopen" onClick={onReopen}>
              Pick this run back up
            </button>
          )}
          {/* The image export is the other half of these actions and lands with
              it. */}
          <button type="button" className="overview__close" onClick={onClose}>
            Close
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
  opened,
  onOpen,
}: {
  readonly group: FinishedRunGroup;
  readonly opened: TraitId | null;
  readonly onOpen: (trait: TraitId | null) => void;
}) {
  const game = useGame();
  const open = group.boons.find((boon) => boon.view.trait === opened) ?? null;

  return (
    <section className="overview__group" style={{ "--god": godColour(group.god) } as CSSProperties}>
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
            <Tile boon={boon} opened={opened} onOpen={onOpen} />
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
 * The hue a tile carries, and the rule is the one the rest of the app follows on
 * a surface with no page god: a boon of a **kind** takes that kind's own colour
 * rather than a god's.
 *
 * A Duo is why this exists. It answers to two gods, so it has none of its own,
 * and inside a god's group it fell to the unassigned neutral — which reads as a
 * boon whose god the app could not work out. The Duo colour is the same on every
 * Duo, and that is exactly right here: what a Duo *is* is what this view is
 * naming.
 *
 * A god page differs on purpose and stays as it is. There a Duo takes its
 * *partner's* colour, which says more than the Duo colour can when one of its
 * two gods is the page you are already on.
 */
function tileColour(boon: FinishedBoon): string {
  return boon.view.kind === null ? godColour(boon.view.god) : kindWordColour(boon.view.kind);
}

/**
 * A boon as this view draws one: the node's own artwork with the control taken
 * off, its name beside it, and what it is on the pointer.
 *
 * A button, because the run being over does not make it inert — a finished run
 * is a thing to look up in, and the row underneath is what a player came back
 * for.
 */
function Tile({
  boon,
  opened,
  onOpen,
}: {
  readonly boon: FinishedBoon;
  readonly opened: TraitId | null;
  readonly onOpen: (trait: TraitId | null) => void;
}) {
  const game = useGame();
  const ladder = useLadder();
  const { view } = boon;
  const isOpen = opened === view.trait;

  return (
    <button
      type="button"
      className="overview__tile"
      data-open={isOpen ? "true" : undefined}
      aria-expanded={isOpen}
      title={tipFor(boon)}
      onClick={() => onOpen(isOpen ? null : view.trait)}
    >
      <span
        className="overview__tileicon node"
        data-game={game}
        data-ladder={ladder}
        data-state={view.state}
        style={{ "--god": tileColour(boon) } as CSSProperties}
      >
        <NodeBox view={view} showElement={false} />
      </span>
      <span className="overview__tilename">{view.name}</span>
    </button>
  );
}

/**
 * What the pointer gets without opening anything: the name, what it was taken
 * as, and how far it was levelled.
 *
 * **The level is written only past the first.** Every boon is level 1, so
 * saying so on all of them is noise around the two or three a player actually
 * poured a Pom into — and a hammer's rank arrives in the same field.
 */
function tipFor(boon: FinishedBoon): string {
  const treatment = treatmentOf(boon.view);
  const parts = [boon.view.name];
  if (treatment !== null) parts.push(treatment.word);
  if (boon.level > 1) parts.push(`Level ${boon.level}`);
  return parts.join(" — ");
}

/** The Codex row, which is the component the Action Sheet and the card draw. */
function Detail({ boon }: { readonly boon: FinishedBoon }) {
  return (
    <div className="overview__detail">
      <BoonRow
        view={boon.view}
        description={boon.detail.description}
        showElement={false}
        title={<h4 className="boonrow__title">{boon.view.name}</h4>}
      >
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
