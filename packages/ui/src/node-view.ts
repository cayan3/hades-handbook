import {
  type GameKey,
  type TraitRecord,
  forcingKeepsakes,
  iconFor,
  textFor,
  traitsFor,
} from "@repo/catalog";
import type {
  BoonState,
  CatalogLookups,
  GameRules,
  GodId,
  KeepsakeId,
  Rarity,
  Reason,
  Requirement,
  RunFacts,
  TraitId,
} from "@repo/core";
import { boonState, evaluate } from "@repo/core";
import {
  accessibleName,
  activationLines,
  type Displacement,
  type ImpossibleNotice,
  impossibleNotice,
  neededLines,
} from "./describe.js";
import { catalogNaming, type Naming } from "./naming.js";

/**
 * Everything a node shows without being asked, split from the detail below along
 * the line the disclosure ladder draws: an icon and a state always, everything
 * else on a hover or a tap. That split is also what keeps a page of a hundred and
 * thirty nodes affordable, since the parts that cost a second walk of a
 * requirement tree are all on the other side of it.
 *
 * Two fields are computed only when they can be non-empty. `notice` needs the
 * reason behind an impossible verdict, so it is asked for only once the state is
 * Impossible, which is by far the rarest. `dormant` needs a second requirement
 * evaluated, and six records in either game have one.
 */
export interface NodeView {
  readonly trait: TraitId;
  /** The display name, already resolved. */
  readonly name: string;
  readonly state: BoonState;
  readonly god: GodId | null;
  readonly tier: number | null;
  /** What the icon resolver returned. Not a URL — the art component makes one. */
  readonly iconKey: string;
  /**
   * The rarity of the copy the run holds, and `null` far more often than that
   * sentence suggests. See the note on `declaredRarity`.
   */
  readonly rarity: Rarity | null;
  /**
   * What the record says this boon can be offered as, which is empty for 191
   * Hades I records and 86 Hades II ones. A surface that records a mark asks
   * with this and stays silent without it.
   */
  readonly rarities: readonly Rarity[];
  /** Present exactly when the state is **Impossible**. */
  readonly notice: ImpossibleNotice | null;
  /**
   * Owned, and doing nothing: an Infusion past its obtain gate but not its
   * activation one. A badge on Obtained rather than a state of its own, because
   * owning a thing and that thing working are different questions.
   */
  readonly dormant: boolean;
  /** The state in text, which is where the ladder has to be readable from. */
  readonly label: string;
}

/** The part of a node that waits to be asked for. */
export interface NodeDetail {
  /** Codex text, through the resolver that can withdraw it. */
  readonly description: string | null;
  /** What the requirement still asks for, one line per thing to go and get. */
  readonly needed: readonly string[];
  /**
   * Every part of the gate with whether it is met — the same lines as `needed`,
   * plus the ones already done. What a Goal card tracks, and what makes the
   * progress count add up: both halves are produced by the same collapsing
   * rule, so "met" is exactly "a row the residual no longer asks for".
   */
  readonly rows: readonly RequirementRow[];
  /** For a dormant Infusion, the threshold against the run's own count. */
  readonly activation: readonly string[];
  /**
   * What taking this boon would push out of the run, when it would. The
   * sentence worth the derivation is its `neededBy`: the displaced boon is a
   * prerequisite of something the player pinned, and nothing else computes
   * that.
   */
  readonly displaces: Displacement | null;
}

/** One requirement of a goal, as a row that flips when it is met. */
export interface RequirementRow {
  readonly text: string;
  readonly met: boolean;
}

/**
 * The catalog and rules a set of nodes is derived against.
 *
 * The rules are a parameter rather than picked from the game id, because a
 * library that chose between the two implementations would have to import both,
 * putting one game's whole feasibility layer into every page of the other.
 *
 * The records are data for the reason the rules packages take theirs that way: a
 * test can state a world of three boons rather than assert against six hundred,
 * and a demonstration can show a verdict the shipped data cannot produce without
 * pretending it does.
 *
 * Naming is deliberately *not* wired to those records. Names come back through
 * the catalog's resolver, which is what gives them a withdrawal path; a caller
 * supplying a record the catalog has never heard of is inventing a boon, and
 * inventing its name is its own business. `naming` is a plain field, so such a
 * caller overrides it where the fiction lives.
 */
