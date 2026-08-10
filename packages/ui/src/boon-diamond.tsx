/**
 * THROWAWAY SCAFFOLDING. Delete this file when the real component library
 * arrives — it exists to prove the stack works end to end, not to be built on.
 *
 * It is deliberately the wrong shape for the product: the five states are here
 * to show that a rendered node can carry one, the art is here to show that the
 * resolver's path survives the bundler untouched, and the accessible name is
 * here to show the shape the accessible path wants. None of the design work is
 * done. There is no Marker, no Dormant badge, no Junction, no required copy on
 * a pool-full Impossible, no god palette and no fallback ladder. Keeping any of
 * this out of politeness would mean the component library starts from a sketch
 * somebody wrote to test a bundler.
 */

import type { BoonState } from "@repo/core";

export interface BoonDiamondProps {
  /** Rendered label. Extracted game text, and never trusted as markup. */
  readonly name: string;
  /** What the resolver returned. The component never builds a path itself. */
  readonly iconPath: string;
  readonly state: BoonState;
}

/**
 * State rides on a data attribute rather than on a class name per state, so the
 * stylesheet owns the ladder and this file owns none of it. Hue is not a
 * channel here: nothing below sets a colour at all.
 */
export function BoonDiamond({ name, iconPath, state }: BoonDiamondProps) {
  return (
    <button type="button" className="boon-diamond" data-state={state} aria-label={`${name} — ${state}`}>
      <img className="boon-diamond__art" src={iconPath} alt="" />
      <span className="boon-diamond__name">{name}</span>
    </button>
  );
}
