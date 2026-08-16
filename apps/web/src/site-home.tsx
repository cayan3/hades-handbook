import { UNAFFILIATED } from "@repo/ui";

/**
 * The page the product's own name leads to — the site's front, as against the
 * per-game Home tab, which is about one run.
 *
 * The shell only. What belongs in the middle is a description of the product as
 * a whole rather than a summary of the two games, and it is the user's to write,
 * so the one sentence here is the product's own from the app manifest.
 */
export function SiteHome() {
  return (
    <main className="site">
      <h1>Hades Handbook</h1>
      <p className="site__lead">Plan and track boon builds in Hades and Hades II.</p>

      <p>
        <a className="site__enter" href="#/">
          Open the Handbook
        </a>
      </p>

      <p className="site__disclaimer">{UNAFFILIATED}</p>
    </main>
  );
}
