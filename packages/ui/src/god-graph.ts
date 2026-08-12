import { keepsakesFor } from "@repo/catalog";
import type { GodId, Requirement, RunFacts, Status, TraitId } from "@repo/core";
import { evaluate } from "@repo/core";
import type { NodeSource } from "./node-view.js";

/**
 * One god's page as a laid-out graph: bands top to bottom, connectors running
 * from prerequisite to dependent, a junction wherever an any-of branches.
 *
 * Pure, and everything on it derives from the records and the facts. Nothing
 * here reads intent — a graph badly wants to draw what a player is collecting
 * toward, and a pin moves without the facts object moving, so a field carrying
 * one would go on saying what it said before the pin with nothing looking
 * wrong. Pinning reaches the page as a prop on the node instead.
 *
 * Not cached, unlike the node views. A page is 8 to 24 records; the whole
 * derivation is one tree walk per record plus one leaf evaluation per edge,
 * which over both catalogs is a few hundred map lookups. The views are the
 * expensive half and they have a cache of their own.
 */
export interface GodGraph {
  readonly god: GodId;
  readonly bands: readonly GraphBand[];
  /** Every connector on the page, drawn or not — see `neighbourhood`. */
  readonly edges: readonly GraphEdge[];
}

/**
 * A band is a group with no heading where it stands for a tier, because the
 * tier is the extraction's own rank and the game never shows it to a player.
 * The other three name categories the game does.
 */
export type BandKind = "tier" | "infusion" | "untiered" | "duo";

export interface GraphBand {
  /** Stable across renders; never drawn. */
  readonly key: string;
  readonly kind: BandKind;
  /** Null for a tier band, which is the whole of that rule in one field. */
  readonly label: string | null;
  /** The branch points feeding this band's nodes, in those nodes' order. */
  readonly junctions: readonly GraphJunction[];
  readonly members: readonly GraphMember[];
}

export interface GraphMember {
  readonly trait: TraitId;
  /**
   * The *other* god of a Duo, and the one hue a single-god page carries: a Duo
   * is the one node on it that does not belong to the god whose page it is.
   */
  readonly partner: GodId | null;
}

export interface GraphJunction {
  /** Also its endpoint id on an edge. */
  readonly id: string;
  readonly dependent: TraitId;
  readonly min: number;
  /**
   * Every branch the requirement offers, not every branch drawn. A gate asking
   * for any one of nine Cast boons has eight of them on other gods' pages, and
   * a junction announcing "any 1 of 2" because two lines reach it would be
   * describing the page rather than the requirement.
   */
  readonly of: number;
  readonly status: Status["kind"];
}

export interface GraphEdge {
  readonly id: string;
  /** A trait id or a junction id; `isJunctionId` tells them apart. */
  readonly from: string;
  readonly to: string;
  /**
   * Whether this path is contributing. Line style carries path status and
   * nothing else — solid where the run holds the prerequisite, dim and dashed
   * where it is an alternative still open. Whether a gate is a choice or a list
   * is structure, carried by the junction, because structure drawn as texture
   * is what made an earlier version of this design unreadable.
   */
  readonly taken: boolean;
}

/**
 * A junction's id is its dependent, a `#`, and its position in that gate's
 * walk. Trait ids are Lua identifiers and carry neither character — checked
 * against all 1061 records — so an endpoint id says which kind it is.
 */
export function isJunctionId(id: string): boolean {
  return id.includes("#");
}

function junctionOwner(id: string): TraitId {
  return id.slice(0, id.lastIndexOf("#"));
}

/** The node an endpoint belongs to: itself, or a junction's dependent. */
function ownerOf(id: string): TraitId {
  return isJunctionId(id) ? junctionOwner(id) : id;
}

/**
 * Which of a god's records the page carries: that god's own, plus every Duo
 * naming them, since collecting toward a Duo happens from two directions.
 *
 * A record attributed to no god is not a boon — the costumes, hammer upgrades,
 * companions, Chaos blessings and weapon traits all land there, and none of
 * them is something a run collects from a god.
 *
 * Two thirds of the rest are measured no-ops on this page: no record carrying a
 * god or a Duo pair is also a keepsake or sits in the Aspect slot. They stay
 * because the boon list they came from had them for a reason. `name` is the one
 * that bites — 4 Hades I records and 1 Hades II record carry a god and no
 * display text, and the resolver falls back to the id, which is right for a
 * label on something already on screen and wrong for a boon offered to take.
 */
export function pageTraits(source: NodeSource, god: GodId): TraitId[] {
  const keepsakes = keepsakesFor(source.game);
  const found: TraitId[] = [];
  for (const [id, record] of Object.entries(source.records)) {
    const mine = record.god === god || (record.duoGods?.includes(god) ?? false);
    if (!mine || record.name === null) continue;
    if (record.slot === "Aspect" || Object.hasOwn(keepsakes, id)) continue;
    found.push(id);
  }
  return found;
}

