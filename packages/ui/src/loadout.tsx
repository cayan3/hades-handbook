import type { SlotId, TraitId } from "@repo/core";
import { OverrideMarker, RarityMark } from "./chrome.js";
import type { NodeView } from "./node-view.js";

/**
 * The run's obtained boons as a list, and the other half of the accessible
 * path.
 *
 * Slotted boons come first and in slot order, because the slot is what a
 * displacement is about: seeing that Melee is occupied is what makes "taking
 * this replaces Storm Lightning" make sense a moment later. Everything else
 * follows in one group.
 *
 * The "held by hand" marker sits per entry rather than on the panel, which is
 * the rule about divergence: it is never a mode the run is in.
 */

export interface LoadoutEntry {
  readonly view: NodeView;
  /** The slot it occupies, where it occupies one. */
  readonly slot: SlotId | null;
  /** Whether this boon's held state is the user's rather than the source's. */
  readonly overridden?: boolean;
}

export interface LoadoutProps {
  readonly entries: readonly LoadoutEntry[];
  /** The equipped kit, which is not the Loadout and is shown beside it. */
  readonly equipped?: readonly { readonly label: string; readonly value: string }[];
  readonly onOpen?: (trait: TraitId) => void;
}

export function Loadout({ entries, equipped = [], onOpen }: LoadoutProps) {
  const slotted = entries.filter((entry) => entry.slot !== null);
  const rest = entries.filter((entry) => entry.slot === null);

  return (
    <section className="loadout">
      <h2>Loadout</h2>
      {entries.length === 0 ? (
        <p className="loadout__empty">No boons yet.</p>
      ) : (
        <ul className="loadout__list">
          {[...slotted, ...rest].map((entry) => (
            <li key={entry.view.trait} className="loadout__entry">
              <button
                type="button"
                className="loadout__boon"
                onClick={onOpen === undefined ? undefined : () => onOpen(entry.view.trait)}
                aria-haspopup={onOpen === undefined ? undefined : "dialog"}
              >
                <span className="loadout__slot">{entry.slot ?? "—"}</span>
                <span className="loadout__name">{entry.view.name}</span>
                {entry.view.rarity === null ? null : <RarityMark rarity={entry.view.rarity} />}
              </button>
              {entry.overridden === true ? <OverrideMarker /> : null}
            </li>
          ))}
        </ul>
      )}

      {equipped.length === 0 ? null : (
        <dl className="loadout__equipped">
          {equipped.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
