import { weaponFor } from "@repo/catalog";
import type { Element, GodId, RunState, TraitId, WeaponId } from "@repo/core";
import { createNodeCache } from "./node-cache.js";
import type { NodeSource, NodeView } from "./node-view.js";

/**
 * What a finished run is, read off the record it was filed in — the shape the
 * **Run Overview** draws.
 *
 * Derived here rather than in the component, like every other derivation in this
 * package: the counts are what has to be right, and they are testable without a
 * document.
 *
 * Everything here is a fact about the run and never a verdict about it. Nothing
 * in the model says how a run ended and no source can tell us, the app never
 * seeing the game — so the counts below are the whole of the summary, and they
 * are the same three the save screen's filled slot shows.
 */
export interface FinishedRun {
  readonly held: number;
  readonly gods: number;
  /** Pins the run finished holding, out of pins it finished with. */
  readonly goalsMet: number;
  readonly goals: number;
  /** The weapon and the form, which are equipped rather than collected. */
  readonly weapon: EquippedWeapon | null;
  readonly groups: readonly FinishedRunGroup[];
  /**
   * The elements the run accumulated, largest first. Empty in Hades I, which
   * has no such system — the one thing the two games' overviews differ by.
   */
  readonly elements: readonly ElementCount[];
}

export interface EquippedWeapon {
  readonly weapon: WeaponId;
  readonly name: string;
  /** The form the run was using, where it recorded one. */
  readonly form: NodeView | null;
}

export interface ElementCount {
  readonly element: Element;
  readonly count: number;
}

/**
 * One heading and the boons under it.
 *
 * Gods first, in the order the run met them, then a group per weapon that gave
 * the run something. A hammer belongs to a weapon rather than to a god, so a
 * grouping keyed on gods alone would hold a page's worth of records and draw
 * none of them.
 */
export interface FinishedRunGroup {
  readonly key: string;
  readonly label: string;
  /** Set on a god's group, and what the heading takes its colour from. */
  readonly god: GodId | null;
  readonly weapon: WeaponId | null;
  readonly boons: readonly NodeView[];
}

/**
 * The run as the overview draws it.
 *
 * `slotOrder` ranks a god's boons the way every other surface does — the core
 * positions in the game's own order, and anything else after them.
 */
export function finishedRun(
  source: NodeSource,
  state: RunState,
  slotOrder: readonly string[],
): FinishedRun {
  const { facts, intent } = state;
  const cache = createNodeCache(source);
  const view = (trait: TraitId): NodeView => cache.viewOf(trait, facts);

  const byGod = new Map<GodId, NodeView[]>();
  const byWeapon = new Map<WeaponId, NodeView[]>();
  const orphans: NodeView[] = [];

  for (const trait of facts.held.keys()) {
    const node = view(trait);
    /**
     * A Duo answers to two gods and is filed under the first of them rather
     * than under both. The overview counts boons, and a record drawn twice
     * would make the group totals disagree with the count in the heading.
     */
    const god = node.god ?? source.records[trait]?.duoGods?.[0] ?? null;
    if (god !== null) push(byGod, god, node);
    else if (node.weapon !== null) push(byWeapon, node.weapon, node);
    else orphans.push(node);
  }

  /* The pool's own order, which is arrival order — the same order the god bar
     runs in, so the overview reads as the run happened. A god who is in the
     pool with nothing to show for it draws no group. */
  const groups: FinishedRunGroup[] = [];
  for (const god of facts.godPool) {
    const boons = byGod.get(god);
    if (boons === undefined) continue;
    groups.push({ key: `god:${god}`, label: source.naming.god(god), god, weapon: null, boons });
    byGod.delete(god);
  }
  // Whatever the pool did not name. A boon can outlive its god's place in the
  // pool through an override, and dropping it would lose it silently.
  for (const [god, boons] of byGod) {
    groups.push({ key: `god:${god}`, label: source.naming.god(god), god, weapon: null, boons });
  }

  for (const [weapon, boons] of byWeapon) {
    groups.push({
      key: `weapon:${weapon}`,
      label: weaponFor(source.game, weapon)?.name ?? weapon,
      god: null,
      weapon,
      boons,
    });
  }
  if (orphans.length > 0) {
    groups.push({ key: "other", label: "Other", god: null, weapon: null, boons: orphans });
  }

  const slotOf = (view: NodeView): string => source.records[view.trait]?.slot ?? "";
  for (const group of groups) {
    (group.boons as NodeView[]).sort(bySlotThenName(slotOrder, slotOf));
  }

  const form = facts.equipped.aspect ?? null;
  const weapon = facts.equipped.weapon ?? null;

  return {
    held: facts.held.size,
    gods: facts.godPool.size,
    // "Did you get what you were after", asked of the run's own last state.
    // Obtained rather than membership of `held`, which is what makes the
    // equipped form — pinnable, and never in `held` — answer the same way.
    goalsMet: [...intent.pins].filter((pin) => view(pin).state === "Obtained").length,
    goals: intent.pins.size,
    weapon:
      weapon === null
        ? null
        : {
            weapon,
            name: weaponFor(source.game, weapon)?.name ?? weapon,
            form: form === null ? null : view(form),
          },
    groups,
    elements: [...facts.elements]
      .map(([element, count]) => ({ element, count }))
      .sort((a, b) => b.count - a.count || a.element.localeCompare(b.element)),
  };
}

function push<K>(into: Map<K, NodeView[]>, key: K, node: NodeView): void {
  const already = into.get(key);
  if (already === undefined) into.set(key, [node]);
  else already.push(node);
}

/** The column order every other surface uses, with the rest alphabetical. */
function bySlotThenName(slotOrder: readonly string[], slotOf: (view: NodeView) => string) {
  const rank = (view: NodeView): number => {
    const at = slotOrder.indexOf(slotOf(view));
    return at === -1 ? slotOrder.length : at;
  };
  return (a: NodeView, b: NodeView): number => rank(a) - rank(b) || a.name.localeCompare(b.name);
}
