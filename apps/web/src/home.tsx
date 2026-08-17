import { UNAFFILIATED } from "@repo/ui";
import { SiteHeader } from "./header.js";
import { GAME_HASH, GETTING_STARTED_HASH } from "./route.js";

/**
 * The site's front, which the product's own name leads to — as against the
 * per-game **Hub**, which is a tab about one run.
 *
 * The overview is a placeholder. What belongs there is a description of the
 * product as a whole rather than a summary of the two games, and it is the
 * user's to write.
 */
export function Home() {
  return (
    <div className="app app--page">
      {/* No game, so the header ends in the way in rather than in the controls
          that act on a run. The product's name is the page's own title here. */}
      <SiteHeader game={null} />
      <main className="home">
        <p className="home__lead">Plan and track boon builds in Hades and Hades II.</p>

        <p className="home__disclaimer">{UNAFFILIATED}</p>

        <a className="home__started" href={GETTING_STARTED_HASH}>
          Getting started
        </a>

        {/* Two doors side by side, because neither game is the default one.
            Links rather than controls, so a player can bookmark the one they
            play. */}
        <nav className="home__games" aria-label="Choose a game">
          <a className="home__game" data-game="hades1" href={GAME_HASH.hades1}>
            <span className="home__mark" aria-hidden="true">
              I
            </span>
            Hades
          </a>
          <a className="home__game" data-game="hades2" href={GAME_HASH.hades2}>
            <span className="home__mark" aria-hidden="true">
              II
            </span>
            Hades II
          </a>
        </nav>
      </main>
    </div>
  );
}

/**
 * A page rather than the Help popup, and the difference is who it is for: this
 * explains the product to somebody who has not started, where Help answers a
 * question asked from inside a run.
 *
 * The shell only — its content is the user's.
 */
export function GettingStarted() {
  return (
    <div className="app app--page">
      <SiteHeader game={null} />
      <main className="home">
        <h1>Getting started</h1>
        <p className="home__lead">
          How to plan a run with the Handbook, from an empty run to a finished build.
        </p>
      </main>
    </div>
  );
}
