import { type CSSProperties, useId } from "react";
import { ElementArt, GodArt, WeaponArt } from "./boon-art.js";
import { NodeBox } from "./boon-node.js";
import { useDialog } from "./dialog.js";
import { godColour } from "./god-palette.js";
import { UNAFFILIATED } from "./messages.js";
import type { NodeView } from "./node-view.js";
import { useGame, useLadder } from "./presentation.js";
import type { FinishedRun, FinishedRunGroup } from "./finished-run.js";

/**
 * The run that was filed last, drawn after the games' own results screen: what
 * the run held, grouped the way the run collected it.
 *
 * It says nothing about how the run ended, because nothing in the model knows:
 * the app never sees the game and a manual source has never been asked.
 *
 * One view for both games, and the only content that differs is the element row,
 * which Hades I has no system for.
 */
export interface RunOverviewProps {
  readonly run: FinishedRun;
  readonly onClose: () => void;
}

export function RunOverview({ run, onClose }: RunOverviewProps) {
  const game = useGame();
  const { ref, onKeyDown } = useDialog(onClose);
  const titleId = useId();

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
          <Stat
            label="Goals"
            value={run.goals === 0 ? "—" : `${run.goalsMet}/${run.goals}`}
          />
        </dl>

        {run.weapon === null ? null : (
          <section className="overview__kit">
            <h3>Weapon</h3>
            <p className="overview__weapon">
              <WeaponArt game={game} weapon={run.weapon.weapon} className="overview__wpnart" />
              <span>{run.weapon.name}</span>
            </p>
            {run.weapon.form === null ? null : <Tile view={run.weapon.form} />}
          </section>
        )}

        {run.elements.length === 0 ? null : (
          <section className="overview__elements">
            <h3>Elements</h3>
            <ul>
              {run.elements.map(({ element, count }) => (
                <li key={element}>
                  <ElementArt game={game} element={element} className="overview__elmart" />
                  <span>
                    {element} {count}
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
          run.groups.map((group) => <Group key={group.key} group={group} />)
        )}

        <div className="overview__actions">
          {/* One control for now. The image export is the other half of these
              actions and lands with it. */}
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
 */
function Group({ group }: { readonly group: FinishedRunGroup }) {
  const game = useGame();

  return (
    <section
      className="overview__group"
      style={{ "--god": godColour(group.god) } as CSSProperties}
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
        {group.boons.map((view) => (
          <li key={view.trait}>
            <Tile view={view} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A boon as this view draws one: the node's own artwork with the control taken
 * off, and its name beside it. Nothing here opens — the run is over, and the
 * questions the Action Sheet answers are about a run still being played.
 */
function Tile({ view }: { readonly view: NodeView }) {
  const game = useGame();
  const ladder = useLadder();

  return (
    <span className="overview__tile">
      <span
        className="overview__tileicon node"
        data-game={game}
        data-ladder={ladder}
        data-state={view.state}
        style={{ "--god": godColour(view.god) } as CSSProperties}
      >
        <NodeBox view={view} showElement={false} />
      </span>
      <span className="overview__tilename">{view.name}</span>
    </span>
  );
}
