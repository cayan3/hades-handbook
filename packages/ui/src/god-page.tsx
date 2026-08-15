import type { TraitId } from "@repo/core";
import {
  type CSSProperties,
  Fragment,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type BoonGestures, BoonNode } from "./boon-node.js";
import {
  endpointOwner,
  type GodGraph,
  type GraphEdge,
  isJunctionId,
  neighbourhood,
} from "./god-graph.js";
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

/**
 * Where an endpoint sits, in the canvas's own pixels.
 *
 * Two boxes in one. A wire *attaches* to the icon — `x`, `top`, `bottom` — since
 * one leaving from under the name reads as leaving from nothing. What it has to
 * *avoid* is the icon and the name together, which is wider and taller: names
 * measure 50 to 102px against a 62px icon, and nine segments on Hera were
 * drawn across one.
 */
export interface Place {
  readonly x: number;
  readonly top: number;
  readonly bottom: number;
  /** The wider of the icon and its name. */
  readonly left: number;
  readonly right: number;
  /** The name's bottom, or the icon's where a caller states no name. */
  readonly guard: number;
}

const NOWHERE: ReadonlyMap<string, Place> = new Map();

export function GodPage({ graph, views, pinned, nameOf, ...gestures }: GodPageProps) {
  const canvas = useRef<HTMLDivElement>(null);
  const [places, setPlaces] = useState(NOWHERE);
  /**
   * The endpoint the connectors are drawn around: whatever is hovered or
   * focused. A junction id as readily as a trait id — hovering one narrows the
   * picture to that gate, and `isJunctionId` is what tells the two apart.
   */
  const [selected, setSelected] = useState<string | null>(null);
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
      // A junction is a point, not a box. Its branches meet *on* it — the
      // diamond sits on the bar they converge along, which is what the
      // reference graphs draw — so top and bottom are both its centre and the
      // approach has no final drop to make.
      const middle = isJunctionId(id) ? (at.top + at.bottom) / 2 : null;
      // The name is what the guard adds. Not the whole cell, which is 120px
      // wide against a 142px pitch and would leave no clear column anywhere.
      const label = cell.querySelector(".node__name")?.getBoundingClientRect();
      next.set(id, {
        x: at.left - box.left + at.width / 2,
        left: Math.min(at.left, label?.left ?? at.left) - box.left,
        right: Math.max(at.right, label?.right ?? at.right) - box.left,
        top: (middle ?? at.top) - box.top,
        bottom: (middle ?? at.bottom) - box.top,
        guard: (middle ?? label?.bottom ?? at.bottom) - box.top,
      });
    }
    // Bailing on an unchanged measurement is what stops this: the effect writes
    // state, state renders, the render re-measures.
    setPlaces((before) => (settled(before, next) ? before : next));
  }, []);

  /**
   * Junctions standing for the same requirement, drawn once — and anywhere on
   * the page rather than within a band. Hera's *"any one of Hera's four core
   * boons"* gates two boons in one row and a third two rows below, and it is one
   * requirement wherever it is asked; keyed by band it drew twice.
   *
   * A grouping rather than a change to the graph: `endpointOwner` answers with a
   * junction's dependent, which the layering and the neighbourhood both walk, so
   * one junction serving two dependents would make that answer ambiguous.
   */
  const sameAsk = useMemo(() => {
    const branches = new Map<string, string[]>();
    for (const edge of graph.edges) {
      if (isJunctionId(edge.to)) branches.set(edge.to, [...(branches.get(edge.to) ?? []), edge.from]);
    }
    const first = new Map<string, string>();
    const canonical = new Map<string, string>();
    for (const band of graph.bands) {
      for (const junction of band.junctions) {
        const ask = [...(branches.get(junction.id) ?? [])].sort().join(",");
        const key = `${junction.min}/${junction.of}|${ask}`;
        const seen = first.get(key);
        if (seen === undefined) first.set(key, junction.id);
        canonical.set(junction.id, seen ?? junction.id);
      }
    }
    return canonical;
  }, [graph]);
  /** The endpoint a wire really meets, once the identical asks are one diamond. */
  const endpoint = useCallback((id: string) => sameAsk.get(id) ?? id, [sameAsk]);

  const junctionAt = useMemo(() => {
    const all = new Map<string, number>();
    for (const band of graph.bands) {
      const ids = band.junctions
        .map((junction) => junction.id)
        .filter((id) => endpoint(id) === id);
      for (const [id, x] of junctionPlaces(ids, graph.edges, places)) all.set(id, x);
    }
    return all;
  }, [graph, places, endpoint]);

  // Anything that changes which endpoints exist, or where they are. Revealing
  // the rim is one of them and the graph does not change when it happens, so
  // leaving it out meant the new nodes were never measured.
  //
  // Placing the junctions is the other, and it bites: it takes their row out of
  // the flow, lifting every band below by a few pixels. Left out, wires drew
  // 6px stale and ended inside the icon they pointed at. It settles because a
  // junction's place comes from the boons above it, never from another junction.
  useLayoutEffect(() => {
    measure();
  }, [measure, graph, showDuos, junctionAt]);

  // Set up once. Watching the canvas catches a rewrap, which is the case the
  // measurement cannot predict. Absent under the test runner, and its absence
  // is not a failure: the measurement above has already run.
  useLayoutEffect(() => {
    if (typeof ResizeObserver === "undefined" || canvas.current === null) return;
    const observer = new ResizeObserver(measure);
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [measure]);

  const around = useMemo(() => {
    if (selected === null || !isJunctionId(selected)) return neighbourhood(graph, selected);
    // A shared diamond stands for every gate it was drawn for, so hovering it
    // lights all of them rather than whichever one happens to own the id.
    const lit = new Set<string>();
    for (const [id, canonical] of sameAsk) {
      if (canonical !== selected) continue;
      for (const edge of neighbourhood(graph, id)) lit.add(edge);
    }
    return lit;
  }, [graph, selected, sameAsk]);
  const bands = graph.bands.filter((band) => showDuos || band.kind !== "duo");
  const drawn = new Set(bands.flatMap((band) => band.members.map((member) => member.trait)));
  // A wire into a band nobody is showing has one end and would be drawn from
  // nowhere; the measurement would drop it anyway, and filtering says why.
  const wires = graph.edges.filter(
    (edge) =>
      (showAll || around.has(edge.id)) && drawn.has(endpointOwner(edge.from)) && drawn.has(endpointOwner(edge.to)),
  );

  const hasRim = graph.bands.some((band) => band.kind === "duo");
  // Over every edge the graph has, not just the drawn ones: a bar's height
  // would otherwise move as the selection changed which of its siblings show.
  const grouped = useMemo(
    () => graph.edges.map((edge) => ({ ...edge, from: endpoint(edge.from), to: endpoint(edge.to) })),
    [graph.edges, endpoint],
  );
  const lanes = useMemo(() => lanesFor(grouped, places), [grouped, places]);
  // Every icon a run could cross, which is every node the page is drawing. A
  // junction is not one: it is small, a run reaching it is meant to touch it,
  // and treating it as an obstacle would push its own lines off it.
  const obstacles = useMemo(
    () => [...drawn].map((trait) => places.get(trait)).filter((p): p is Place => p !== undefined),
    [drawn, places],
  );

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
            d={wire(
              places.get(endpoint(edge.from)),
              places.get(endpoint(edge.to)),
              lanes.get(edge.id),
              obstacles,
            )}
          />
        ))}
      </svg>

      <ol className="godpage__bands">
        {bands.map((band) => (
          <Fragment key={band.key}>
            {/* A row of its own between two bands rather than the first thing
                inside the lower one. A junction belongs to the boons it gathers,
                so it is drawn under them and the gap goes below it — which is
                also where the game's own dependency charts put the bus. */}
            {band.junctions.length === 0 ? null : (
              <li className="godpage__branches">
                <ul className="godpage__junctions" data-placed={junctionAt.size > 0 || undefined}>
                  {band.junctions
                    .filter((junction) => endpoint(junction.id) === junction.id)
                    .map((junction) => (
                    <li
                      key={junction.id}
                      data-endpoint={junction.id}
                      // Over the middle of what feeds it, which needs the
                      // measurement — so a row with nothing measured yet falls
                      // back to the even spread the stylesheet gives it.
                      style={
                        junctionAt.has(junction.id)
                          ? ({ left: `${junctionAt.get(junction.id)}px` } as CSSProperties)
                          : undefined
                      }
                      // Hover only, and it stays that way: a junction is not a
                      // tab stop, and what it lights is a subset of what its
                      // dependent already lights, so a keyboard loses nothing by
                      // not having one more control to step through.
                      onMouseEnter={() => setSelected(junction.id)}
                      onMouseLeave={() =>
                        setSelected((now) => (now === junction.id ? null : now))
                      }
                    >
                      <Junction
                        status={junction.status}
                        min={junction.min}
                        of={junction.of}
                        // Any of the gates it stands for being in the run. The
                        // status is the requirement's and identical across them
                        // by construction; whether the boon at the far end is
                        // held is not, and belongs to the edge out anyway.
                        reached={band.junctions.some(
                          (other) => endpoint(other.id) === junction.id && other.reached,
                        )}
                      />
                    </li>
                  ))}
                </ul>
              </li>
            )}

            <li className="godpage__band" data-kind={band.kind}>
              {/* Named for a reader and not on the page. The headings were noise
                  beside bands that carry none at all, and the arrangement already
                  says what they said — to everyone except the reader who cannot
                  see the arrangement, which is who this is for. A tier is named
                  to nobody: it is the extraction's rank and the game shows a
                  player no such thing. */}
              {band.label === null ? null : <h3 className="visually-hidden">{band.label}</h3>}

              <ul className="godpage__nodes">
                {band.members.map(({ trait, partner, kind, hex, core }) => {
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
                      // The slots every run fills lead the top layer, and the
                      // rule between them and the rest is drawn off this: a
                      // core cell followed by one that is not.
                      data-core={core ? "true" : undefined}
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
                        // page's, so it takes the *other* one's colour.
                        // Everything else has the page's god on the record
                        // already.
                        accent={partner === null ? undefined : godColour(partner)}
                        // The three kinds that are not this god's ordinary
                        // reward and are not a Duo either. A Duo is left out
                        // here on purpose: its colour is the partner's, above,
                        // which says more on this page than the Duo colour
                        // would — the Duo colour is the same on every Duo, and
                        // which god the other half belongs to is the question a
                        // player is asking.
                        outline={kind === null ? undefined : kindOutlineColour(kind)}
                        // The line below already says "Godsent Hex", so the
                        // node's description does not say it a second time.
                        kindNamed={hex !== null}
                        {...gestures}
                      />
                      {/* Named in words and not only in the colour it carries,
                          since a hue is the one thing the linear surfaces
                          cannot repeat. */}
                      {note === null ? null : <span className="godpage__note">{note}</span>}
                    </li>
                  );
                })}
              </ul>
            </li>
          </Fragment>
        ))}
      </ol>
    </div>
  );
}

