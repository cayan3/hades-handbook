import type { KeyboardEvent } from "react";
import { GodArt } from "./boon-art.js";
import { type BoonGestures, BoonNode } from "./boon-node.js";
import { MarkerGlyph } from "./glyphs.js";
import { useHoverDisclosure } from "./hover-disclosure.js";
import { GOAL_KEY, focusMember, isGoalKey, memberAt, stepFor, stepIndex } from "./keys.js";
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
  /**
   * The boon advancing the most goals at once, where one does — the view for its
   * name, and how many of the pins it is a step toward.
   */
  readonly bestNextPick?: (NodeView & { readonly serves?: number }) | null;
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

  /**
   * The arrows step between cards rather than between every control inside one:
   * a card holds a node and, once a goal is met, nothing else worth stopping at,
   * so stepping control by control is what Tab already does.
   */
  function walk(event: KeyboardEvent<HTMLElement>): void {
    const step = stepFor(event);
    const root = event.currentTarget;
    const from = step === null ? null : memberAt(event.target, "data-trait");
    if (step === null || from === null) return;

    const traits = goals.map((goal) => goal.view.trait);
    const next = traits[stepIndex(traits.indexOf(from), step, traits.length)];
    if (next === undefined || !focusMember(root, "data-trait", next)) return;
    event.preventDefault();
  }

  return (
    <section className="goals" onKeyDown={walk}>
      <h2>Goals</h2>
      {bestNextPick == null ? null : (
        /* The one boon that moves the most of these at once. A reading of the
           pins rather than a control: taking it is still a mark on the boon
           itself, wherever the player meets it. It names how many goals it
           serves, because that is the whole of why it is being suggested. */
        <p className="goals__best">
          Best next pick: <strong>{bestNextPick.name}</strong>
          {bestNextPick.serves === undefined ? null : (
            <span className="goals__serves"> — a step toward {bestNextPick.serves} of these</span>
          )}
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
  const done = detail.rows.length > 0 && met === detail.rows.length;
  const { onGoal } = gestures;
  /**
   * The requirements are behind a hover, so a resting panel is one line per
   * goal and a glance answers "how far along" without answering "how" for all
   * of them at once. Focus counts as hover, which is the rule this panel's
   * neighbours already follow — and it is the hook rather than a fifth copy of
   * those rules.
   */
  const { open, wrapper } = useHoverDisclosure();

  return (
    <article
      className="goal"
      data-state={view.state}
      data-trait={view.trait}
      data-open={open ? "true" : undefined}
      {...wrapper}
      /* The goal key works anywhere in the card, not only on its node: the card
         is what a keyboard steps between, and the node inside it is one stop of
         several. Clearing a goal from the surface that lists them is the
         shortest path there is. */
      onKeyDown={(event) => {
        wrapper.onKeyDown(event);
        // The node inside the card takes the same key and gets there first;
        // without this the press would clear the goal and set it again on the
        // way up.
        if (onGoal === undefined || event.defaultPrevented || !isGoalKey(event)) return;
        event.preventDefault();
        onGoal(view.trait);
      }}
    >
      <div className="goal__head">
        {/* No name under it: the card's own title is the name, and drawing it
            twice is the second copy going out of step with the first. */}
        <BoonNode view={view} pinned showName={false} {...gestures} />
        <div className="goal__what">
          <h3 className="goal__name">
            {view.name}
            {view.state === "Obtained" ? <span className="goal__held">(Held)</span> : null}
          </h3>
          <p className="goal__summary">{summaryOf(detail, done)}</p>
        </div>
        <div className="goal__status">
          {/* The pin, in the card's own corner, carrying whether the goal is
              finished — filled and green when it is, outline and purple while
              it is not. Hidden from a reader: the summary beside it says the
              same thing in words, and hearing it twice is worse than once. */}
          <span className="goal__marker" data-met={done} aria-hidden="true">
            <MarkerGlyph filled={done} />
          </span>
          {detail.rows.length === 0 ? null : (
            <p className="goal__progress">
              {met}/{detail.rows.length}
              <span className="visually-hidden"> requirements met</span>
            </p>
          )}
        </div>
      </div>

      {/* Drawn whether or not the card is open. A hard verdict on something the
          player asked to be reminded of is not a thing to put behind a hover,
          and the lead is required copy. */}
      {view.notice === null ? null : (
        <p className="goal__notice">
          {view.notice.lead === null ? null : <strong>{view.notice.lead}</strong>}
          {view.notice.lead === null ? view.notice.body : ` ${view.notice.body}`}
        </p>
      )}

      {detail.rows.length === 0 ? null : (
        <ul className="goal__rows" hidden={!open}>
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
 * The collapsed card's one line: what this goal is still waiting for, named
 * rather than counted — the count is the `n/m` beside it, and two ways of
 * saying "three left" is one of them wasted.
 *
 * Short forms rather than the rows' own sentences: a row reading "any 1 of:
 * Wave Pounding, Sunken Treasure, Ocean's Bounty" is right in the list and is a
 * paragraph on one line here.
 */
function summaryOf(detail: NodeDetail, done: boolean): string {
  if (detail.rows.length === 0) return "No requirements.";
  if (done) return "All requirements met.";
  const left = detail.rows.filter((row) => !row.met).map(shortOf);
  return `Still needed: ${left.join(", ")}`;
}

/** One unmet requirement in as few words as it can be said. */
function shortOf(row: RequirementRow): string {
  const only = row.options.length === 1 ? row.options[0] : undefined;
  if (only !== undefined) return only.name;
  // A god's own boons collapse to the god, which is the whole of what a choice
  // between five of them asks for.
  if (row.god !== null) {
    return row.need === 1 ? `a ${row.god} boon` : `${row.need} ${row.god} boons`;
  }
  // An element count, a keepsake, a god in the pool: the sentence is already
  // short because it names one thing.
  return row.text;
}

/**
 * One part of the gate, drawn the way both games draw their own requirement
 * panel: the god's symbol, a heading saying how many of the list are wanted, and
 * the boons under it lit where the run holds one.
 *
 * A part naming no boon — an element count, a keepsake, a god in the pool —
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
