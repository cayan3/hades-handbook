import { type TraitRecord, dataFor, traitsFor } from "@repo/catalog";
import type { GameId, GodId, KeepsakeId, Requirement, SlotId, TalentId, TraitId } from "@repo/core";

/**
 * The catalog reads this package needs, taken as data instead of being imported.
 *
 * This has the same shape as the one the rules implementations take, and for
 * the same reason: i.e. a test can state a world of four traits and two gods
 * instead of asserting against six hundred shipped records, and the migration
 * pass is literally exactly the code where a test needs to say "this id isn't
 * actually in the catalog silly goose" without hunting for an id that the real
 * catalog just happens not to have.
 *
 * Every set here is a set of *identifiers* bc the only question asked of them
 * is if a stored id still names something. The trait table is the one
 * exception: marking a boon would read its god and its slot off the record.
 */
export interface SyncCatalog {
  game: GameId;

  /**
   * The game build this snapshot came from, which is what a persisted run is
   * stamped with and what the migration pass compares against.
   */
  dataVersion: string;

  /** Trait records with the overlay folded in. */
  traits: Readonly<Record<TraitId, TraitRecord>>;

  /**
   * Every name that addresses a god, which is emphatically *not* the loot table
   * ids those records carry inside. The two spaces don't overlap, so a pool
   * built out of the wrong one wouldn't match any requirement or member list
   * while not even giving any hints as to why.
   *
   * It's also not the same as the god table's keys (in either direction).
   * This is actually **wider** bc a god can grant boons without having a table
   * entry at all; e.g. Hades II gives records to four who only make "cameos"
   * (Artemis, Athena, Dionysus, Hades), and a run that takes one of those
   * rewards has yk genuinely met that god lolol, so checking against the table
   * alone would quarantine a real one at the next update. Also **narrower** bc
   * the table is a loot table and carries reward slots that aren't gods at all.
   *
   * Eleven names for Hades I and sixteen for Hades II.
   */
  gods: ReadonlySet<GodId>;

  keepsakes: ReadonlySet<KeepsakeId>;

  /** Every slot some trait record claims, which is where slot ids come from. */
  slots: ReadonlySet<SlotId>;

  /**
   * Every Mirror talent this catalog can name. The union of the talents some
   * requirement gates on and the members of the rows below bc those are
   * actually two different populations: a row member that gates nothing
   * wouldn't appear in any requirements, and quarantining it on reload would be
   * a run losing an answer that the player actually gave :neutral_face: :neutral_face:.
   */
  talents: ReadonlySet<TalentId>;

  /**
   * The Mirror rows a source asks about, one three-way question each.
   *
   * Empty for both shipped games today (see `shippedCatalog` for why, and for
   * what has to change upstream before it stops being empty).
   */
  mirrorRows: readonly MirrorRow[];
}

/**
 * One mutually exclusive pair at the Mirror of Night. Hades I only; Hades II's
 * Arcana gates ermm nothing iirc, so the list is empty there instead of the
 * type just like being absent for the game entirely.
 */
export interface MirrorRow {
  id: string;
  members: readonly [TalentId, TalentId];
}

/** The build stamp as the extractor writes it into each snapshot. */
interface VersionStamp {
  steamBuildId: string;
}

/** What the extractor prefixes a loot-table entry with when it isn't a god. */
const MECHANIC_PREFIX = "__mechanic_";

/**
 * Walks a requirement collecting the gods and talents it names.
 *
 * A talent is the one identifier in the whole model with no record of its own
 * (the extraction mentions talents only inside the gates that read them) so
 * "which talents exist" has to be recovered from those gates instead of looked
 * up. Gods are collected on the same pass for the cheaper reason that a gate
 * naming one is another place the name is used, and the question here is which
 * names the model uses instead of which actually have yk like records lol.
 *
 * This recurses instead of pattern-matching (lol why is that giving 15-122 over
 * 15-150 vibes :sobbing: :sobbing:) on the shapes that the data happens to use
 * bc a gate nested one level deeper than expected would otherwise drop its
 * identifier out of the known set and get it quarantined on the next reload.
 */