/**
 * How far a horizontal run keeps off an icon, and the step between two runs.
 *
 * 26 because the boon's name sits 6 to 21px under its icon and a bar was being
 * drawn straight through it — and because it is also the shortest segment a
 * right angle can be justified by, a 14px one reading as a slip rather than a
 * turn. Row gaps measured 57 to 105px, so the tightest still holds one bar.
 */
const CLEARANCE = 26;
const LANE = 9;
/** The least a junction keeps from its neighbour, centre to centre. */
const APART = 44;

/**
 * Where each junction sits: over the middle of the branches it gathers, so the
 * lines into it fan symmetrically instead of all leaning one way. Spread evenly
 * by flex they bore no relation to it — measured on Hera, six of them sat 61 to
 * 229px from the middle of what fed them.
 *
 * Two wanting one place are pushed apart in order, left to right then back, so
 * a crowded row spreads rather than piling up at one end. One row at a time:
 * separating every junction on the page together shoved Hera's lower row 118 to
 * 317px off its branches.
 */
export function junctionPlaces(
  ids: readonly string[],
  edges: readonly GraphEdge[],
  places: ReadonlyMap<string, Place>,
): ReadonlyMap<string, number> {
  const wanted: Array<{ id: string; x: number }> = [];
  for (const id of ids) {
    const branches = edges
      .filter((edge) => edge.to === id)
      .map((edge) => places.get(edge.from)?.x)
      .filter((x): x is number => x !== undefined);
    if (branches.length === 0) continue;
    wanted.push({ id, x: branches.reduce((sum, x) => sum + x, 0) / branches.length });
  }
  wanted.sort((a, b) => a.x - b.x);

  for (let i = 1; i < wanted.length; i += 1) {
    const left = wanted[i - 1]!;
    const here = wanted[i]!;
    if (here.x - left.x < APART) here.x = left.x + APART;
  }
  for (let i = wanted.length - 2; i >= 0; i -= 1) {
    const right = wanted[i + 1]!;
    const here = wanted[i]!;
    if (right.x - here.x < APART) here.x = right.x - APART;
  }
  return new Map(wanted.map(({ id, x }) => [id, x]));
}

