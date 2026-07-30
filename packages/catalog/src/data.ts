import hades1Boons from "../data/hades1/boons.json" with { type: "json" };
import hades1Gods from "../data/hades1/gods.json" with { type: "json" };
import hades1Keepsakes from "../data/hades1/keepsakes.json" with { type: "json" };
import hades1NamedSets from "../data/hades1/named_sets.json" with { type: "json" };
import hades1Version from "../data/hades1/version.json" with { type: "json" };
import hades2Boons from "../data/hades2/boons.json" with { type: "json" };
import hades2Gods from "../data/hades2/gods.json" with { type: "json" };
import hades2Keepsakes from "../data/hades2/keepsakes.json" with { type: "json" };
import hades2NamedSets from "../data/hades2/named_sets.json" with { type: "json" };
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
 * The localized text bundle is *not* here right now. As "literally the verbatim
 * text descriptions", it's the most exposed content produced by the extraction,
 * so shipping it here and now would :sparkles: :sparkles: put it all out on the
 * Internet :sparkles: :sparkles: without being able to withdraw it. A resolver
 * will be written later to yk make all that potentially-not-cool-with-the-
 * copyright-gods content take-down-able slash replacable with just a single
 * edit (:sunglasses: :sunglasses:), so all the localized text stuff will just
 * have to wait until that's actually written before being allowed to join the
 * catalog with its buddies.
 */
export interface GameData {
  readonly boons: unknown;
  readonly gods: unknown;
  readonly keepsakes: unknown;
  readonly namedSets: unknown;
  /** Which game build this snapshot came from; becomes `RunFacts.dataVersion`. */
  readonly version: unknown;
}

export const gameData = {
  hades1: {
    boons: hades1Boons,
    gods: hades1Gods,
    keepsakes: hades1Keepsakes,
    namedSets: hades1NamedSets,
    version: hades1Version,
  },
  hades2: {
    boons: hades2Boons,
    gods: hades2Gods,
    keepsakes: hades2Keepsakes,
    namedSets: hades2NamedSets,
    version: hades2Version,
  },
} as const satisfies Record<string, GameData>;

export type GameKey = keyof typeof gameData;

export function dataFor(game: GameKey): GameData {
  return gameData[game];
}
