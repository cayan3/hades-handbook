/**
 * The component gallery — not the product and not a layout of it. The two layout
 * profiles, the god page, the goals panel and the run itself all arrive later;
 * this exists so the pieces they are built from can be looked at side by side in
 * every state the engine can produce, against runs written out by hand.
 *
 * No run-state source behind any of it. Nothing here opens a store or subscribes
 * to anything, so what is on screen is a function of the fixtures alone.
 */

import type { RunFacts, Status, TraitId } from "@repo/core";
import {
  ActionSheet,
  BoonNode,
  Junction,
  type NodeSource,
  NodePresentation,
  TierBands,
  createNodeCache,
  deriveNodeDetail,
  deriveNodeView,
} from "@repo/ui";
import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ACTIVE,
  DORMANT,
  FULL_POOL,
  LADDER,
  LIGHTNING_ROD,
  POOL_DEMO,
  SELF_HEALING,
  hades1,
  hades2,
} from "./fixtures.js";
import "@repo/ui/nodes.css";
import "./app.css";

/** One boon out of one run, opened. */
interface Opened {
  readonly source: NodeSource;
  readonly facts: RunFacts;
  readonly trait: TraitId;
}

function Gallery() {
  const [fallback, setFallback] = useState(false);
  const [opened, setOpened] = useState<Opened | null>(null);

  // One cache for the page, keyed on the facts object, so each run below is
  // derived once.
  const cache = useMemo(() => createNodeCache(hades1), []);

  const open = (source: NodeSource, facts: RunFacts) => (trait: TraitId) =>
    setOpened({ source, facts, trait });

  return (
    <NodePresentation ladder={fallback ? "fallback" : "real-art"}>
      <main className="gallery">
        <header className="gallery__head">
          <h1>Node gallery</h1>
          <p>
            Every state below is the engine's answer about a hand-written run, drawn against the
            shipped catalog and both games' real rules.
          </p>
          <label className="gallery__toggle">
            <input
              type="checkbox"
              checked={fallback}
              onChange={(event) => setFallback(event.target.checked)}
            />
            Fallback ladder (no artwork)
          </label>
        </header>

        <section>
          <h2>The five states</h2>
          <ul className="gallery__row">
            {LADDER.map(({ state, facts }) => (
              <li key={state}>
                <BoonNode
                  view={cache.viewOf(LIGHTNING_ROD, facts)}
                  onOpen={open(hades1, facts)}
                />
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Pinned, and owned but not active</h2>
          <ul className="gallery__row">
            <li>
              <BoonNode
                view={cache.viewOf(LIGHTNING_ROD, LADDER[0]!.facts)}
                pinned
                onOpen={open(hades1, LADDER[0]!.facts)}
              />
            </li>
            <li>
              <BoonNode
                view={deriveNodeView(hades2, SELF_HEALING, DORMANT)}
                onOpen={open(hades2, DORMANT)}
              />
            </li>
            <li>
              <BoonNode
                view={deriveNodeView(hades2, SELF_HEALING, ACTIVE)}
                onOpen={open(hades2, ACTIVE)}
              />
            </li>
          </ul>
        </section>

        <section>
          <h2>A full god pool</h2>
          <p className="gallery__note">
            The record is written by hand — no shipped record asks for a god to be in the pool —
            and the run is a real full pool that the shipped rules call full.
          </p>
          <ul className="gallery__row">
            <li>
              <BoonNode
                view={deriveNodeView(hades1, POOL_DEMO, FULL_POOL)}
                onOpen={open(hades1, FULL_POOL)}
              />
            </li>
          </ul>
        </section>

        <section>
          <h2>Junctions</h2>
          <ul className="gallery__row gallery__row--inline">
            {(["satisfied", "pending", "unsatisfiable"] as Array<Status["kind"]>).map((status) => (
              <li key={status}>
                <Junction status={status} min={1} of={5} />
                <span className="gallery__caption">{status}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Tier order</h2>
          <p className="gallery__note">Bands run top to bottom, and so does the tab order.</p>
          <TierBands
            views={APHRODITE.map((trait) => cache.viewOf(trait, LADDER[2]!.facts))}
            onOpen={open(hades1, LADDER[2]!.facts)}
          />
        </section>
      </main>

      {opened === null ? null : (
        <ActionSheet
          view={deriveNodeView(opened.source, opened.trait, opened.facts)}
          detail={deriveNodeDetail(
            opened.source,
            deriveNodeView(opened.source, opened.trait, opened.facts),
            opened.facts,
          )}
          onClose={() => setOpened(null)}
        />
      )}
    </NodePresentation>
  );
}

/** A few rungs of one god's ladder, enough to see the bands. */
const APHRODITE = [
  "AphroditeWeaponTrait",
  "AphroditeSecondaryTrait",
  "AphroditeWeakenTrait",
  "AphroditeDurationTrait",
  LIGHTNING_ROD,
] as TraitId[];

const host = document.getElementById("root");
if (host === null) throw new Error("no mount point");
createRoot(host).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);

/**
 * Registered from a module rather than a snippet written into the page, so the
 * built site needs no inline script and no policy exception for one. The dev
 * server has no generated worker to register.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
