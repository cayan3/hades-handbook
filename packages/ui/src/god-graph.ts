import { keepsakesFor } from "@repo/catalog";
import type { GodId, Requirement, RunFacts, Status, TraitId } from "@repo/core";
import { evaluate } from "@repo/core";
import { hexOf, kindOf, type NodeKind, type NodeSource } from "./node-view.js";

/**
 * One god's page as a laid-out graph: bands top to bottom, connectors from
 * prerequisite to dependent, a junction wherever an any-of branches.
 *
 * Derived from records and facts only. Pins are deliberately not an input — a
 * pin moves without the facts object moving, so anything here that read one
 * would go stale silently. Pinning is passed to the node as a prop instead.
 *
 * Not cached: a page is 8 to 24 records, which comes to a few hundred map
 * lookups. The node views are the expensive part and have their own cache.
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
  /** Which of the four this is, or `null` for an ordinary offer from this god. */
  readonly kind: NodeKind | null;
  /**
   * For a Godsent Hex, the Hex it is granted for; `null` for everything else.
   *
   * The id rather than the name, so the page resolves it where it draws it and
   * the shipped text stays behind the one resolver that can withdraw it.
   */
  readonly hex: TraitId | null;
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
  /** Whether the boon this branch point feeds is in the run. */
  readonly reached: boolean;
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
  /** Whether the boon at the end of this path is in the run. Lights the path. */
  readonly reached: boolean;
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
export function endpointOwner(id: string): TraitId {
  return isJunctionId(id) ? junctionOwner(id) : id;
}

/**
 * A god's own records, plus every Duo naming them — you collect toward a Duo
 * from two directions, so it belongs on both pages.
 *
 * The god field does most of the filtering: a record attributed to nobody is a
 * costume, a hammer upgrade, a companion or a Chaos blessing, none of which a
 * run collects from a god.
 *
 * Of the rest, only the `name` check bites. 4 Hades I and 1 Hades II records
 * carry a god and no display text, and the resolver falls back to the id —
 * fine as a label, wrong as a boon to offer. The keepsake and Aspect checks
 * currently match nothing here; they stay because the list they came from had
 * them for a reason.
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
 * One walk of a gate: a junction per any-of, an edge per trait leaf that names
 * something on this page.
 *
 * Junctions are kept only where at least one branch is on the page. A gate
 * asking for any Cast boon in the game has nothing here to connect to, and
 * drawn anyway it is a lone diamond with no lines into it. The full gate is
 * still spelled out in the detail surface.
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
  // Every path in this gate leads to the same boon, so this is asked once.
  const reached = facts.held.has(dependent);

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
            reached,
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
        junctions.push({ id, dependent, min: req.min, of: req.of.length, status, reached });
        return [
          ...branches,
          {
            id: `${id}>${target}`,
            from: id,
            to: target,
            taken: status === "satisfied",
            reached,
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
  const kind = kindOf(source.records[trait]);
  // A Godsent Hex rides the rim beside the Duos: it answers to a god and to
  // Selene both, so it is the same kind of thing as a Duo — a boon reached from
  // two directions — and is grouped and revealed with them.
  if (kind === "duo" || kind === "hex") return { kind: "duo", tier: 0 };
  if (kind === "infusion") return { kind: "infusion", tier: 0 };

  // A Legendary is not a band of its own: it is the top of this god's own
  // ladder and sits in the tier its prerequisites put it in.
  const record = source.records[trait];
  if (record?.tier != null) return { kind: "tier", tier: record.tier };
  return { kind: "untiered", tier: 0 };
}

/**
 * A band's name, announced but not drawn: the headings were noise next to bands
 * that have none, and the arrangement already says it to anyone who can see it.
 *
 * A tier is named nowhere at all — it is the extraction's rank, and the game
 * never shows a player one.
 *
 * `untiered` is empty in both shipped catalogs and stays as the catch-all for
 * whatever a patch adds next.
 */
const LABELS: Readonly<Record<BandKind, string | null>> = {
  tier: null,
  infusion: "Infusions",
  untiered: null,
  duo: "Duos and Godsent Hexes",
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
      members: members.map((trait) => ({
        trait,
        partner: partnerOf(source, god, trait),
        kind: kindOf(source.records[trait]),
        hex: hexOf(source.records[trait]),
      })),
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
    const at = placed.get(endpointOwner(edge.from));
    if (at === undefined) continue;
    const owner = endpointOwner(edge.to);
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
    if (endpointOwner(edge.from) !== trait && endpointOwner(edge.to) !== trait) continue;
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
