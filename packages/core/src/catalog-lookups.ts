import type { GodId, TraitId } from "./ids.js";

/**
 * The catalog seam: member lists. (yep, nothing else!)
 *
 * One requirement atom asks about a god's boons ("hold a boon of Hera"), and it
 * can't be answered w/o yk knowing who the members are, which is static catalog
 * data and thus must not be imported by this package (i.e. `core`) at all.
 * Therefore, this package is what *declares* the port while `catalog` itself is
 * what implements it. This is the same dependency inversion/structure that lets
 * this package declare the game-rules interface for the two game-specific
 * packages to implement separately, i.e. `GameRules` and `rules-hades*`. In
 * both cases, the dependency runs "inward".
 *
 * This is deliberately kept to one method instead of three: `isCoreBoon`
 * doesn't have any callers in `core`, while `prereqOf` is already passed to
 * `boonState` as data (since a caller rendering a trait already knows that
 * trait's prerequisite(s)).
 *
 * One method rather than none, which was genuinely tempting: reading a held
 * trait's god back through a `godOf(traitId)` lookup would walk the ~20 traits
 * a run holds instead of a god's ~35 boons and hand back a scalar. It doesn't
 * work bc the atom has to count what's still *gettable*, not just what's held,
 * to tell "not yet" apart from "impossible" — and a lookup that reads holdings
 * backwards can't see what's still on offer.
 *
 * Implementations must be pure and stable for a given data snapshot (i.e.
 * within a snapshot, implementations must be pure and return the same members
 * for the same id) bc evaluation is memoized upstream on this very assumption
 * (i.e. that the same set id yields the same members every time).
 */
export interface CatalogLookups {
  /** Every boon a god grants. Not the same as the god's *held* boons. */
  boonsOfGod(g: GodId): readonly TraitId[];
}
