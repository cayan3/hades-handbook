import boons from "../data/hades1/boons.json" with { type: "json" };
import descriptions from "../data/hades1/descriptions.json" with { type: "json" };
import gods from "../data/hades1/gods.json" with { type: "json" };
import keepsakes from "../data/hades1/keepsakes.json" with { type: "json" };
import mirrorRows from "../data/hades1/mirror_rows.json" with { type: "json" };
import talents from "../data/hades1/talents.json" with { type: "json" };
import version from "../data/hades1/version.json" with { type: "json" };
import weapons from "../data/hades1/weapons.json" with { type: "json" };
import type { GameData } from "./game-data.js";

/**
 * Hades I's snapshot, and the only module that imports its files.
 *
 * One module per game is the whole of the split: nothing reaches these except
 * `loadGame`, through a dynamic import, so a bundler puts each game's ~34 and
 * ~46 kB gzip in a chunk of its own and the front page loads neither.
 *
 * `named_sets.json` is deliberately absent. It still ships, the extractor
 * emitting it and the drift check requiring everything it emits to be here, but
 * its last reader went with the set predicate and an import with no reader is
 * bytes on a cold start.
 */
export const data: GameData = {
  boons,
  gods,
  keepsakes,
  descriptions,
  talents,
  mirrorRows,
  weapons,
  version,
};
