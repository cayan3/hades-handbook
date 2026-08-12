import type { TraitId } from "@repo/core";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type BoonGestures, BoonNode } from "./boon-node.js";
import { type GodGraph, neighbourhood } from "./god-graph.js";
import { GOD_VIEW_ACCENT, godColour } from "./god-palette.js";
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
  const wires = graph.edges.filter((edge) => showAll || around.has(edge.id));

  return (
    <div className="godpage" ref={canvas}>
      {graph.edges.length === 0 ? null : (
        <label className="godpage__showall">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(event) => setShowAll(event.target.checked)}
          />
          Show all connections
        </label>
      )}

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
        {graph.bands.map((band) => (
          <li className="godpage__band" key={band.key} data-kind={band.kind}>
            {/* A tier band has no heading. The tier is the extraction's own
                rank, the game never shows a player a rank, and announcing it
                would tell a reader something no sighted player is told. The
                other bands are categories the game does name. */}
            {band.label === null ? null : <h3 className="godpage__bandname">{band.label}</h3>}

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
                      accent={partner === null ? GOD_VIEW_ACCENT : godColour(partner)}
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
 * A connector from the bottom of one endpoint to the top of the next.
 *
 * Curved rather than straight so that the ~5% of edges joining two nodes in the
 * same band bow clear of the row instead of striking through it; measured over
 * both catalogs, 43 of 859 do that and none runs upward.
 *
 * An unmeasured endpoint yields an empty path, which draws nothing. That is the
 * first frame, and it is also every frame under a test runner with no layout.
 */
function wire(from: Place | undefined, to: Place | undefined): string {
  if (from === undefined || to === undefined) return "";
  const drop = Math.max(14, (to.top - from.bottom) * 0.45);
  return `M ${from.x} ${from.bottom} C ${from.x} ${from.bottom + drop} ${to.x} ${to.top - drop} ${to.x} ${to.top}`;
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
