import type { TraitId } from "@repo/core";
import { type CSSProperties, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type BoonGestures, BoonNode } from "./boon-node.js";
import { endpointOwner, type GodGraph, neighbourhood } from "./god-graph.js";
import { godColour } from "./god-palette.js";
import { Junction } from "./junction.js";
import type { NodeView } from "./node-view.js";

/**
 * One god's boons as a vertical tiered graph: tier 1 across the top, each lower
 * tier below it, connectors flowing downward from prerequisite to dependent.
 * Above comes before below, which reads at a glance and scrolls on a phone.
 *
 * The bands are ordinary flow layout and the connectors are traced over them
 * afterwards. That split is the whole design: a band of up to sixteen nodes has
 * to wrap on a narrow screen, and the browser is the only thing that knows
 * where the wrap lands. Computing positions here instead would mean owning the
 * wrap, which means owning the width, which is where a graph stops being
 * responsive.
 *
 * Nothing sets a tab index. Reading order is band order and band order is DOM
 * order, so the graph is traversable in the order it is drawn — which a canvas
 * is exactly the place to quietly lose.
 */
export interface GodPageProps extends BoonGestures {
  readonly graph: GodGraph;
  /** One per trait the graph carries; `graphTraits` is the list to build it from. */
  readonly views: ReadonlyMap<TraitId, NodeView>;
  /** Which boons are pinned to a goal. Intent, so it is passed and never derived. */
  readonly pinned?: ReadonlySet<TraitId>;
}

/** Where an endpoint sits, in the canvas's own pixels. */
interface Place {
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
}

const NOWHERE: ReadonlyMap<string, Place> = new Map();