/**
 * The height each wire's horizontal run sits at, by edge id.
 *
 * One bar per *target*, so everything feeding a node meets on one line and
 * drops into it once. Neighbouring targets take different heights: every wire
 * between two bands used to sit at the midpoint and the lot drew as one line.
 *
 * How many heights a row gets is what its gap can hold. Packing bars by overlap
 * was the first attempt and wants 5 to 10 lanes in one row over the shipped
 * graphs — Hera and Poseidon reach 10 — so most would have missed the gap and
 * fallen back to the midpoint, which is the line this breaks up.
 */
export function lanesFor(
  edges: readonly GraphEdge[],
  places: ReadonlyMap<string, Place>,
): ReadonlyMap<string, number> {
  interface Bar {
    x: number;
    top: number;
    source: number;
    ids: string[];
    /** Set where the height is already decided — a junction is its own bar. */
    on?: number;
  }

  // Everything feeding one target, so two targets asking for the same thing can
  // be told apart from two that merely overlap.
  const feeding = new Map<string, string[]>();
  for (const edge of edges) {
    const from = places.get(edge.from);
    const to = places.get(edge.to);
    // A wire inside one band has no gap to sit in and is `wire`'s own case.
    if (from === undefined || to === undefined || from.bottom >= to.top) continue;
    feeding.set(edge.to, [...(feeding.get(edge.to) ?? []), edge.id]);
  }

  const bars = new Map<string, Bar>();
  for (const [target, ids] of feeding) {
    const to = places.get(target)!;
    // Branches meet on the diamond rather than above it, so a junction's bar is
    // its own height and it shares with nobody.
    if (isJunctionId(target)) {
      bars.set(target, { x: to.x, top: to.top, source: to.top, ids: [...ids], on: to.top });
      continue;
    }
    // Two boons wanting the same things share one bar rather than drawing two
    // at different heights — 158 of the 452 targets across both catalogs are in
    // such a group, and the largest gathers eight. The row is in the key
    // because a wrapped band puts identical asks on different lines.
    const asks = ids
      .map((id) => edges.find((edge) => edge.id === id)?.from ?? "")
      .sort()
      .join("|");
    const key = `${Math.round(to.top)}|${asks}`;
    const bar = bars.get(key);
    const lowest = Math.max(
      ...ids.map((id) => places.get(edges.find((edge) => edge.id === id)!.from)!.bottom),
    );
    if (bar === undefined) {
      bars.set(key, { x: to.x, top: to.top, source: lowest, ids: [...ids] });
      continue;
    }
    // The lowest source is what the bar has to clear, having to sit below every
    // icon it leaves.
    bar.source = Math.max(bar.source, lowest);
    bar.x = Math.min(bar.x, to.x);
    bar.ids.push(...ids);
  }

  // Per target row rather than per page: a bar is placed against its own
  // target's top, so two in different rows cannot collide however far they run.
  // Rounded, because a wrapped row is a different row and a row is not.
  const rows = new Map<number, Bar[]>();
  for (const bar of bars.values()) {
    rows.set(Math.round(bar.top), [...(rows.get(Math.round(bar.top)) ?? []), bar]);
  }

  const lanes = new Map<string, number>();
  for (const row of rows.values()) {
    for (const bar of row.filter((b) => b.on !== undefined)) {
      for (const id of bar.ids) lanes.set(id, bar.on!);
    }
    const free = row.filter((bar) => bar.on === undefined);
    if (free.length === 0) continue;
    const room = Math.min(...free.map((bar) => bar.top - bar.source - 2 * CLEARANCE));
    const capacity = Math.max(1, Math.floor(room / LANE) + 1);
    // By where the target sits, so the bars that share a height are the ones
    // furthest apart across the row.
    [...free]
      .sort((a, b) => a.x - b.x)
      .forEach((bar, index) => {
        // Measured up from the target, not down from the source: the bar belongs
        // to the node it feeds, and a source two bands above would otherwise put
        // it nowhere near one.
        const at =
          room < 0
            ? (bar.source + bar.top) / 2
            : bar.top - CLEARANCE - (index % capacity) * LANE;
        for (const id of bar.ids) lanes.set(id, at);
      });
  }
  return lanes;
}

