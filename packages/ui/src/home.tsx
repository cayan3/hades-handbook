import { UNAFFILIATED } from "./messages.js";

/**
 * The page behind the bar's first tab: what this run is, what is pinned, and
 * what the product is. Home is a thing in this product and not in either game,
 * so its icon is drawn here rather than resolved.
 */

export interface HomeProps {
  /** Opens the shortcut list, which the `?` key otherwise reaches alone. */
  readonly onShortcuts: () => void;
}

export function Home({ onShortcuts }: HomeProps) {
  return (
    <div className="home">
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
