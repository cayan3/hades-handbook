import boons from "../data/hades2/boons.json" with { type: "json" };
import descriptions from "../data/hades2/descriptions.json" with { type: "json" };
import gods from "../data/hades2/gods.json" with { type: "json" };
import keepsakes from "../data/hades2/keepsakes.json" with { type: "json" };
import mirrorRows from "../data/hades2/mirror_rows.json" with { type: "json" };
import talents from "../data/hades2/talents.json" with { type: "json" };
import version from "../data/hades2/version.json" with { type: "json" };
import weapons from "../data/hades2/weapons.json" with { type: "json" };
import type { GameData } from "./game-data.js";

/** Hades II's snapshot. See the sibling module for what one of these is for. */
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
