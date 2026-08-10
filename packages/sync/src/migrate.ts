import type { RunFacts, RunIntent, RunState, TraitId } from "@repo/core";
import type { SyncCatalog } from "./catalog-view.js";
import type { QuarantinedEntry } from "./quarantine.js";

/** What a load did to a stored run before anything was allowed to evaluate it. */
export interface MigrationOutcome {
  /** The run with every unidentifiable id removed. Safe to evaluate. */
  state: RunState;
  /** What was removed, in full, so that a later snapshot can put it back. */
  quarantine: readonly QuarantinedEntry[];
  /** Whether `facts.dataVersion` now names the shipped snapshot. */
  restamped: boolean;
}

export interface MigrateOptions {
  /**
   * Re-stamp even though entries were quarantined; the user's "migrate
   * anyway". Without it, a run that lost entries keeps its old stamp, so the
   * next load scans again and the notice is still owed to somebody.
   */
  acceptQuarantine?: boolean;
}

/**
 * Brings a stored run forward to the shipped catalog, quarantining what it
 * can't identify.
 *
 * The rule this exists to enforce is that a game update never silently empties
 * a run. Evaluation is total, so a trait id the catalog has forgotten doesn't
 * throw and doesn't warn. Instead, it simply stops satisfying anything, and a
 * goal the player had met reads as unmet with no way to actually tell why.
 * Dropping such ids quietly would look identical from the outside. So every
 * one of them is moved somewhere it can be counted and named, and the run is
 * only re-stamped once there's literally nothing left to say.
 *
 * **Every load scans, including one whose stamp already matches.** The pass
 * used to skip that case on the grounds that ids checked against the catalog
 * they came out of can only ever agree. They didn't come out of *this* catalog,
 * but instead out of the one that reported the same `dataVersion`, which is the
 * game's `steamBuildId` and moves only when the actual game does. A
 * re-extraction, extractor fix, or overlay correction all change what's in the
 * catalog with the stamp untouched; and the overlay is code, so a change there
 * can't move it even in principle. Both have already happened here: Hades I
 * has carried a single stamp across every catalog this repo has shipped, while
 * the records under it changed. The skip was an optimization over a walk of
 * the run itself (a few dozen lookups, once, at load), so it was defending
 * literally nothing while costing the one guarantee this function literally
 * exists to give :skull: :skull:.
 *
 * The stamp is still worth carrying though, and is what the "this run predates
 * a game update" notice means. It's honest to record but wrong to branch on.
 *
 * Unchecked on purpose, and worth naming so the omissions don't read as
 * oversights. **Resources** and the **equipped weapon** have no table in the
 * catalog to check against; no requirement reads either, so a stale one costs
 * a wrong readout instead of a wrong verdict, and quarantining ids against a
 * list that doesn't exist would just be guessing. **Aspects** are checked
 * against the trait table for both games, which is correct bc Hades II gives a
 * weapon form its own record and in Hades I, a form *is* an ordinary trait
 * record :salute: :salute:.
 */
export function migrate(
  stored: RunState,
  catalog: SyncCatalog,
  options: MigrateOptions = {},
): MigrationOutcome {
  /**
   * A run belonging to the other game is a caller mistake, not a migration.
   *
   * Left to the scan below, it would look like one: almost every id in a Hades
   * I run is absent from the Hades II catalog, so the pass would report a
   * successful quarantine of the entire run. Refusing is the difference between
   * a bug and a destroyed save :salute: :salute:.
   */
  if (stored.facts.game !== catalog.game) {
    throw new Error(
      `stored run is ${stored.facts.game} but the catalog is ${catalog.game}; ` +
        "loading it here would quarantine the whole run",
    );
  }

  const quarantine: QuarantinedEntry[] = [];
  const facts = scanFacts(stored.facts, catalog, quarantine);
  const intent = scanIntent(stored.intent, catalog, quarantine);

  const restamped = quarantine.length === 0 || (options.acceptQuarantine ?? false);
  if (restamped) facts.dataVersion = catalog.dataVersion;

  return { state: { facts, intent }, quarantine, restamped };
}

/**
 * Whether the catalog still names this trait.
 *
 * Asks for an own property instead of testing the lookup against `undefined`
 * bc a plain object answers to `toString` and a handful of other inherited
 * names. A stored id colliding with one of those would otherwise be carried
 * forward as a record that doesn't actually exist.
 */
function knownTrait(catalog: SyncCatalog, trait: TraitId): boolean {
  return Object.hasOwn(catalog.traits, trait);
}

