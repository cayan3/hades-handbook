import { UNAFFILIATED } from "@repo/ui";

/**
 * The page the product's own name leads to — the site's front, as against the
 * per-game **Hub** tab, which is about one run.
 *
 * The shell only. What belongs in the middle is a description of the product as
 * a whole rather than a summary of the two games, and it is the user's to write,
 * so the one sentence here is the product's own from the app manifest.
 */
export function Home() {
  return (
    <main className="home">
      <h1>Hades Handbook</h1>
      <p className="home__lead">Plan and track boon builds in Hades and Hades II.</p>

      <p>
        <a className="home__enter" href="#/">
          Open the Handbook
        </a>
      </p>

      <p className="home__disclaimer">{UNAFFILIATED}</p>
    </main>
  );
}