/** How far a vertical run stays off an icon's edge before it reads as clear. */
const BESIDE = 10;

/** The icons a vertical run at `x` between two heights would touch. */
function blockers(
  x: number,
  y1: number,
  y2: number,
  obstacles: readonly Place[],
): readonly Place[] {
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  return obstacles.filter(
    (o) => x > o.left - BESIDE && x < o.right + BESIDE && bottom > o.top && top < o.guard,
  );
}

function crosses(x: number, y1: number, y2: number, obstacles: readonly Place[]): boolean {
  return blockers(x, y1, y2, obstacles).length > 0;
}

/**
 * The nearest x to `want` where a vertical run over these heights touches
 * nothing — the outside of whatever is in the way, which is the shortest
 * detour that is still a detour.
 */
function clearColumn(
  want: number,
  y1: number,
  y2: number,
  obstacles: readonly Place[],
): number {
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  const blocked: Array<[number, number]> = [];
  for (const o of obstacles) {
    if (bottom <= o.top || top >= o.guard) continue;
    blocked.push([o.left - BESIDE, o.right + BESIDE]);
  }
  blocked.sort((a, b) => a[0] - b[0]);

  const spans: Array<[number, number]> = [];
  for (const span of blocked) {
    const last = spans.at(-1);
    if (last !== undefined && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else spans.push([span[0], span[1]]);
  }

  const inside = spans.find(([l, r]) => want > l && want < r);
  if (inside === undefined) return want;
  // Its own two edges are the nearest clear x by construction, since the spans
  // either side of it are separated from it by clear ground.
  return want - inside[0] <= inside[1] - want ? inside[0] : inside[1];
}

/**
 * A bar's height, moved off anything it would otherwise run across.
 *
 * `lanesFor` picks the height from the target's icon and knows nothing of what
 * the run passes over on its way there — which is how two bars on Hera came to
 * be drawn through the words *Fine Line*. Whichever side of the obstacle is
 * nearer, since a node the run merely passes is not one it is about.
 */
function clearOf(
  at: number,
  from: Place,
  to: Place,
  obstacles: readonly Place[],
): number {
  const left = Math.min(from.x, to.x);
  const right = Math.max(from.x, to.x);
  const across = obstacles.filter((o) => right > o.left - BESIDE && left < o.right + BESIDE);
  const hit = across.find((o) => at > o.top - BESIDE && at < o.guard + BESIDE);
  if (hit === undefined) return at;

  const above = hit.top - BESIDE;
  const below = hit.guard + BESIDE;
  // Room is what decides it: above must still clear the source it leaves, and
  // below must still leave the drop into the target worth drawing.
  const roomAbove = above >= from.guard + BESIDE;
  const roomBelow = below <= to.top - BESIDE;
  if (roomAbove && (!roomBelow || at - above <= below - at)) return above;
  return roomBelow ? below : at;
}

/**
 * A connector as a list of corners: down out of the source, across on its bar,
 * down into the target. Every segment is parallel or perpendicular to the rest,
 * which is what lets a fan of them read as a bus rather than as noise.
 *
 * Right angles only here; `chamfer` is what turns the tight ones into 45s.
 *
 * A run that would cross an icon goes around it instead — into the gap below the
 * source's row, along to the near side of what is in the way, and down. A band
 * wide enough to wrap is where that happens.
 */
export function route(
  from: Place,
  to: Place,
  at: number,
  everything: readonly Place[],
): ReadonlyArray<readonly [number, number]> {
  // Its own two ends are not in its way. A wire leaves through the underside of
  // its source's icon and therefore across that source's own name, which is the
  // anchor doing what it was chosen to do rather than a crossing.
  const obstacles = everything.filter((o) => o !== from && o !== to);
  // A column, so there is nothing to turn for.
  if (
    Math.abs(to.x - from.x) < 0.5 &&
    !crosses(from.x, from.bottom, to.top, obstacles)
  ) {
    return [
      [from.x, from.bottom],
      [to.x, to.top],
    ];
  }

  // The bar is the one part of the route free to move, so it takes the strain
  // where the drop *into* the target is blocked — a junction placed under a
  // node leaves that drop crossing it, and neither end can shift sideways.
  const under = blockers(to.x, at, to.top, obstacles);
  const dropped = under.length === 0 ? at : Math.max(...under.map((o) => o.guard)) + BESIDE;
  const bar = clearOf(dropped, from, to, obstacles);

  const plain = [
    [from.x, from.bottom],
    [from.x, bar],
    [to.x, bar],
    [to.x, to.top],
  ] as const;
  if (!crosses(from.x, from.bottom, bar, obstacles)) return plain;

  // Halfway to whatever is next, so the corner that starts the detour is not a
  // stub: an 18px one is exactly the unjustified right angle to avoid.
  const below = obstacles
    .filter((o) => o.top >= from.bottom)
    .map((o) => o.top)
    .concat(bar);
  const gap = (from.bottom + Math.min(...below)) / 2;
  const via = clearColumn(to.x, gap, bar, obstacles);
  return [
    [from.x, from.bottom],
    [from.x, gap],
    [via, gap],
    [via, bar],
    [to.x, bar],
    [to.x, to.top],
  ];
}

/** The most a corner is cut back, so a chamfer stays a detail and not a curve. */
const CHAMFER = 16;

/**
 * Every corner cut to 45 degrees, by half the shorter of the two runs meeting
 * there so two chamfers can never overlap.
 *
 * It is what keeps a 14px sidestep from being drawn as two right angles a
 * fingernail apart: at that width the two chamfers meet in the middle and the
 * whole turn becomes one 45-degree dogleg, which is the only other angle the
 * page is allowed. A long run keeps its horizontal and gets 45s at each end.
 */
export function chamfer(
  corners: ReadonlyArray<readonly [number, number]>,
  obstacles: readonly Place[] = [],
  max = CHAMFER,
): ReadonlyArray<readonly [number, number]> {
  if (corners.length < 3) return corners;
  const out: Array<readonly [number, number]> = [corners[0]!];
  for (let i = 1; i < corners.length - 1; i += 1) {
    const [px, py] = corners[i - 1]!;
    const [vx, vy] = corners[i]!;
    const [nx, ny] = corners[i + 1]!;
    const back = Math.hypot(vx - px, vy - py);
    const on = Math.hypot(nx - vx, ny - vy);
    // Half of each run, which is what lets a short one be consumed entirely and
    // come out as a single dogleg. A third leaves a few pixels of flat between
    // the two chamfers, which is the sidestep it exists to remove.
    const r = Math.min(max, back / 2, on / 2);
    const from: readonly [number, number] = [
      vx - ((vx - px) / back) * r,
      vy - ((vy - py) / back) * r,
    ];
    const to: readonly [number, number] = [
      vx + ((nx - vx) / on) * r,
      vy + ((ny - vy) / on) * r,
    ];
    // A square corner clear of everything can still cut across one diagonally,
    // which is where the last crossings on Zeus, Poseidon and Apollo came from.
    // The corner keeps its right angle rather than the route being re-run.
    const cuts = obstacles.some(
      (o) =>
        Math.max(from[0], to[0]) > o.left + 1 &&
        Math.min(from[0], to[0]) < o.right - 1 &&
        Math.max(from[1], to[1]) > o.top + 1 &&
        Math.min(from[1], to[1]) < o.guard - 1,
    );
    if (r < 0.5 || cuts) {
      out.push(corners[i]!);
      continue;
    }
    out.push(from);
    out.push(to);
  }
  out.push(corners.at(-1)!);
  return out;
}

/**
 * The path, with the corners a route left in that say nothing — a segment of no
 * length, and a corner between two runs in the same direction.
 *
 * An unmeasured endpoint draws nothing at all: the first frame, and every frame
 * under a runner with no layout.
 */
export function wire(
  from: Place | undefined,
  to: Place | undefined,
  at: number | undefined,
  obstacles: readonly Place[] = [],
): string {
  if (from === undefined || to === undefined) return "";
  const corners = chamfer(route(from, to, at ?? from.bottom + CLEARANCE, obstacles), obstacles);
  const kept: Array<readonly [number, number]> = [];
  for (const corner of corners) {
    const last = kept.at(-1);
    if (last !== undefined && Math.abs(last[0] - corner[0]) < 0.5 && Math.abs(last[1] - corner[1]) < 0.5) {
      continue;
    }
    const before = kept.at(-2);
    // Any direction, not just the two axes: two chamfers meeting in the middle
    // of a short run make one 45-degree dogleg, and left as two it is a corner
    // drawn where the line does not turn.
    if (last !== undefined && before !== undefined) {
      const turn =
        (last[0] - before[0]) * (corner[1] - last[1]) -
        (last[1] - before[1]) * (corner[0] - last[0]);
      if (Math.abs(turn) < 0.01) kept.pop();
    }
    kept.push(corner);
  }
  return kept.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
}

function settled(before: ReadonlyMap<string, Place>, next: ReadonlyMap<string, Place>): boolean {
  if (before.size !== next.size) return false;
  for (const [id, place] of next) {
    const was = before.get(id);
    if (was === undefined) return false;
    if (was.x !== place.x || was.top !== place.top || was.bottom !== place.bottom) return false;
    if (was.left !== place.left || was.right !== place.right) return false;
    if (was.guard !== place.guard) return false;
  }
  return true;
}