function collectNames(req: Requirement, gods: Set<GodId>, talents: Set<TalentId>): void {
  switch (req.kind) {
    case "all":
    case "anyOf":
      for (const child of req.of) collectNames(child, gods, talents);
      return;
    case "hasTalent":
      talents.add(req.talent);
      return;
    case "hasBoonFrom":
    case "godInPool":
      gods.add(req.god);
      return;
    case "hasTrait":
    case "hasElement":
    case "hasKeepsake":
    case "hasAspect":
      return;
  }
}

function build(game: GameId): SyncCatalog {
  const data = dataFor(game);
  const traits = traitsFor(game);

  /**
   * The god table is a dump of the game's loot table, which actually enumerates
   * reward *slots* instead of like just deities. This means it also includes
   * the Daedalus Hammer and Pom of Power variants under keys that the extractor
   * prefixes. They aren't yk gods lol and no run ever takes a reward from one,
   * so they're dropped here instead of somewhere upstream, where removing them
   * would make the extraction unfaithful to the file it reads :no_mouth: :no_mouth:.
   *
   * The prefix is the only thing that separates them. `kind` doesn't since
   * Hermes, Chaos, and Selene are `NonPoolSlot` too bc they grant boons without
   * ever claiming a slot (that's abt the "god pool cap", not about whether
   * they're yk "gods" in the first place). All three should (& do) stay bc a
   * Hermes boon ermmm really is a reward taken from Hermes lol???, so a pool
   * may (& should in fact) name him and the check here has to agree.
   */
  const gods = new Set<GodId>(
    Object.keys(data.gods as Record<string, unknown>).filter(
      (name) => !name.startsWith(MECHANIC_PREFIX),
    ),
  );
  const keepsakes = new Set<KeepsakeId>(Object.keys(data.keepsakes as Record<string, unknown>));

  const slots = new Set<SlotId>();
  const talents = new Set<TalentId>();
  for (const record of Object.values(traits)) {
    if (record.slot !== null) slots.add(record.slot);
    if (record.god !== null) gods.add(record.god);
    for (const god of record.duoGods ?? []) gods.add(god);
    if (record.prereq !== null) collectNames(record.prereq, gods, talents);
    if (record.activation !== null) collectNames(record.activation, gods, talents);
  }

  /**
   * No rows; this is a gap instead of a game fact.
   *
   * Hades I really does have three rows, and a source is supposed to read
   * the pairs from here so that a fourth row is a data change instead of a UI
   * change. The extraction doesn't emit them bc a talent has no record and the
   * pairing (i.e. which two members/mirror talents are opposites) isn't
   * anywhere that the extractor reads rn. Writing the three rows out by hand
   * here is what the overlay check exists to catch, and one of the six ids
   * involved gates nothing at all, so nothing downstream would ever even notice
   * it going stale :persevere: :persevere:.
   *
   * The consequence while this is empty is that a manual source doesn't ask
   * any questions abt the Mirror, every talent stays uncollected, and a
   * talent-gated Hades I trait reads as "nobody asked" lol instead of as
   * impossible. This is the safe direction of the two, which is why this ships
   * as empty instead of guessed.
   */
  const mirrorRows: readonly MirrorRow[] = [];
  for (const row of mirrorRows) for (const member of row.members) talents.add(member);

  return {
    game,
    dataVersion: (data.version as VersionStamp).steamBuildId,
    traits,
    gods,
    keepsakes,
    slots,
    talents,
    mirrorRows,
  };
}

const SHIPPED: Readonly<Record<GameId, SyncCatalog>> = Object.freeze({
  hades1: build("hades1"),
  hades2: build("hades2"),
});

/**
 * The shipped catalog for one game, built once and handed back by identity.
 *
 * A data snapshot fixes every set in here, so rebuilding per call would ermmmm
 * rescan the whole trait table on every load and every mark (o_0 meep :no_mouth:
 * efficiency moment 0_o).
 */
export function shippedCatalog(game: GameId): SyncCatalog {
  return SHIPPED[game];
}
