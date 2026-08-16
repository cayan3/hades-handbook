import { GodArt } from "./boon-art.js";
import { type BoonGestures, BoonNode } from "./boon-node.js";
import { stateSentence } from "./describe.js";
import { GOAL_KEY, isGoalKey } from "./keys.js";
import type { NodeDetail, NodeView, RequirementRow } from "./node-view.js";
import { useGame } from "./presentation.js";

/**
 * Goals, which is the phone's home and one half of the accessible path.
 *
 * A pinned Goal and its Forget-Me-Not entry are one object, so this is one
 * panel: the target, what it still asks for, and how far along it is. Being a
 * list rather than a graph is the point — anything reachable in the God View is
 * reachable here, which is the v1 commitment for anybody not navigating by
 * eye.
 *
 * Have and need are carried by fill against outline first and by colour second,
 * which is what makes the distinction survive both a colourblind reader and a
 * screen reader; each row also says which it is in words.
 */

export interface Goal {
  readonly view: NodeView;
  readonly detail: NodeDetail;
}

export interface GoalsPanelProps extends BoonGestures {
  readonly goals: readonly Goal[];
  /** The boon advancing the most goals at once, where one does. */
  readonly bestNextPick?: NodeView | null;
}

export function GoalsPanel({ goals, bestNextPick, ...gestures }: GoalsPanelProps) {
  if (goals.length === 0) {
    return (
      <section className="goals goals--empty">
        <h2>Goals</h2>
        <p>
          Nothing pinned yet. Open a boon and set it as a goal to track what it needs — a
          long press, a right-click, or <kbd>{GOAL_KEY}</kbd> with it focused.
        </p>
      </section>
    );
  }

  return (
    <section className="goals">
      <h2>Goals</h2>
      {bestNextPick == null ? null : (
        /* The one boon that moves the most of these at once. It is a reading of
           the pins rather than a control: taking it is still a mark on the boon
           itself, wherever the player meets it. */
        <p className="goals__best">
          Best next pick: <strong>{bestNextPick.name}</strong>
        </p>
      )}
      {/* Arrow keys step between cards, so the list says so once rather than
          every card repeating it. */}
      <ul className="goals__list">
        {goals.map((goal) => (
          <li key={goal.view.trait}>
            <GoalCard goal={goal} {...gestures} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GoalCard({ goal, ...gestures }: { readonly goal: Goal } & BoonGestures) {
  const { view, detail } = goal;
  const met = detail.rows.filter((row) => row.met).length;
  const { onGoal } = gestures;

  return (
    <article
      className="goal"
      data-state={view.state}
      data-trait={view.trait}
      /* The goal key works anywhere in the card, not only on its node: the card
         is what a keyboard steps between, and the node inside it is one stop of
         several. Clearing a goal from the surface that lists them is the shortest
         path there is. */
      onKeyDown={
        onGoal === undefined
          ? undefined
          : (event) => {
              if (!isGoalKey(event)) return;
              event.preventDefault();
              onGoal(view.trait);
            }
      }
    >
      <div className="goal__head">
        <BoonNode view={view} pinned {...gestures} />
        <div className="goal__what">
          <h3 className="goal__name">{view.name}</h3>
          <p className="goal__state">{stateSentence(view.state)}</p>
        </div>
        {detail.rows.length === 0 ? null : (
          <p className="goal__progress">
            {met}/{detail.rows.length}
            <span className="visually-hidden"> requirements met</span>
          </p>
        )}
      </div>

      {view.notice === null ? null : (
        <p className="goal__notice">
          {view.notice.lead === null ? null : <strong>{view.notice.lead}</strong>}
          {view.notice.lead === null ? view.notice.body : ` ${view.notice.body}`}
        </p>
      )}

      {detail.rows.length === 0 ? (
        /* The game's own empty state, and it is worth having: a goal with no
           gate is not a goal whose requirements failed to load. */
        <p className="goal__none">No requirements.</p>
      ) : (
        <ul className="goal__rows">
          {detail.rows.map((row) => (
            <li key={row.text} className="goal__row" data-met={row.met}>
              <RequirementRowView row={row} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

/**
 * One part of the gate, drawn the way both games draw their own requirement
 * panel: the god's symbol, a heading saying how many of the list are wanted, and
 * the boons under it lit where the run holds one.
 *
 * A part naming no boons — an element count, a keepsake, a god in the pool —
 * keeps the sentence it always had. Both games do the same: Hades I's mirror
 * requirement is one line reading "Stygian Soul Active".
 */
function RequirementRowView({ row }: { readonly row: RequirementRow }) {
  const game = useGame();

  if (row.options.length === 0) {
    return (
      <>
        <span className="visually-hidden">{row.met ? "Have: " : "Need: "}</span>
        <span className="goal__ask">{row.text}</span>
      </>
    );
  }

  return (
    <>
      <p className="goal__ask">
        {row.god === null ? null : <GodArt game={game} god={row.god} className="goal__godart" />}
        {headingFor(row)}
      </p>
      <ul className="goal__options">
        {row.options.map((option) => (
          <li key={option.trait} className="goal__option" data-held={option.held}>
            {/* The lit-against-dim treatment is the whole of what a sighted
                reader sees here, so the word goes beside it. */}
            <span className="visually-hidden">{option.held ? "Have: " : "Need: "}</span>
            {option.name}
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * The games word one-of-one and one-of-many differently, and copying that is
 * free: "The following" for a gate with a single answer, "One of the following"
 * for a choice. Nothing shipped asks for two — 0 of 110 gates in Hades I and 0
 * of 140 in Hades II — so the third phrasing is here for a patch rather than for
 * today's data.
 */
function headingFor(row: RequirementRow): string {
  if (row.options.length === 1) return "The following:";
  if (row.need === 1) return "One of the following:";
  return `Any ${row.need} of the following:`;
}
