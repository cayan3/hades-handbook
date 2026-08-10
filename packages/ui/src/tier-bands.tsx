import type { TraitId } from "@repo/core";
import { BoonNode } from "./boon-node.js";
import type { NodeView } from "./node-view.js";

/**
 * Nodes in tier order, which is also keyboard order.
 *
 * Tab order is DOM order, so a container that emits nodes in tier order has kept
 * the promise and nothing anywhere needs a tab index. The alternative —
 * scattering nodes across a canvas and reordering them with tab indices — is
 * where a promise like this quietly stops being true.
 *
 * Not the god page. That is a laid-out graph with connectors, junctions, a band
 * for the element-gated boons and rim nodes for cross-god ones, and it is a
 * session of its own. This is the ordering rule underneath it, built now so the
 * commitment is testable.
 *
 * Boons with no tier come last, together: most Infusions and every Duo, since a
 * Duo answers to two gods and an Infusion to none. A placeholder for the bands
 * the god page will give them, not a claim that they belong together.
 */
export interface TierBandsProps {
  readonly views: readonly NodeView[];
  /** Which boons are pinned to a goal. */
  readonly pinned?: ReadonlySet<TraitId>;
  readonly onOpen?: (trait: TraitId) => void;
}

const UNTIERED = "Untiered";

export function TierBands({ views, pinned, onOpen }: TierBandsProps) {
  const bands = groupByTier(views);

  return (
    <ol className="tier-bands">
      {bands.map(([label, members]) => (
        <li className="tier-bands__band" key={label}>
          <h3 className="tier-bands__label">{label}</h3>
          <ul className="tier-bands__nodes">
            {members.map((view) => (
              <li key={view.trait}>
                <BoonNode
                  view={view}
                  pinned={pinned?.has(view.trait) ?? false}
                  onOpen={onOpen}
                />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/**
 * Tiers ascending, untiered last. Order within a tier is the caller's, since a
 * god page wants one ordering and a duo grid another.
 */
function groupByTier(views: readonly NodeView[]): ReadonlyArray<[string, NodeView[]]> {
  const byTier = new Map<number, NodeView[]>();
  const untiered: NodeView[] = [];

  for (const view of views) {
    if (view.tier === null) {
      untiered.push(view);
      continue;
    }
    const band = byTier.get(view.tier);
    if (band === undefined) byTier.set(view.tier, [view]);
    else band.push(view);
  }

  const bands: Array<[string, NodeView[]]> = [...byTier.entries()]
    .sort(([a], [b]) => a - b)
    .map(([tier, members]) => [`Tier ${tier}`, members]);
  if (untiered.length > 0) bands.push([UNTIERED, untiered]);
  return bands;
}
