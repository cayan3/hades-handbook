import type { TraitId } from "@repo/core";
import { BoonNode } from "./boon-node.js";
import type { NodeView } from "./node-view.js";

/**
 * Nodes in tier order, which is also the keyboard order: tab order is DOM
 * order, so emitting them in tier order is the whole of that promise and
 * nothing needs a tab index.
 *
 * The tier is never drawn. It is the game's internal rank and the game does not
 * show it to a player either, so here it orders the page and nothing more — a
 * band is a group with no heading.
 *
 * Not the god page, which is a laid-out graph with connectors and junctions and
 * is a session of its own. Untiered boons come last, together: most Infusions
 * and every Duo. A placeholder for the bands that page will give them, not a
 * claim that they belong together.
 */
export interface TierBandsProps {
  readonly views: readonly NodeView[];
  /** Which boons are pinned to a goal. */
  readonly pinned?: ReadonlySet<TraitId>;
  readonly onOpen?: (trait: TraitId) => void;
}

const UNTIERED = "untiered";

export function TierBands({ views, pinned, onOpen }: TierBandsProps) {
  const bands = groupByTier(views);

  return (
    <ol className="tier-bands">
      {bands.map(([key, members]) => (
        <li className="tier-bands__band" key={key}>
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
 * god page wants one ordering and a duo grid another. The string is a React key
 * and never reaches the page.
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
    .map(([tier, members]) => [String(tier), members]);
  if (untiered.length > 0) bands.push([UNTIERED, untiered]);
  return bands;
}
