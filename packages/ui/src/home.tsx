import type { GodId } from "@repo/core";
import { useState } from "react";
import { GodArt } from "./boon-art.js";
import { type Goal, goalProgress } from "./goals.js";
import { MARKING_HINT, UNAFFILIATED } from "./messages.js";
import { useGame } from "./presentation.js";

/**
 * The page behind the bar's first tab: what this run is, what is pinned, and
 * what the product is. Home is a thing in this product and not in either game,
 * so its icon is drawn here rather than resolved.
 */

export interface HomeProps {
  /** How many boons the run holds, which is the shortest true thing about it. */
  readonly held: number;
  /** The gods this run has met, and the way back to what was being read. */
  readonly pooled: readonly GodId[];
  readonly onGod: (god: GodId) => void;
  /** What is pinned, summarised the way the panel's own cards summarise it. */
  readonly goals: readonly Goal[];
  readonly onGoals: () => void;
  /** Opens the shortcut list, which the `?` key otherwise reaches alone. */
  readonly onShortcuts: () => void;
}

export function Home({ held, pooled, goals, onGod, onGoals, onShortcuts }: HomeProps) {
  return (
    <div className="home">
      <ThisRun held={held} pooled={pooled} onGod={onGod} />

      {/* Beside the region above it on a wide screen and under it on a narrow
          one, which is the split the app already makes. */}
      <section className="home__goals">
        <h3>Goals at a glance</h3>
        {goals.length === 0 ? (
          <p>Nothing pinned yet. Set a boon as a goal and its progress shows up here.</p>
        ) : (
          <>
            <ul className="home__goallist">
              {goals.map((goal) => {
                const { met, of, summary } = goalProgress(goal);
                return (
                  <li key={goal.view.trait} className="home__goal">
                    <span className="home__goalname">{goal.view.name}</span>
                    {/* The panel's own sentence and the panel's own count. A
                        second way of saying how far along is a second answer
                        waiting to disagree with the first. */}
                    <span className="home__goalsummary">{summary}</span>
                    {of === 0 ? null : (
                      <span className="home__goalcount">
                        {met}/{of}
                        <span className="visually-hidden"> requirements met</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <button type="button" className="home__opengoals" onClick={onGoals}>
              Open Goals
            </button>
          </>
        )}
      </section>

      {/* Last of the three regions: it has to be present and findable rather
          than in front of what a player came for. */}
      <section className="home__about">
        <h3>What this is</h3>
        <p>A planner for boon builds in Hades and Hades II.</p>
        <p>
          Mark what a run hands you and pin the boons you are working toward. Every
          surface then answers one question: what is still needed, what is already
          met, and what this run can no longer reach.
        </p>
        <p>
          Everything is typed in by hand and kept in this browser. Nothing is
          uploaded and there is no account.
        </p>
        <p>
          {/* The list is opened by `?` and by nothing else, which is what makes
              it free to a player who never presses a key — so the one visible
              way in belongs here rather than in the header. */}
          <button type="button" className="home__shortcuts" onClick={onShortcuts}>
            Keyboard shortcuts
          </button>
        </p>
        <p className="home__disclaimer">{UNAFFILIATED}</p>
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
  /** Reachable with a run in progress too, so it is a disclosure and not a state. */
  const [howTo, setHowTo] = useState(false);

  return (
    <section className="home__run">
      <h3>This run</h3>
      {held === 0 ? (
        <p>Nothing marked yet. Pick a god from the bar above to start.</p>
      ) : (
        <>
          <p className="home__resume">
            {countOf(held, "boon")} from {countOf(pooled.length, "god")}.
          </p>
          {/* The gods rather than the boons: what a player left off doing was
              reading one god's page, and the Loadout beside this already says
              what the run holds. */}
          <ul className="home__gods">
            {pooled.map((god) => (
              <li key={god}>
                <button type="button" className="home__god" onClick={() => onGod(god)}>
                  <GodArt game={game} god={god} className="home__godart" />
                  {god}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <button
        type="button"
        className="home__howto"
        aria-expanded={howTo}
        onClick={() => setHowTo(!howTo)}
      >
        Getting started
      </button>
      {/* Rendered or not, never `hidden`: that attribute is `display: none` in
          the user-agent sheet and any display on the element beats it. */}
      {!howTo ? null : (
        <div className="home__steps">
          <p>Pick a god from the bar to see everything they offer.</p>
          <p>{MARKING_HINT}</p>
          <p>
            A goal shows up under Goals with what it still needs, and the run saves
            itself as you go.
          </p>
        </div>
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
export function HomeGlyph({ className = "home__glyph" }: { readonly className?: string } = {}) {
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
