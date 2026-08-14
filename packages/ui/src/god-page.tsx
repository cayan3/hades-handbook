import type { TraitId } from "@repo/core";
import { type CSSProperties, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type BoonGestures, BoonNode } from "./boon-node.js";
import { endpointOwner, type GodGraph, neighbourhood } from "./god-graph.js";
import { godColour } from "./god-palette.js";
import { Junction } from "./junction.js";
import type { NodeView } from "./node-view.js";
import { kindOutlineColour } from "./rarity-palette.js";

/**
 * One god's boons as a vertical tiered graph: tier 1 on top, each lower tier
 * below, connectors running downward. Above comes before below, which scrolls
 * well on a phone.
 *
 * The bands are ordinary flow layout; the connectors are measured and traced
 * over them afterwards. A band can be sixteen nodes wide and has to wrap, and
 * only the browser knows where — computing positions here would mean owning the
 * width, and there goes the responsive layout.
 *
 * Nothing sets a tab index, so reading order is the order it is drawn in. A
 * laid-out canvas is the usual place to lose that.
 */
export interface GodPageProps extends BoonGestures {
  readonly graph: GodGraph;
  /** One per trait the graph carries; `graphTraits` is the list to build it from. */
  readonly views: ReadonlyMap<TraitId, NodeView>;
  /** Which boons are pinned to a goal. Intent, so it is passed and never derived. */
  readonly pinned?: ReadonlySet<TraitId>;
  /**
   * A name for a trait that is not a node on this page — today, the Hex a
   * Godsent Hex is granted for. Supplied rather than looked up here, so the
   * shipped text stays behind the catalog's own resolver.
   */
  readonly nameOf: (trait: TraitId) => string;
}

/** Where an endpoint sits, in the canvas's own pixels. */
interface Place {
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
}

const NOWHERE: ReadonlyMap<string, Place> = new Map();

export function GodPage({ graph, views, pinned, nameOf, ...gestures }: GodPageProps) {
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
      const shape = cell.querySelector(".node__box") ?? cell;
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

  // Anything that changes which endpoints exist, or where they are. Revealing
  // the rim is one of them and the graph does not change when it happens, so
  // leaving it out meant the new nodes were never measured — the page only
  // recovered because it also got taller and the observer below noticed.
  useLayoutEffect(() => {
    measure();
  }, [measure, graph, showDuos]);

  // Set up once. Watching the canvas catches a rewrap, which is the case the
  // measurement cannot predict. Absent under the test runner, and its absence
  // is not a failure: the measurement above has already run.
  useLayoutEffect(() => {
    if (typeof ResizeObserver === "undefined" || canvas.current === null) return;
    const observer = new ResizeObserver(measure);
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [measure]);

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
            data-reached={edge.reached}
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
                    <Junction
                      status={junction.status}
                      min={junction.min}
                      of={junction.of}
                      reached={junction.reached}
                    />
                  </li>
                ))}
              </ul>
            )}

            <ul className="godpage__nodes">
              {band.members.map(({ trait, partner, kind, hex }) => {
                const view = views.get(trait);
                if (view === undefined) return null;
                // The rim is reached from two directions and this line says
                // which second one: the other god of a Duo, and the Hex a
                // Godsent Hex was granted for.
                const note =
                  partner !== null
                    ? `with ${partner}`
                    : hex === null
                      ? null
                      : `Godsent Hex for '${nameOf(hex)}'`;
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
                      // The three kinds that are not this god's ordinary reward
                      // and are not a Duo either. A Duo is left out here on
                      // purpose: its colour is the partner's, above, which says
                      // more on this page than the Duo colour would — the Duo
                      // colour is the same on every Duo, and which god the other
                      // half belongs to is the question a player is asking.
                      outline={kind === null ? undefined : kindOutlineColour(kind)}
                      // The line below already says "Godsent Hex", so the
                      // node's description does not say it a second time.
                      kindNamed={hex !== null}
                      {...gestures}
                    />
                    {/* Named in words and not only in the colour it carries,
                        since a hue is the one thing the linear surfaces cannot
                        repeat. */}
                    {note === null ? null : <span className="godpage__note">{note}</span>}
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
 * A connector, routed in right angles: down out of the source, across, down into
 * the target. Every segment is parallel or perpendicular to the rest, which is
 * what lets a fan of them read as a bus rather than as noise.
 *
 * The horizontal run sits halfway between the rows. For the ~5% of edges that
 * join two nodes in the same band there is no gap to sit in, so it drops clear
 * below them instead.
 *
 * An unmeasured endpoint gives an empty path, which draws nothing — the first
 * frame, and every frame under a runner with no layout.
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
