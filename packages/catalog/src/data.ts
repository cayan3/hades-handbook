import hades1Boons from "../data/hades1/boons.json" with { type: "json" };
import hades1Descriptions from "../data/hades1/descriptions.json" with { type: "json" };
import hades1Gods from "../data/hades1/gods.json" with { type: "json" };
import hades1Keepsakes from "../data/hades1/keepsakes.json" with { type: "json" };
import hades1MirrorRows from "../data/hades1/mirror_rows.json" with { type: "json" };
import hades1NamedSets from "../data/hades1/named_sets.json" with { type: "json" };
import hades1Talents from "../data/hades1/talents.json" with { type: "json" };
import hades1Version from "../data/hades1/version.json" with { type: "json" };
import hades2Boons from "../data/hades2/boons.json" with { type: "json" };
import hades2Descriptions from "../data/hades2/descriptions.json" with { type: "json" };
import hades2Gods from "../data/hades2/gods.json" with { type: "json" };
import hades2Keepsakes from "../data/hades2/keepsakes.json" with { type: "json" };
import hades2MirrorRows from "../data/hades2/mirror_rows.json" with { type: "json" };
import hades2NamedSets from "../data/hades2/named_sets.json" with { type: "json" };
import hades2Talents from "../data/hades2/talents.json" with { type: "json" };
import hades2Version from "../data/hades2/version.json" with { type: "json" };

/**
 * The extracted snapshot (just loaded here, nothing else :salute: :salute:).
 *
 * Purposefully untyped beyond `unknown` bc these files are the extractor's own
 * output shape, which isn't (yet) the shape we want for the app itself. There
 * are still some field names and nullability rules that differ, but reconciling
 * them is the schema's job so we shouldn't declare an interface for them here.
 * Big-picture-wise, the "loading" is what was literally missing, while the
 * "validating" of everything actually being correct is owned by the schema.
 *
 * Using static imports instead of file reads here bc this package doesn't have
 * any build steps and directly ships its sources (so something like a
 * `readFileSync` would work under Node but break if same module is bundled for
 * a browser, which is where this project is actually yk trying to do rip).
 * This means consumers can resolve any imports themselves, and that any missing
 * or malformed data files give typecheck failures instead of runtime ones.
 *
 * The Codex descriptions are here now, and they arrive by the route that was
 * always the condition for shipping them: `textFor` exists, so withdrawing the
 * games' own prose is one function body rather than a sweep. Only the entries a
 * record points at are carried, and the markup is resolved at extraction time,
 * so what ships is prose rather than the whole help file.
 */
export interface GameData {
  readonly boons: unknown;
  readonly gods: unknown;
  readonly keepsakes: unknown;
  readonly namedSets: unknown;
  /** Codex prose, keyed by the `descriptionRef` a trait record names. */
  readonly descriptions: unknown;
  /** Mirror talents and their rows. Hades I only; both empty in Hades II. */
  readonly talents: unknown;
  readonly mirrorRows: unknown;
  /** Which game build this snapshot came from; becomes `RunFacts.dataVersion`. */
  readonly version: unknown;
}

export const gameData = {
  hades1: {
    boons: hades1Boons,
    gods: hades1Gods,
    keepsakes: hades1Keepsakes,
    namedSets: hades1NamedSets,
    descriptions: hades1Descriptions,
    talents: hades1Talents,
    mirrorRows: hades1MirrorRows,
    version: hades1Version,
  },
  hades2: {
    boons: hades2Boons,
    gods: hades2Gods,
    keepsakes: hades2Keepsakes,
    namedSets: hades2NamedSets,
    descriptions: hades2Descriptions,
    talents: hades2Talents,
    mirrorRows: hades2MirrorRows,
    version: hades2Version,
  },
} as const satisfies Record<string, GameData>;

export type GameKey = keyof typeof gameData;

export function dataFor(game: GameKey): GameData {
  return gameData[game];
}
