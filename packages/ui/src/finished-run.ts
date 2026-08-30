import { weaponFor } from "@repo/catalog";
import type { Element, GodId, RunState, TraitId, WeaponId } from "@repo/core";
import { ELEMENTS } from "./elements.js";
import { createNodeCache } from "./node-cache.js";
import { type NodeDetail, type NodeSource, type NodeView, deriveNodeDetail } from "./node-view.js";

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
   * The elements the run accumulated — **all five of Hades II's, in the game's
   * own order, including the ones it gathered none of.**
   *
   * A row that only names what a run has is a row a player has to read to find
   * out what is missing, and it rearranges as the run picks them up. Five marks
   * and five numbers say it at a glance.
   *
   * Empty in Hades I, which has no such system, and that is the one thing the
   * two games' overviews differ by.
   */
  readonly elements: readonly ElementCount[];
}

export interface EquippedWeapon {
  readonly weapon: WeaponId;
  readonly name: string;
  /** The form the run was using, where it recorded one. */
  readonly form: FinishedBoon | null;
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
  readonly boons: readonly FinishedBoon[];
}

/**
 * One boon and everything the view can say about it, paired the way a **Goal**
 * is: the summary and the detail are one derivation, so a surface that shows
 * both cannot show two different answers.
 */
export interface FinishedBoon {
  readonly view: NodeView;
  readonly detail: NodeDetail;
  /**
   * How far the run levelled it — Pom of Power ranks, and the same field a
   * hammer's rank arrives in. On the boon rather than on the view because a
   * `NodeView` is derived from the catalog and the gate, and this is the one
   * number that is only true of the run that held it.
   */
  readonly level: number;
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
  const boonOf = (trait: TraitId): FinishedBoon => {
    const node = view(trait);
    return {
      view: node,
      detail: deriveNodeDetail(source, node, facts, intent.pins),
      // The equipped form is not in `held`, so it has no level to read and
      // takes the floor every other boon starts at.
      level: facts.held.get(trait)?.level ?? 1,
    };
  };

  const byGod = new Map<GodId, FinishedBoon[]>();
  const byWeapon = new Map<WeaponId, FinishedBoon[]>();
  const orphans: FinishedBoon[] = [];

  for (const trait of facts.held.keys()) {
    const boon = boonOf(trait);
    /**
     * A Duo answers to two gods and is drawn under **both**, which is what the
     * member lists do and what every other surface in the app does. So the
     * groups can total more than `held`, and that is right rather than a
     * discrepancy: the count above is boons the run held, and the groups are
     * where to find each one.
     */
    const gods = boon.view.god !== null ? [boon.view.god] : (source.records[trait]?.duoGods ?? []);
    if (gods.length > 0) for (const god of gods) push(byGod, god, boon);
    else if (boon.view.weapon !== null) push(byWeapon, boon.view.weapon, boon);
    else orphans.push(boon);
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

  const slotOf = (boon: FinishedBoon): string => source.records[boon.view.trait]?.slot ?? "";
  for (const group of groups) {
    (group.boons as FinishedBoon[]).sort(bySlotThenName(slotOrder, slotOf));
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
            form: form === null ? null : boonOf(form),
          },
    groups,
    elements:
      source.game === "hades2"
        ? ELEMENTS.map((element) => ({ element, count: facts.elements.get(element) ?? 0 }))
        : [],
  };
}

function push<K>(into: Map<K, FinishedBoon[]>, key: K, boon: FinishedBoon): void {
  const already = into.get(key);
  if (already === undefined) into.set(key, [boon]);
  else already.push(boon);
}

/** The column order every other surface uses, with the rest alphabetical. */
function bySlotThenName(slotOrder: readonly string[], slotOf: (boon: FinishedBoon) => string) {
  const rank = (boon: FinishedBoon): number => {
    const at = slotOrder.indexOf(slotOf(boon));
    return at === -1 ? slotOrder.length : at;
  };
  return (a: FinishedBoon, b: FinishedBoon): number =>
    rank(a) - rank(b) || a.view.name.localeCompare(b.view.name);
}
