import type { TalentId } from "@repo/core";
import { type GameKey, dataFor } from "./data.js";
import type { MirrorRowRecord, TalentRecord } from "./schema.js";

/**
 * The Mirror of Night's talents and the rows they oppose each other in.
 *
 * Typed accessors for the same reason `keepsakesFor` is one: `dataFor` hands the
 * extraction back as `unknown`, and a cast repeated at each caller is a cast to
 * get wrong at each caller.
 *
 * Both are empty for Hades II, which replaces the Mirror with Arcana and gates
 * no boon on one. Empty rather than absent, so a caller asks either game the
 * same question.
 */
export function talentsFor(game: GameKey): Readonly<Record<TalentId, TalentRecord>> {
  return dataFor(game).talents as Readonly<Record<TalentId, TalentRecord>>;
}

export function mirrorRowsFor(game: GameKey): Readonly<Record<string, MirrorRowRecord>> {
  return dataFor(game).mirrorRows as Readonly<Record<string, MirrorRowRecord>>;
}