/** Every trait the graph draws, so a caller derives exactly the views it needs. */
export function graphTraits(graph: GodGraph): TraitId[] {
  return graph.bands.flatMap((band) => band.members.map((member) => member.trait));
}

export function godGraph(source: NodeSource, god: GodId, facts: RunFacts): GodGraph {
  const traits = pageTraits(source, god);
  const onPage = new Set(traits);

  const junctions: GraphJunction[] = [];
  const edges: GraphEdge[] = [];
  // A gate naming the same prerequisite twice would draw one line twice.
  const seen = new Set<string>();

  for (const trait of traits) {
    const prereq = source.records[trait]?.prereq;
    if (prereq == null) continue;
    for (const edge of walk(source, facts, onPage, trait, prereq, junctions)) {
      if (seen.has(edge.id)) continue;
      seen.add(edge.id);
      edges.push(edge);
    }
  }

  return { god, bands: layOut(source, god, traits, junctions, edges), edges };
}

/**
 * One walk of a gate, emitting a junction per any-of and an edge per trait leaf
 * naming something on this page.
 *
 * A junction is kept only where at least one branch is on the page. A gate
 * asking for any Cast boon in the game reaches this page through a single
 * record and has nothing here to connect to; drawn anyway it is a lone diamond
 * above a node with no lines into it. The whole requirement is still written
 * out in the detail surface, and the branch count above still says nine.
 */
function walk(
  source: NodeSource,
  facts: RunFacts,
  onPage: ReadonlySet<TraitId>,
  dependent: TraitId,
  prereq: Requirement,
  junctions: GraphJunction[],
): readonly GraphEdge[] {
  // Position in this record's own pre-order walk. Stable for a given record,
  // which is what a React key and a ref map both need.
  let nth = 0;

  const into = (req: Requirement, target: string): GraphEdge[] => {
    switch (req.kind) {
      case "hasTrait": {
        // A gate naming its own dependent draws a line from a node to itself.
        // The data has none today; the guard costs a comparison.
        if (!onPage.has(req.trait) || req.trait === dependent) return [];
        return [
          {
            id: `${req.trait}>${target}`,
            from: req.trait,
            to: target,
            taken: evaluate(req, facts, source.rules, source.lookups).kind === "satisfied",
          },
        ];
      }

      case "all":
        return req.of.flatMap((child) => into(child, target));

      case "anyOf": {
        const id = `${dependent}#${nth++}`;
        const branches = req.of.flatMap((child) => into(child, id));
        if (branches.length === 0) return [];

        const status = evaluate(req, facts, source.rules, source.lookups).kind;
        junctions.push({ id, dependent, min: req.min, of: req.of.length, status });
        return [
          ...branches,
          {
            id: `${id}>${target}`,
            from: id,
            to: target,
            taken: status === "satisfied",
          },
        ];
      }

      // Elements, gods, keepsakes, aspects and talents are not nodes on this
      // page, so they draw nothing. The gate still says so in the detail.
      case "hasElement":
      case "godInPool":
      case "hasKeepsake":
      case "hasBoonFrom":
      case "hasAspect":
      case "hasTalent":
        return [];
    }
  };

  return into(prereq, dependent);
}

/**
 * Which band a record sits in.
 *
 * An Infusion is a boon gated on element counts rather than on prerequisite
 * boons, so the test is the gate itself: every leaf a `hasElement`. That catches
 * all three shapes the data uses — a bare count, an any-of over counts, and an
 * all-of over one count per element — where a check on the top-level kind
 * catches only the first. Hades II carries 11 and Hades I none.
 */
function bandOf(source: NodeSource, trait: TraitId): { kind: BandKind; tier: number } {
  const record = source.records[trait];
  if (record?.duoGods != null) return { kind: "duo", tier: 0 };

  const parts = leavesOf(record?.prereq ?? null);
  if (parts.length > 0 && parts.every((part) => part.kind === "hasElement")) {
    return { kind: "infusion", tier: 0 };
  }
  if (record?.tier != null) return { kind: "tier", tier: record.tier };
  return { kind: "untiered", tier: 0 };
}

function leavesOf(req: Requirement | null): readonly Requirement[] {
  if (req === null) return [];
  return req.kind === "all" || req.kind === "anyOf" ? req.of.flatMap(leavesOf) : [req];
}

const LABELS: Readonly<Record<BandKind, string | null>> = {
  // The tier orders the page and is never written on it.
  tier: null,
  infusion: "Infusions",
  // Whatever a god has that is neither tiered nor element-gated: the spell
  // talents, and Hera's two multi-element boons. Naming that group would invent
  // a category the game does not have, so it goes unlabelled.
  untiered: null,
  duo: "Duos",
};

const ORDER: Readonly<Record<BandKind, number>> = {
  tier: 0,
  infusion: 1,
  untiered: 2,
  duo: 3,
};

