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
 * A band is a group with no heading where it stands for a layer, because the
 * layer is this page's own arithmetic and the game never shows a player a rank.
 * The other three name categories the game does.
 */
export type BandKind = "tier" | "legendary" | "infusion" | "duo";

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
  /**
   * One of the slots every run fills — Attack, Special, Cast, Dash, and the
   * fifth each game names differently. They lead the top layer in the game's own
   * slot order rather than in name order, being the spine of a build.
   */
  readonly core: boolean;
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
  /**
   * What else would satisfy the gate this line stands for, where the gate had
   * one branch here and was drawn as a plain line. Without it the other eight
   * Cast boons are simply not on the page, and the line reads as the only way.
   */
  readonly also?: string;
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

/**
 * `coreSlots` is the game's own slot order and the caller's, the same list the
 * Loadout is handed: which slots exist and in what order is a fact about the
 * game that neither the records nor this file state. Left out, the page loses
 * the ordering and nothing else.
 */
export function godGraph(
  source: NodeSource,
  god: GodId,
  facts: RunFacts,
  coreSlots: readonly string[] = [],
): GodGraph {
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

  return { god, bands: layOut(source, god, traits, junctions, edges, coreSlots), edges };
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
        // One branch reaching the page is not a choice anybody can see, so it
        // is drawn as the line it is. A third of all gates are this: nine Cast
        // boons offered and one of them here. The count is still written out in
        // the detail surface, which is where the other eight were always read.
        if (branches.length === 1) {
          const only = branches[0]!;
          const also = otherwise(source, req, only.from);
          return [
            { ...only, id: `${only.from}>${target}`, to: target, ...(also === null ? {} : { also }) },
          ];
        }

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
 * What else would satisfy a gate whose only drawn branch is `shown`.
 *
 * Where every other branch names a boon in one equip position — nine Cast boons,
 * one per god — that is the sentence worth reading, and it is the whole of what
 * the drawn line leaves out. Otherwise the count says it: the gate offers more
 * than the page can show.
 */
function otherwise(source: NodeSource, req: Requirement, shown: TraitId): string | null {
  if (req.kind !== "anyOf") return null;
  const others = req.of
    .filter((child) => child.kind === "hasTrait" && child.trait !== shown)
    .map((child) => (child as { trait: TraitId }).trait);
  if (others.length === 0) return null;

  const slots = new Set(others.map((trait) => source.records[trait]?.slot ?? ""));
  const only = slots.size === 1 ? source.naming.slot([...slots][0] ?? "") : null;
  if (only !== null) return `Or any other god's ${only} boon.`;
  return `Or any ${others.length === 1 ? "one other" : `1 of ${others.length} others`}.`;
}

/**
 * Which band a record sits in, leaving the layer of a tiered one to `layOut`.
 *
 * An Infusion is a boon gated on element counts rather than on prerequisite
 * boons, so the test is the gate itself: every leaf a `hasElement`. That catches
 * all three shapes the data uses — a bare count, an any-of over counts, and an
 * all-of over one count per element — where a check on the top-level kind
 * catches only the first. Hades II carries 11 and Hades I none.
 */
function bandOf(source: NodeSource, trait: TraitId): BandKind {
  const kind = kindOf(source.records[trait]);
  // A Godsent Hex rides the rim beside the Duos: it answers to a god and to
  // Selene both, so it is the same kind of thing as a Duo — a boon reached from
  // two directions — and is grouped and revealed with them.
  if (kind === "duo" || kind === "hex") return "duo";
  if (kind === "infusion") return "infusion";
  // A band of its own under every layer rather than the one its prerequisites
  // put it in. Measured, no Legendary is a prerequisite of any tiered boon in
  // either game, so the bottom never points an edge upward.
  if (kind === "legendary") return "legendary";
  return "tier";
}

/**
 * How deep on this page a boon sits: one more than the deepest thing feeding it,
 * counting only what the page draws.
 *
 * The catalog's `tier` cannot order this page, answering a different question —
 * it is the cheapest way in, so a boon reachable through "this god's boon or
 * anyone's" is tier 1 and laid out by it sits in the top row with a line
 * climbing into it from below. Measured, 32 of 299 tiered records move under
 * this rule and 12 god pages stop drawing a junction over their top band.
 *
 * Longest path rather than shortest, so no edge points upward. None does.
 */
function layerOf(
  members: ReadonlySet<TraitId>,
  edges: readonly GraphEdge[],
): ReadonlyMap<TraitId, number> {
  const sources = new Map<TraitId, TraitId[]>();
  for (const edge of edges) {
    const from = endpointOwner(edge.from);
    const to = endpointOwner(edge.to);
    if (from === to || !members.has(from) || !members.has(to)) continue;
    sources.set(to, [...(sources.get(to) ?? []), from]);
  }

  const depth = new Map<TraitId, number>();
  // The extractor fails its run on a prerequisite cycle, so this guards against
  // a hand-built source rather than against the shipped data.
  const walking = new Set<TraitId>();
  const of = (trait: TraitId): number => {
    const known = depth.get(trait);
    if (known !== undefined) return known;
    if (walking.has(trait)) return 1;
    walking.add(trait);
    const answer = 1 + Math.max(0, ...(sources.get(trait) ?? []).map(of));
    walking.delete(trait);
    depth.set(trait, answer);
    return answer;
  };
  for (const trait of members) of(trait);
  return depth;
}

/**
 * A band's name, announced but not drawn: the headings were noise next to bands
 * that have none, and the arrangement already says it to anyone who can see it.
 *
 * A layer is named nowhere at all — it is this page's own arithmetic, and the
 * game never shows a player a rank.
 */
const LABELS: Readonly<Record<BandKind, string | null>> = {
  tier: null,
  legendary: "Legendaries",
  infusion: "Infusions",
  duo: "Duos and Godsent Hexes",
};

const ORDER: Readonly<Record<BandKind, number>> = {
  tier: 0,
  legendary: 1,
  infusion: 2,
  duo: 3,
};

/**
 * Bands in reading order — layers ascending, then the Legendaries, then the
 * Infusions, then the Duos on the rim. That order is also the tab order, because
 * tab order is DOM order and nothing sets a tab index.
 */
function layOut(
  source: NodeSource,
  god: GodId,
  traits: readonly TraitId[],
  junctions: readonly GraphJunction[],
  edges: readonly GraphEdge[],
  coreSlots: readonly string[],
): readonly GraphBand[] {
  // Where a core boon sits in the game's own slot order, and past the end of it
  // for everything else, so the two groups sort apart without a second pass.
  const rank = (trait: TraitId): number => {
    const slot = source.records[trait]?.slot;
    const at = slot == null ? -1 : coreSlots.indexOf(slot);
    return at === -1 ? coreSlots.length : at;
  };
  const kinds = new Map(traits.map((trait) => [trait, bandOf(source, trait)]));
  const tiered = new Set(traits.filter((trait) => kinds.get(trait) === "tier"));
  const layer = layerOf(tiered, edges);

  const grouped = new Map<string, { kind: BandKind; depth: number; members: TraitId[] }>();
  for (const trait of traits) {
    const kind = kinds.get(trait) ?? "tier";
    const depth = kind === "tier" ? (layer.get(trait) ?? 1) : 0;
    const key = kind === "tier" ? `tier-${depth}` : kind;
    const band = grouped.get(key);
    if (band === undefined) grouped.set(key, { kind, depth, members: [trait] });
    else band.members.push(trait);
  }

  const ordered = [...grouped.entries()].sort(
    ([, a], [, b]) => ORDER[a.kind] - ORDER[b.kind] || a.depth - b.depth,
  );

  const placed = new Map<TraitId, number>();
  return ordered.map(([key, band]) => {
    const members = arrange(source, band.members, edges, placed, rank);
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
        core: rank(trait) < coreSlots.length,
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
  rank: (trait: TraitId) => number,
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
    // The slot order first, and it only ever separates anything on the top
    // layer: a core boon has no prerequisites, so nothing deeper carries one.
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
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
 * The edges and junctions to draw around one endpoint — everything reaching it,
 * everything leaving it, and the branch points on either path.
 *
 * The resting page draws none of them. A page carries up to 66 connectors and
 * a gate offering "any one of nine" fans that far on its own, so drawing them
 * all at rest is the hairball this layout exists to avoid; the light-up on
 * satisfaction only reads against a quiet page.
 *
 * A junction is an endpoint too, and is told apart rather than passed through
 * `endpointOwner`, which answers with its dependent.
 */
export function neighbourhood(graph: GodGraph, endpoint: string | null): ReadonlySet<string> {
  const edges = new Set<string>();
  if (endpoint === null) return edges;

  // Strictly a subset of what its dependent's own selection draws, which is why
  // a junction still needs no tab stop: a keyboard reaches the same lines, and
  // more of them, through the node underneath it.
  if (isJunctionId(endpoint)) {
    for (const edge of graph.edges) {
      if (edge.from === endpoint || edge.to === endpoint) edges.add(edge.id);
    }
    return edges;
  }

  const junctions = new Set<string>();
  for (const edge of graph.edges) {
    if (endpointOwner(edge.from) !== endpoint && endpointOwner(edge.to) !== endpoint) continue;
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
