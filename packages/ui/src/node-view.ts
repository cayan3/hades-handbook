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
  type ImpossibleNotice,
  impossibleNotice,
  neededLines,
} from "./describe.js";
import { catalogNaming, type Naming } from "./naming.js";

/**
 * Everything a node shows without being asked.
 *
 * Split from the detail below along the line the disclosure ladder draws:
 * always visible is an icon and a state, and everything else waits for a hover
 * or a tap. That split is not only a design choice, it is what keeps a page of
 * a hundred and thirty nodes affordable — the parts that cost a second walk of
 * a requirement tree are all on the other side of it.
 *
 * Two fields cost more than the rest and are computed only when they can
 * possibly be non-empty. `notice` needs the reason behind an impossible
 * verdict, so it is asked for only once the state is already **Impossible**,
 * which across the shipped data is by a wide margin the rarest state. `dormant`
 * needs a second requirement evaluated, and only six records in either game
 * have one to evaluate.
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
  /** For a dormant Infusion, the threshold against the run's own count. */
  readonly activation: readonly string[];
}

/**
 * The catalog and rules a set of nodes is derived against.
 *
 * The game rules arrive as a parameter rather than being picked from the game
 * id here. Two implementations exist, one per game, and a component library
 * that chose between them would have to import both — which would put the whole
 * of one game's feasibility logic into every page of the other.
 *
 * The records arrive as data for the reason the rules packages take theirs that
 * way: it lets a test state a world of three boons instead of asserting against
 * six hundred shipped ones, and it lets a demonstration show a verdict the
 * shipped data cannot produce without pretending the data produces it.
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
 * Wires a source over the shipped catalog.
 *
 * The rules and the lookups stay the caller's; the records default to the
 * shipped ones and can be replaced, which is how the tests and the demonstration
 * put a boon in front of the derivation that the games do not contain.
 */
export function createNodeSource(
  game: GameKey,
  rules: GameRules,
  lookups: CatalogLookups,
  records: Readonly<Record<TraitId, TraitRecord>> = traitsFor(game),
): NodeSource {
  // Built once. The map is keyed by keepsake and asked by god, and rebuilding
  // the inversion per impossible node would rescan it on every render of a
  // full pool -- which is exactly the run where every absent god is one.
  const byGod = new Map<GodId, KeepsakeId>();
  for (const [keepsake, god] of forcingKeepsakes(game)) byGod.set(god, keepsake);

  return {
    game,
    rules,
    lookups,
    records,
    naming: catalogNaming(game, records),
    forcingKeepsake: (god) => byGod.get(god) ?? null,
  };
}

/**
 * A requirement that asks for nothing, for a boon that is gated on nothing.
 *
 * Roughly two thirds of the records in each game have no prerequisite at all,
 * and the evaluator answers a childless `all` with "satisfied" — so this is the
 * shape of "no gate" rather than a stand-in for one, and it keeps the
 * derivation to a single path instead of a special case that would then need
 * its own answer for every state below.
 */
const NO_GATE: Requirement = Object.freeze({ kind: "all", of: [] });

/**
 * The rarity to show, which is usually none.
 *
 * A held boon carries a rarity, and for a great many boons that rarity is
 * something nobody observed: 191 records in the first game and 86 in the second
 * declare an *empty* list of rarities, and the writer that records a mark falls
 * back to the first declared rarity, or to Common when there are none. So for
 * those records the field says "Common" about a boon the data never said could
 * be Common.
 *
 * Rarity is display state, and displaying a value the data does not have turns
 * a guess into an observation on screen. So this shows a rarity only where the
 * record declares that the boon has rarities at all, and nothing otherwise —
 * an absent treatment being the honest rendering of an absent fact.
 *
 * That leaves a smaller version of the same problem, named here rather than
 * hidden: even where the list is non-empty, the held rarity is that same
 * fallback unless whatever recorded the mark asked which one. Closing it is a
 * question for the surface that owns the marking gesture, not for this one,
 * which has no way to ask.
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
 * One node, derived.
 *
 * The state comes from the engine's own helper and is never recomputed here —
 * a view that decided for itself which of the five buckets a boon was in would
 * be a second implementation of the rule, and the two would agree right up
 * until one of them was changed.
 *
 * The reason behind an impossible verdict is asked for separately, and in the
 * same order the helper settles the state: the boon's own feasibility first,
 * because a boon can be out of reach while its prerequisite stays perfectly
 * satisfiable, then the prerequisite. Getting that order wrong would show a
 * player the wrong sentence about the right verdict.
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
    notice:
      state === "Impossible"
        ? impossibleNotice(reasonFor(source, trait, prereq, facts), naming, source.forcingKeepsake)
        : null,
    dormant:
      state === "Obtained" &&
      record?.activation != null &&
      evaluate(record.activation, facts, rules, lookups).kind !== "satisfied",
    label: accessibleName(name, state, god, tier),
  };
}

/**
 * Why a boon is impossible, in the order the state was decided.
 *
 * Only ever asked once the answer is known to be Impossible, so the fallback at
 * the end is unreachable by construction rather than by luck — and it is an
 * empty group rather than a throw, because a node that renders nothing is a
 * worse outcome than a node that says less than it could.
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
 * The half of a node that waits to be asked for.
 *
 * Recomputed per inspection instead of cached with the view: one node is open
 * at a time, and the work is a walk of a single requirement tree.
 */
export function deriveNodeDetail(
  source: NodeSource,
  view: NodeView,
  facts: RunFacts,
): NodeDetail {
  const { rules, lookups, naming, records } = source;
  const record = records[view.trait];
  const prereq = record?.prereq ?? NO_GATE;
  const status = evaluate(prereq, facts, rules, lookups);

  return {
    description: record?.descriptionRef == null ? null : textFor(record.descriptionRef),
    needed: status.kind === "pending" ? neededLines(status.residual, naming) : [],
    activation:
      view.dormant && record?.activation != null
        ? activationLines(record.activation, facts, naming)
        : [],
  };
}