/**
 * Bands in reading order — tiers ascending, then the Infusions in a band of
 * their own, then whatever is left, then the Duos on the rim. That order is
 * also the tab order, because tab order is DOM order and nothing sets a tab
 * index.
 */
function layOut(
  source: NodeSource,
  god: GodId,
  traits: readonly TraitId[],
  junctions: readonly GraphJunction[],
  edges: readonly GraphEdge[],
): readonly GraphBand[] {
  const grouped = new Map<string, { kind: BandKind; tier: number; members: TraitId[] }>();
  for (const trait of traits) {
    const { kind, tier } = bandOf(source, trait);
    const key = kind === "tier" ? `tier-${tier}` : kind;
    const band = grouped.get(key);
    if (band === undefined) grouped.set(key, { kind, tier, members: [trait] });
    else band.members.push(trait);
  }

  const ordered = [...grouped.entries()].sort(
    ([, a], [, b]) => ORDER[a.kind] - ORDER[b.kind] || a.tier - b.tier,
  );

  const placed = new Map<TraitId, number>();
  return ordered.map(([key, band]) => {
    const members = arrange(source, band.members, edges, placed);
    members.forEach((trait, index) => placed.set(trait, index));

    const order = new Map(members.map((trait, index) => [trait, index]));
    return {
      key,
      kind: band.kind,
      label: LABELS[band.kind],
      junctions: junctions
        .filter((junction) => order.has(junction.dependent))
        .sort((a, b) => (order.get(a.dependent) ?? 0) - (order.get(b.dependent) ?? 0)),
      members: members.map((trait) => ({ trait, partner: partnerOf(source, god, trait) })),
    };
  });
}

/**
 * Order within a band: under the prerequisites it comes from, where it has any.
 *
 * One barycentre pass — each node at the mean position of its sources in the
 * bands already placed — which is the standard way to stop a layered graph
 * crossing itself, and one pass is enough at 8 to 16 wide. A node with no
 * source on an earlier band has no position to average and falls to the end in
 * name order, which is the whole of the first band.
 *
 * Position here is the index in the band, not a coordinate: bands wrap on a
 * narrow screen and the browser owns where anything lands. Index is exactly
 * right until a band wraps and a fair approximation after.
 */
function arrange(
  source: NodeSource,
  members: readonly TraitId[],
  edges: readonly GraphEdge[],
  placed: ReadonlyMap<TraitId, number>,
): readonly TraitId[] {
  const sources = new Map<TraitId, number[]>();
  for (const edge of edges) {
    const at = placed.get(ownerOf(edge.from));
    if (at === undefined) continue;
    const owner = ownerOf(edge.to);
    const list = sources.get(owner);
    if (list === undefined) sources.set(owner, [at]);
    else list.push(at);
  }

  return [...members].sort((a, b) => {
    const left = barycentre(sources.get(a));
    const right = barycentre(sources.get(b));
    if (left !== right) return left - right;
    return source.naming.trait(a).localeCompare(source.naming.trait(b));
  });
}

function barycentre(positions: readonly number[] | undefined): number {
  if (positions === undefined || positions.length === 0) return Number.MAX_SAFE_INTEGER;
  return positions.reduce((sum, at) => sum + at, 0) / positions.length;
}

/** The other god of a Duo. Null for everything else, which is every other band. */
function partnerOf(source: NodeSource, god: GodId, trait: TraitId): GodId | null {
  const pair = source.records[trait]?.duoGods;
  if (pair == null) return null;
  return pair.find((other) => other !== god) ?? null;
}

/**
 * The edges and junctions to draw around one node — everything reaching it,
 * everything leaving it, and the branch points on either path.
 *
 * The resting page draws none of them. A page carries up to 66 connectors and
 * a gate offering "any one of nine" fans that far on its own, so drawing them
 * all at rest is the hairball this layout exists to avoid; the light-up on
 * satisfaction only reads against a quiet page.
 */
export function neighbourhood(graph: GodGraph, trait: TraitId | null): ReadonlySet<string> {
  const edges = new Set<string>();
  if (trait === null) return edges;

  const junctions = new Set<string>();
  for (const edge of graph.edges) {
    if (ownerOf(edge.from) !== trait && ownerOf(edge.to) !== trait) continue;
    edges.add(edge.id);
    if (isJunctionId(edge.from)) junctions.add(edge.from);
    if (isJunctionId(edge.to)) junctions.add(edge.to);
  }

  // Where the selected node *feeds* a branch point, the branch point's own way
  // down belongs to the picture too. Without it the path leaves the node,
  // reaches a diamond and stops there, which reads as a dead end rather than as
  // the thing it unlocks.
  for (const edge of graph.edges) {
    if (isJunctionId(edge.from) && junctions.has(edge.from)) edges.add(edge.id);
  }
  return edges;
}