export interface NodeSource {
  readonly game: GameKey;
  readonly rules: GameRules;
  readonly lookups: CatalogLookups;
  readonly naming: Naming;
  readonly records: Readonly<Record<TraitId, TraitRecord>>;
  /** The keepsake that would still force a god into a full pool, if there is one. */
  readonly forcingKeepsake: (god: GodId) => KeepsakeId | null;
}

/**
 * Rules and lookups stay the caller's; records default to the shipped ones and
 * can be replaced, which is how the tests and the gallery put a boon in front of
 * the derivation that the games do not contain.
 */
export function createNodeSource(
  game: GameKey,
  rules: GameRules,
  lookups: CatalogLookups,
  records: Readonly<Record<TraitId, TraitRecord>> = traitsFor(game),
): NodeSource {
  // Built once. The map is keyed by keepsake and asked by god, and inverting it
  // per impossible node would rescan it on every render of a full pool, which is
  // exactly the run where every absent god is one.
  const byGod = new Map<GodId, KeepsakeId>();
  for (const [keepsake, god] of forcingKeepsakes(game)) byGod.set(god, keepsake);

  return {
    game,
    rules,
    lookups,
    records,
    naming: catalogNaming(game),
    forcingKeepsake: (god) => byGod.get(god) ?? null,
  };
}

/**
 * For a boon gated on nothing, which is roughly two thirds of each game. The
 * evaluator answers a childless `all` with "satisfied", so this is the shape of
 * "no gate" rather than a stand-in for one, and it keeps the derivation to one
 * path instead of a special case needing its own answer for every state.
 */
const NO_GATE: Requirement = Object.freeze({ kind: "all", of: [] });

/**
 * The rarity to show, which is usually none.
 *
 * A held boon always carries one and for many of them nobody observed it: 191
 * Hades I records and 86 Hades II ones declare an *empty* rarity list, and the
 * writer falls back to Common. So the field says "Common" about boons the data
 * never said could be Common, and showing that would turn a guess into an
 * observation. A rarity appears only where the record declares the boon has any.
 *
 * A smaller version survives and is named rather than hidden: even with a
 * non-empty list the held rarity is a fallback until something asks which one.
 */
function declaredRarity(
  state: BoonState,
  facts: RunFacts,
  trait: TraitId,
  declared: readonly Rarity[],
): Rarity | null {
  if (state !== "Obtained" || declared.length === 0) return null;
  return facts.held.get(trait)?.rarity ?? null;
}

/**
 * The state comes from the engine's own helper and is never recomputed here. A
 * view deciding for itself which of the five buckets a boon is in would be a
 * second implementation of the rule, and the two would agree right up until one
 * of them changed.
 *
 * The reason is asked for separately and in the order the helper settles the
 * state: the boon's own feasibility first, since a boon can be out of reach while
 * its prerequisite stays satisfiable, then the prerequisite. The wrong order
 * shows the wrong sentence under the right verdict.
 */
export function deriveNodeView(source: NodeSource, trait: TraitId, facts: RunFacts): NodeView {
  const { game, rules, lookups, naming, records } = source;
  const record = records[trait];
  const prereq = record?.prereq ?? NO_GATE;
  const state = boonState(trait, prereq, facts, rules, lookups);

  const god = record?.god ?? null;
  const tier = record?.tier ?? null;
  const name = naming.trait(trait);

  return {
    trait,
    name,
    state,
    god,
    tier,
    iconKey: iconFor(game, trait),
    rarity: declaredRarity(state, facts, trait, record?.rarity ?? []),
    rarities: record?.rarity ?? [],
    notice:
      state === "Impossible"
        ? impossibleNotice(reasonFor(source, trait, prereq, facts), naming, source.forcingKeepsake)
        : null,
    dormant:
      state === "Obtained" &&
      record?.activation != null &&
      evaluate(record.activation, facts, rules, lookups).kind !== "satisfied",
    label: accessibleName(name, state, god),
  };
}

/**
 * Only asked once the answer is known to be Impossible, so the fallback at the
 * end is unreachable by construction. It is an empty group rather than a throw:
 * a node that renders nothing is worse than one that says less than it could.
 */
function reasonFor(
  source: NodeSource,
  trait: TraitId,
  prereq: Requirement,
  facts: RunFacts,
): Reason {
  const own = source.rules.isBlocked(trait, facts);
  if (own !== null) return own;
  const status = evaluate(prereq, facts, source.rules, source.lookups);
  if (status.kind === "unsatisfiable") return status.reason;
  return { kind: "composite", reasons: [] };
}