function scanFacts(
  facts: RunFacts,
  catalog: SyncCatalog,
  quarantine: QuarantinedEntry[],
): RunFacts {
  const held = new Map(facts.held);
  for (const [trait, value] of facts.held) {
    if (knownTrait(catalog, trait)) continue;
    quarantine.push({ path: "held", key: trait, value });
    held.delete(trait);
  }

  /**
   * The god pool is checked against the god table's *keys*. Those are bare
   * names; the record inside each one carries a loot table id instead, and a
   * pool written out of that other space would fail every check here and be
   * quarantined in full, which is the loudest possible version of a mistake
   * that's otherwise completely silent.
   */
  const godPool = new Set(facts.godPool);
  for (const god of facts.godPool) {
    if (catalog.gods.has(god)) continue;
    quarantine.push({ path: "godPool", key: god });
    godPool.delete(god);
  }

  /**
   * A slot fails in two different ways and they don't have the same fix. If the
   * slot itself is gone, the entry goes with it. If the slot is still a slot
   * but whatever was in it isn't a trait anymore, the slot survives and is
   * emptied bc "this run has a Cast slot and it's free" is both true and
   * useful, while "this run has no Cast slot" is neither :sobbing: :sobbing:.
   */
  const slots = new Map(facts.slots);
  for (const [slot, occupant] of facts.slots) {
    if (!catalog.slots.has(slot)) {
      quarantine.push({ path: "slots", key: slot, value: occupant, slot: "unknown" });
      slots.delete(slot);
      continue;
    }
    if (occupant === null || knownTrait(catalog, occupant)) continue;
    quarantine.push({ path: "slots", key: slot, value: occupant, slot: "kept" });
    slots.set(slot, null);
  }

  const bans = new Set(facts.bans);
  for (const trait of facts.bans) {
    if (knownTrait(catalog, trait)) continue;
    quarantine.push({ path: "bans", key: trait });
    bans.delete(trait);
  }

  const equipped: RunFacts["equipped"] = {};
  if (facts.equipped.weapon !== undefined) equipped.weapon = facts.equipped.weapon;

  if (facts.equipped.aspect !== undefined) {
    if (knownTrait(catalog, facts.equipped.aspect)) equipped.aspect = facts.equipped.aspect;
    else quarantine.push({ path: "equipped", key: "aspect", value: facts.equipped.aspect });
  }

  if (facts.equipped.keepsake !== undefined) {
    if (catalog.keepsakes.has(facts.equipped.keepsake)) {
      equipped.keepsake = facts.equipped.keepsake;
    } else {
      quarantine.push({ path: "equipped", key: "keepsake", value: facts.equipped.keepsake });
    }
  }

  /**
   * A talent map that loses every entry is deleted instead of left empty. The
   * two are different answers bc empty means the rows were asked about and none
   * is selected, which makes every talent-gated trait impossible for the run,
   * and that's not something a migration is entitled to conclude on the
   * player's behalf.
   *
   * Which cuts both ways, and the second way is easy to miss. A map that
   * arrived empty already carried that answer, and this pass took nothing out
   * of it. Deleting it would turn a real "none selected" back into "nobody
   * asked", with no entry quarantined to say a thing had changed. So the test
   * is whether the scan is what emptied it, not whether it's empty now.
   */
  if (facts.equipped.talents !== undefined) {
    const talents = new Map(facts.equipped.talents);
    for (const [talent, selection] of facts.equipped.talents) {
      if (catalog.talents.has(talent)) continue;
      quarantine.push({ path: "talents", key: talent, value: selection });
      talents.delete(talent);
    }
    const emptiedHere = talents.size === 0 && facts.equipped.talents.size > 0;
    if (!emptiedHere) equipped.talents = talents;
  }

  return {
    game: facts.game,
    dataVersion: facts.dataVersion,
    held,
    godPool,
    elements: new Map(facts.elements),
    slots,
    equipped,
    resources: new Map(facts.resources),
    bans,
  };
}

/**
 * Intent is scanned on the same terms as facts, which is worth saying out loud
 * bc it's the half that nobody would miss. A pin naming a trait that no longer
 * exists renders as a goal that can never be met, so it's quarantined too,
 * but the entry keeps the note text, which is the only thing here the player
 * actually wrote themselves.
 */
function scanIntent(
  intent: RunIntent,
  catalog: SyncCatalog,
  quarantine: QuarantinedEntry[],
): RunIntent {
  const pins = new Set(intent.pins);
  for (const trait of intent.pins) {
    if (knownTrait(catalog, trait)) continue;
    quarantine.push({ path: "pins", key: trait });
    pins.delete(trait);
  }

  const planned = new Set(intent.planned);
  for (const trait of intent.planned) {
    if (knownTrait(catalog, trait)) continue;
    quarantine.push({ path: "planned", key: trait });
    planned.delete(trait);
  }

  const notes = new Map(intent.notes);
  for (const [trait, text] of intent.notes) {
    if (knownTrait(catalog, trait)) continue;
    quarantine.push({ path: "notes", key: trait, value: text });
    notes.delete(trait);
  }

  return { pins, planned, notes };
}