export function GodPage({ graph, views, pinned, ...gestures }: GodPageProps) {
  const canvas = useRef<HTMLDivElement>(null);
  const [places, setPlaces] = useState(NOWHERE);
  /** The node the connectors are drawn around: whatever is hovered or focused. */
  const [selected, setSelected] = useState<TraitId | null>(null);
  const [showAll, setShowAll] = useState(false);
  /**
   * The rim is behind a control because it is the one band that is not this
   * god's ladder — a Duo and a Godsent Hex are both reached from two directions,
   * and a player reading one god's page is usually not reading them.
   */
  const [showDuos, setShowDuos] = useState(false);

  const measure = useCallback(() => {
    const root = canvas.current;
    if (root === null) return;

    const box = root.getBoundingClientRect();
    const next = new Map<string, Place>();
    for (const cell of root.querySelectorAll<HTMLElement>("[data-endpoint]")) {
      const id = cell.dataset["endpoint"];
      if (id === undefined) continue;
      // The diamond rather than the whole cell: the name sits under it, and a
      // wire leaving from below the name reads as leaving from nothing.
      const shape = cell.querySelector(".node__frame") ?? cell;
      const at = shape.getBoundingClientRect();
      next.set(id, {
        x: at.left - box.left + at.width / 2,
        top: at.top - box.top,
        bottom: at.bottom - box.top,
      });
    }
    // Bailing on an unchanged measurement is what stops this: the effect writes
    // state, state renders, the render re-measures.
    setPlaces((before) => (settled(before, next) ? before : next));
  }, []);

  useLayoutEffect(() => {
    measure();
    // Absent in the test environment, and its absence is not a failure — the
    // measurement above has already run once, and a page that never resizes is
    // the ordinary case.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    if (canvas.current !== null) observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [measure, graph]);

  const around = useMemo(() => neighbourhood(graph, selected), [graph, selected]);
  const bands = graph.bands.filter((band) => showDuos || band.kind !== "duo");
  const drawn = new Set(bands.flatMap((band) => band.members.map((member) => member.trait)));
  // A wire into a band nobody is showing has one end and would be drawn from
  // nowhere; the measurement would drop it anyway, and filtering says why.
  const wires = graph.edges.filter(
    (edge) =>
      (showAll || around.has(edge.id)) && drawn.has(endpointOwner(edge.from)) && drawn.has(endpointOwner(edge.to)),
  );

  const hasRim = graph.bands.some((band) => band.kind === "duo");

  return (
    <div
      className="godpage"
      ref={canvas}
      // Every node on this page belongs to this god, and the page says so in
      // that god's colour. Handed down as a property so the wires take it too.
      style={{ "--wire": godColour(graph.god) } as CSSProperties}
    >
      <div className="godpage__controls">
        {graph.edges.length === 0 ? null : (
          <label className="godpage__toggle">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(event) => setShowAll(event.target.checked)}
            />
            Show all connections
          </label>
        )}
        {!hasRim ? null : (
          <label className="godpage__toggle">
            <input
              type="checkbox"
              checked={showDuos}
              onChange={(event) => setShowDuos(event.target.checked)}
            />
            Show Duos
          </label>
        )}
      </div>

      {/*
       * The drawing, and only the drawing. Every relationship on it is written
       * out in words on the detail surface, so a reader loses nothing by never
       * meeting it — which is the promise the linear surfaces carry.
       */}
      <svg className="godpage__wires" aria-hidden="true">
        {wires.map((edge) => (
          <path
            key={edge.id}
            className="godpage__wire"
            data-taken={edge.taken}
            d={wire(places.get(edge.from), places.get(edge.to))}
          />
        ))}
      </svg>

      <ol className="godpage__bands">
        {bands.map((band) => (
          <li className="godpage__band" key={band.key} data-kind={band.kind}>
            {/* Named for a reader and not on the page. The headings were noise
                beside bands that carry none at all, and the arrangement already
                says what they said — to everyone except the reader who cannot
                see the arrangement, which is who this is for. A tier is named
                to nobody: it is the extraction's rank and the game shows a
                player no such thing. */}
            {band.label === null ? null : <h3 className="visually-hidden">{band.label}</h3>}

            {band.junctions.length === 0 ? null : (
              <ul className="godpage__junctions">
                {band.junctions.map((junction) => (
                  <li key={junction.id} data-endpoint={junction.id}>
                    <Junction status={junction.status} min={junction.min} of={junction.of} />
                  </li>
                ))}
              </ul>
            )}

            <ul className="godpage__nodes">
              {band.members.map(({ trait, partner }) => {
                const view = views.get(trait);
                if (view === undefined) return null;
                return (
                  <li
                    key={trait}
                    data-endpoint={trait}
                    // Selection lives on the cell rather than in the node,
                    // because which node a page is drawing around is a fact
                    // about the page. Focus counts as well as hover, or the
                    // connectors are a thing only a mouse can see.
                    onMouseEnter={() => setSelected(trait)}
                    onMouseLeave={() => setSelected((now) => (now === trait ? null : now))}
                    onFocus={() => setSelected(trait)}
                    onBlur={() => setSelected((now) => (now === trait ? null : now))}
                  >
                    <BoonNode
                      view={view}
                      pinned={pinned?.has(trait) ?? false}
                      // A Duo answers to two gods and one of them is not this
                      // page's, so it takes the *other* one's colour. Everything
                      // else has the page's god on the record already.
                      accent={partner === null ? undefined : godColour(partner)}
                      {...gestures}
                    />
                    {/* A Duo answers to two gods and this page is one of them.
                        Named in words and not only in the colour it carries,
                        since a hue is the one thing the linear surfaces cannot
                        repeat. */}
                    {partner === null ? null : (
                      <span className="godpage__partner">with {partner}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * A connector from the bottom of one endpoint to the top of the next, routed in
 * right angles: straight down out of the source, across, straight down into the
 * target. Every segment is parallel or perpendicular to every other, which is
 * what makes a fan of them readable — a bundle of curves at slightly different
 * angles reads as noise at this density, where a bundle of parallel lines reads
 * as a bus.
 *
 * The horizontal run sits midway between the two rows. Where the target is
 * beside rather than below the source — the ~5% of edges joining two nodes in
 * the same band — the midpoint is inside both, so the run is pushed clear below
 * them instead of drawn through them.
 *
 * An unmeasured endpoint yields an empty path, which draws nothing. That is the
 * first frame, and it is also every frame under a test runner with no layout.
 */
function wire(from: Place | undefined, to: Place | undefined): string {
  if (from === undefined || to === undefined) return "";
  const gap = to.top - from.bottom;
  const run = gap > 8 ? from.bottom + gap / 2 : from.bottom + 12;
  if (Math.abs(to.x - from.x) < 0.5) return `M ${from.x} ${from.bottom} L ${to.x} ${to.top}`;
  return `M ${from.x} ${from.bottom} L ${from.x} ${run} L ${to.x} ${run} L ${to.x} ${to.top}`;
}

function settled(before: ReadonlyMap<string, Place>, next: ReadonlyMap<string, Place>): boolean {
  if (before.size !== next.size) return false;
  for (const [id, place] of next) {
    const was = before.get(id);
    if (was === undefined) return false;
    if (was.x !== place.x || was.top !== place.top || was.bottom !== place.bottom) return false;
  }
  return true;
}