/**
 * Not cached with the view, because it needs the player's pins and pins are
 * intent — which is not in the cache's key and must not be, since a pin moving
 * leaves the facts object identical.
 *
 * So this runs per render for every open sheet and every pinned goal. Measured
 * against both catalogs the trees are small — depth 3, at most 25 nodes — so the
 * cost is a few hundred node visits a render even with twenty goals pinned.
 */
export function deriveNodeDetail(
  source: NodeSource,
  view: NodeView,
  facts: RunFacts,
  pinned: ReadonlySet<TraitId> = EMPTY_PINS,
): NodeDetail {
  const { rules, lookups, naming, records } = source;
  const record = records[view.trait];
  const prereq = record?.prereq ?? NO_GATE;
  const status = evaluate(prereq, facts, rules, lookups);
  const needed = status.kind === "pending" ? neededLines(status.residual, naming) : [];

  return {
    description: record?.descriptionRef == null ? null : textFor(record.descriptionRef),
    needed,
    rows: requirementRows(source, prereq, facts, status.kind === "unsatisfiable"),
    activation:
      view.dormant && record?.activation != null
        ? activationLines(record.activation, facts, naming)
        : [],
    displaces: displacementOf(source, view, facts, pinned),
  };
}

const EMPTY_PINS: ReadonlySet<TraitId> = new Set();

/**
 * The whole gate, one row per part, with the met ones marked.
 *
 * Each part is evaluated on its own rather than matched by the sentence it
 * renders to. Matching text looks equivalent and is not: the residual rewrites
 * a node where it can shrink one, so a gate asking for 3 Fire against a run
 * holding 1 renders "3 more Fire" while the residual renders "2 more Fire",
 * and a row looked for its own text in the residual, failed to find it, and
 * reported met. 24 Hades II records carry an element gate that can do that.
 *
 * An unsatisfiable gate claims nothing met: claiming progress toward something
 * out of reach is the wrong half to guess.
 */
function requirementRows(
  source: NodeSource,
  prereq: Requirement,
  facts: RunFacts,
  blocked: boolean,
): readonly RequirementRow[] {
  const { rules, lookups, naming } = source;
  return gateParts(prereq).map((part) => {
    const status = evaluate(part, facts, rules, lookups);
    // A row that is not met says what is left rather than what the gate asked
    // for, which is the sentence a Forget-Me-Not entry is for.
    const said = status.kind === "pending" ? status.residual : part;
    return {
      text: neededLines(said, naming)[0] ?? "",
      met: !blocked && status.kind === "satisfied",
    };
  });
}

/**
 * The gate as one part per row. Flattened through `all` and no further, which
 * is the split `neededLines` already makes — a group is one line, so the parts
 * and the lines come out in the same order and the same number.
 */
function gateParts(req: Requirement): readonly Requirement[] {
  return req.kind === "all" ? req.of.flatMap(gateParts) : [req];
}

/**
 * What marking this boon would push out, and which pinned goals wanted it.
 *
 * Only asked of a boon the run does not already hold: re-marking what is
 * already in the slot displaces itself, which is nothing.
 */
function displacementOf(
  source: NodeSource,
  view: NodeView,
  facts: RunFacts,
  pinned: ReadonlySet<TraitId>,
): Displacement | null {
  const { records, naming } = source;
  const slot = records[view.trait]?.slot ?? null;
  if (slot === null || view.state === "Obtained") return null;

  const occupant = facts.slots.get(slot);
  if (occupant == null || occupant === view.trait) return null;

  const neededBy: string[] = [];
  for (const goal of pinned) {
    const prereq = records[goal]?.prereq;
    if (prereq != null && asksFor(prereq, occupant)) neededBy.push(naming.trait(goal));
  }
  return { trait: occupant, name: naming.trait(occupant), neededBy };
}

/**
 * Whether a requirement names this trait anywhere in it.
 *
 * `hasTrait` only. A `hasBoonFrom` the displaced boon happens to satisfy is not
 * the same claim — another boon of that god may already be doing it — and
 * saying so would turn a warning worth reading into one worth dismissing.
 */
function asksFor(req: Requirement, trait: TraitId): boolean {
  switch (req.kind) {
    case "hasTrait":
      return req.trait === trait;
    case "all":
    case "anyOf":
      return req.of.some((child) => asksFor(child, trait));
    case "hasBoonFrom":
    case "hasElement":
    case "godInPool":
    case "hasKeepsake":
    case "hasAspect":
    case "hasTalent":
      return false;
  }
}
