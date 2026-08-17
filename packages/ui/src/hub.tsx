import type { GodId } from "@repo/core";
import { GodArt } from "./boon-art.js";
import { type Goal, goalProgress } from "./goals.js";
import { useGame } from "./presentation.js";

/**
 * The page behind the bar's first tab: what this run is, and what is pinned, and
 * nothing else — the overview and the disclaimer are the site's front page, and
 * how to use the thing is the Help popup. The Hub is a thing in this product and
 * not in either game, so its icon is drawn here rather than resolved.
 */

export interface HubProps {
  /** How many boons the run holds, which is the shortest true thing about it. */
  readonly held: number;
  /** The gods this run has met, and the way back to what was being read. */
  readonly pooled: readonly GodId[];
  readonly onGod: (god: GodId) => void;
  /** What is pinned, summarised the way the panel's own cards summarise it. */
  readonly goals: readonly Goal[];
  readonly onGoals: () => void;
}

export function Hub({ held, pooled, goals, onGod, onGoals }: HubProps) {
  return (
    <div className="hub">
      <ThisRun held={held} pooled={pooled} onGod={onGod} />

      {/* Beside the region above it on a wide screen and under it on a narrow
          one, which is the split the app already makes. */}
      <section className="hub__goals">
        <h3>Goals at a glance</h3>
        {goals.length === 0 ? (
          <p>Nothing pinned yet. Set a boon as a goal and its progress shows up here.</p>
        ) : (
          <>
            <ul className="hub__goallist">
              {goals.map((goal) => {
                const { met, of, summary } = goalProgress(goal);
                return (
                  <li key={goal.view.trait} className="hub__goal">
                    <span className="hub__goalname">{goal.view.name}</span>
                    {/* The panel's own sentence and the panel's own count. A
                        second way of saying how far along is a second answer
                        waiting to disagree with the first. */}
                    <span className="hub__goalsummary">{summary}</span>
                    {of === 0 ? null : (
                      <span className="hub__goalcount">
                        {met}/{of}
                        <span className="visually-hidden"> requirements met</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <button type="button" className="hub__opengoals" onClick={onGoals}>
              Open Goals
            </button>
          </>
        )}
      </section>

    </div>
  );
}

/**
 * One region in two states rather than two views: a run that has started and
 * one that has not are the same question answered differently, and two surfaces
 * over one run is how a pair of them goes out of step.
 */
function ThisRun({
  held,
  pooled,
  onGod,
}: {
  readonly held: number;
  readonly pooled: readonly GodId[];
  readonly onGod: (god: GodId) => void;
}) {
  const game = useGame();

  return (
    <section className="hub__run">
      <h3>This run</h3>
      {held === 0 ? (
        <p>Nothing marked yet. Pick a god from the bar above to start.</p>
      ) : (
        <>
          <p className="hub__resume">
            {countOf(held, "boon")} from {countOf(pooled.length, "god")}.
          </p>
          {/* The gods rather than the boons: what a player left off doing was
              reading one god's page, and the Loadout beside this already says
              what the run holds. */}
          <ul className="hub__gods">
            {pooled.map((god) => (
              <li key={god}>
                <button type="button" className="hub__god" onClick={() => onGod(god)}>
                  <GodArt game={game} god={god} className="hub__godart" />
                  {god}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

    </section>
  );
}

/** "1 boon", "3 boons" — the plural is regular for both words this takes. */
function countOf(many: number, thing: string): string {
  return `${many} ${thing}${many === 1 ? "" : "s"}`;
}

/**
 * A codex, drawn: the product's own metaphor, and a mark that survives the
 * shipped art being withdrawn because it was never part of it.
 */
export function HubGlyph({ className = "hub__glyph" }: { readonly className?: string } = {}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 6.4C9.8 4.9 7 4.4 3.8 4.8v13.1c3.2-.4 6 .1 8.2 1.6 2.2-1.5 5-2 8.2-1.6V4.8c-3.2-.4-6 .1-8.2 1.6Z" />
      <path d="M12 6.4v13.1" />
    </svg>
  );
}
