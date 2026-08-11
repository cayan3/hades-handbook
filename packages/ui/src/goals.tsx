import { type BoonGestures, BoonNode } from "./boon-node.js";
import { stateSentence } from "./describe.js";
import type { NodeDetail, NodeView } from "./node-view.js";

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
        <p>Nothing pinned yet. Open a boon and set it as a goal to track what it needs.</p>
      </section>
    );
  }

  return (
    <section className="goals">
      <h2>Goals</h2>
      {bestNextPick == null ? null : (
        <p className="goals__best">
          Best next pick: <strong>{bestNextPick.name}</strong>
        </p>
      )}
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

  return (
    <article className="goal" data-state={view.state}>
      <div className="goal__head">
        <BoonNode view={view} pinned {...gestures} />
        <div className="goal__what">
          <h3 className="goal__name">{view.name}</h3>
          <p className="goal__state">{stateSentence(view.state)}</p>
        </div>
        {detail.rows.length === 0 ? null : (
          <p className="goal__progress">
            {met}/{detail.rows.length}
          </p>
        )}
      </div>

      {view.notice === null ? null : (
        <p className="goal__notice">
          {view.notice.lead === null ? null : <strong>{view.notice.lead}</strong>}
          {view.notice.lead === null ? view.notice.body : ` ${view.notice.body}`}
        </p>
      )}

      {detail.rows.length === 0 ? null : (
        <ul className="goal__rows">
          {detail.rows.map((row) => (
            <li key={row.text} className="goal__row" data-met={row.met}>
              {/* The state in words as well as in the fill, since the fill is
                  the thing a screen reader cannot see and a printout loses. */}
              <span className="visually-hidden">{row.met ? "Have: " : "Need: "}</span>
              {row.text}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
