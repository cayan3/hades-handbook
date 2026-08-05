import { describe, expect, it } from "vitest";
import { type GameKey, dataFor } from "./data.js";
import type { TraitRecord } from "./schema.js";

/**
 * Does the shipped data actually have the shape this package says it has?
 *
 * Nothing else asks. `dataFor` hands back `unknown` and every consumer casts to
 * `TraitRecord`, so the interface is a claim about a JSON file that the compiler
 * cannot check, and until this file nobody else checked it either. That cost us
 * three fields left optional — meaning "the extractor doesn't write this yet" —
 * for a whole tier after the extractor had started writing them on every
 * record, plus two fields it did write that the interface had never heard of. A
 * wrong `?:` never fails outright; it just spreads, because every consumer of an
 * optional field has to branch on `undefined`.
 *
 * The compiler keeps the two lists below honest, rather than whoever edits the
 * interface next: `Record<RequiredKey, ...>` will not compile if a required
 * field is added to `TraitRecord` and not named here.
 */

const GAMES: readonly GameKey[] = ["hades1", "hades2"];

type RequiredKey<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];
type OptionalKey<T> = { [K in keyof T]-?: object extends Pick<T, K> ? K : never }[keyof T];

const ALWAYS_EMITTED: Record<RequiredKey<TraitRecord>, true> = {
  id: true,
  god: true,
  godKind: true,
  name: true,
  descriptionRef: true,
  icon: true,
  boonCategory: true,
  slot: true,
  rarity: true,
  duoGods: true,
  exclusiveGroup: true,
  elementAffinity: true,
  prereq: true,
  prereqSource: true,
  tier: true,
  blockedBy: true,
  activation: true,
  aspectConflicts: true,
  source: true,
};

const SOMETIMES_EMITTED: Record<OptionalKey<TraitRecord>, true> = {
  _godInferredFromComment: true,
  buildFailure: true,
};

const records = (game: GameKey) =>
  Object.values(dataFor(game).boons as Record<string, TraitRecord>);

describe.each(GAMES)("the %s snapshot matches the declared shape", (game) => {
  it("carries every field declared required, on every record", () => {
    const missing = new Map<string, number>();
    for (const record of records(game)) {
      for (const key of Object.keys(ALWAYS_EMITTED)) {
        if (!(key in record)) missing.set(key, (missing.get(key) ?? 0) + 1);
      }
    }
    expect(Object.fromEntries(missing)).toEqual({});
  });

  it("declares nothing optional that is in fact always there", () => {
    /**
     * The other direction, and the one that actually went wrong. A field
     * present on every record has no business being optional: it forces every
     * reader to handle an absence that cannot happen, and it reads like a
     * promise that the emission is still catching up when it finished long ago.
     */
    const all = records(game);
    const alwaysPresent = Object.keys(SOMETIMES_EMITTED).filter((key) =>
      all.every((record) => key in record),
    );
    expect(alwaysPresent).toEqual([]);
  });

  it("emits no field the interface has never heard of", () => {
    /**
     * `prereqSource` and `buildFailure` were both emitted and undeclared, and
     * nothing could see it. An extra key in a JSON file cast to an interface is
     * invisible to the compiler and harmless at runtime, right up until
     * somebody goes looking for it and concludes it isn't there.
     */
    const declared = new Set([
      ...Object.keys(ALWAYS_EMITTED),
      ...Object.keys(SOMETIMES_EMITTED),
    ]);
    const undeclared = new Set<string>();
    for (const record of records(game)) {
      for (const key of Object.keys(record)) {
        if (!declared.has(key)) undeclared.add(key);
      }
    }
    expect([...undeclared]).toEqual([]);
  });
});

describe("the fields that stayed optional after the extractor caught up", () => {
  /**
   * Three of these were declared optional under the comment "nothing emits it
   * yet", which stopped being true in the very session that wrote the emitter.
   * The counts sit here so a change to any of them has to be looked at rather
   * than quietly absorbed.
   */
  it("fills tier on the records that sit on a ladder", () => {
    const withTier = (game: GameKey) =>
      records(game).filter((r) => r.tier !== null).length;
    expect(withTier("hades1")).toBe(141);
    expect(withTier("hades2")).toBe(163);
  });

  it("fills activation on the six Hades II records with a second threshold", () => {
    expect(records("hades2").filter((r) => r.activation !== null).length).toBe(6);
    expect(records("hades1").filter((r) => r.activation !== null).length).toBe(0);
  });

  it("leaves blockedBy to Hades I alone, now that aspects are not in it", () => {
    /**
     * Hades II's two block edges were both aspect incompatibilities wearing the
     * same key as a boon-versus-boon exclusion. Routing them to
     * `aspectConflicts` left this field genuinely empty for that game, rather
     * than merely unpopulated.
     */
    expect(records("hades1").filter((r) => r.blockedBy !== null).length).toBe(5);
    expect(records("hades2").filter((r) => r.blockedBy !== null).length).toBe(0);
  });

  it("carries the aspect conflicts that used to be miscounted as blocks", () => {
    expect(records("hades1").filter((r) => r.aspectConflicts !== null).length).toBe(16);
    expect(records("hades2").filter((r) => r.aspectConflicts !== null).length).toBe(2);
  });
});
