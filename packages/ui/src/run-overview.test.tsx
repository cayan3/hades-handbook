/**
 * @vitest-environment jsdom
 *
 * The Run Overview: what the run held, and nothing about how it ended.
 */

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TraitId } from "@repo/core";
import type { FinishedBoon, FinishedRun } from "./finished-run.js";
import type { NodeView } from "./node-view.js";
import { NodePresentation } from "./presentation.js";
import { RunOverview } from "./run-overview.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(node: ReactElement): void {
  act(() =>
    root.render(
      <NodePresentation ladder="real-art" game="hades2">
        {node}
      </NodePresentation>,
    ),
  );
}

function view(name: string): NodeView {
  return {
    trait: name as TraitId,
    name,
    state: "Obtained",
    god: "Poseidon",
    weapon: null,
    aspect: false,
    tier: null,
    iconKey: "official/hades2/Poseidon_01",
    kind: null,
    rarity: "Common",
    rarities: [],
    element: null,
    notice: null,
    dormant: false,
    replaces: null,
    label: `${name} — Obtained — Poseidon`,
  };
}

/** A boon as the derivation hands one over: the view, its detail and its level. */
function boon(name: string, over: Partial<FinishedBoon> = {}): FinishedBoon {
  return {
    view: view(name),
    detail: {
      description: `What ${name} does.`,
      needed: [],
      rows: [],
      activation: [],
      displaces: null,
    },
    level: 1,
    ...over,
  };
}

function run(over: Partial<FinishedRun> = {}): FinishedRun {
  return {
    held: 0,
    gods: 0,
    goalsMet: 0,
    goals: 0,
    weapon: null,
    groups: [],
    elements: [],
    ...over,
  };
}

function overview(
  over: Partial<FinishedRun> = {},
  onResume: () => void = () => {},
  onSaveSlots = () => {},
) {
  return <RunOverview run={run(over)} onResume={onResume} onSaveSlots={onSaveSlots} />;
}

function texts(selector: string): string[] {
  return [...container.querySelectorAll(selector)].map((el) => el.textContent?.trim() ?? "");
}

describe("Run Overview", () => {
  /**
   * The whole of what the row settled: nothing in the model says how a run
   * ended, so the view claims nothing about it. A word here would be the one
   * thing on the page that is not read off the record.
   */
  it("passes no verdict on the run", () => {
    render(
      overview({ held: 3, gods: 2, groups: [{ key: "god:Poseidon", label: "Poseidon", god: "Poseidon", weapon: null, boons: [boon("Tidal Dash")] }] }),
    );

    for (const word of ["Escaped", "Died", "Victory", "Defeat", "Cleared"]) {
      expect(container.textContent, word).not.toContain(word);
    }
  });

  it("counts the boons, the gods and the goals", () => {
    render(overview({ held: 14, gods: 4, goalsMet: 2, goals: 3 }));

    expect(texts(".overview__stat")).toEqual(["Boons14", "Gods met4", "Goals2/3"]);
  });

  /** A run nobody pinned anything in has no fraction to show, not "0/0". */
  it("draws a dash where the run pinned nothing", () => {
    render(overview({ held: 5 }));

    expect(texts(".overview__stat")[2]).toBe("Goals—");
  });

  it("draws each group's boons under its heading", () => {
    render(
      overview({
        held: 3,
        groups: [
          {
            key: "god:Poseidon",
            label: "Poseidon",
            god: "Poseidon",
            weapon: null,
            boons: [boon("Tidal Dash"), boon("Wave Pulse")],
          },
          {
            key: "weapon:WeaponSword",
            label: "Stygian Blade",
            god: null,
            weapon: "WeaponSword",
            boons: [boon("Breaching Slash")],
          },
        ],
      }),
    );

    expect(texts(".overview__groupname")).toEqual(["Poseidon", "Stygian Blade"]);
    expect(texts(".overview__tilename")).toEqual([
      "Tidal Dash",
      "Wave Pulse",
      "Breaching Slash",
    ]);
  });

  it("names the elements the run gathered, and draws no row without them", () => {
    render(overview({ elements: [{ element: "Water", count: 3 }] }));
    // The mark and the number are what is drawn; the word is carried for a
    // reader who gets no mark.
    expect(texts(".overview__elements li")).toEqual(["3Water: 3"]);
    expect(container.querySelector(".overview__elements li span")?.textContent).toBe("3");

    render(overview({}));
    expect(container.querySelector(".overview__elements")).toBeNull();
  });

  it("draws the weapon and the form it was carrying", () => {
    render(
      overview({
        weapon: { weapon: "WeaponSword", name: "Stygian Blade", form: boon("Aspect of Nemesis") },
      }),
    );

    expect(texts(".overview__weapon")).toEqual(["Stygian Blade"]);
    expect(texts(".overview__tilename")).toEqual(["Aspect of Nemesis"]);
  });

  /**
   * A run is allowed to be filed with pins and no boons — somebody put them
   * there — so this is a real record rather than a state to design around. It
   * reads as itself.
   */
  it("says a run held no boons rather than drawing an empty section", () => {
    render(overview({ goals: 1 }));

    expect(texts(".overview__nothing")).toEqual(["This run held no boons."]);
    expect(container.querySelector(".overview__group")).toBeNull();
  });

  /**
   * This is the view an image export carries off the site, which is what makes
   * the disclaimer part of the picture rather than page furniture around it.
   */
  it("carries the unaffiliated line, from the one constant", () => {
    render(overview({ held: 1 }));

    expect(container.querySelector(".overview__unaffiliated")?.textContent).toContain(
      "no connection to them",
    );
  });

  /**
   * A bare boon icon carries rarity and nothing else, which is what the
   * Loadout's panel draws. The god is the group heading above the tile, so an
   * outline in the god's colour would spend the node's one identity channel
   * repeating it — and beside the band it reads as two rings meaning two things.
   *
   * A Duo still reads, and this is what makes dropping the god colour safe: its
   * band is the games' own Duo colour, the same one the card writes the word in.
   */
  it("colours a tile by rarity alone, a Duo included", () => {
    const duo = boon("Zeus & Hera", { view: { ...view("Zeus & Hera"), god: null, kind: "duo" } });
    render(
      overview({
        groups: [
          {
            key: "god:Hera",
            label: "Hera",
            god: "Hera",
            weapon: null,
            boons: [duo, boon("Sworn Strike", { view: { ...view("Sworn Strike"), god: "Hera" } })],
          },
        ],
      }),
    );

    const icons = [...container.querySelectorAll<HTMLElement>(".overview__tileicon")];
    expect(icons[0]?.style.getPropertyValue("--rarity")).toBe("#D2FF61");
    expect(icons[0]?.dataset["treatment"]).toBe("Duo");
    // Common is painted nowhere in this product and is not painted here either,
    // so the second tile carries no band rather than a neutral one.
    expect(icons[1]?.style.getPropertyValue("--rarity")).toBe("");
    expect(icons[1]?.dataset["treatment"]).toBeUndefined();
    // And no god's colour on either, which is the half that changed.
    for (const icon of icons) expect(icon.style.getPropertyValue("--god")).toBe("");
    // The heading still carries it — that is where the god is named.
    expect(
      container.querySelector<HTMLElement>(".overview__group")?.style.getPropertyValue("--god"),
    ).toBe("#2080FF");
  });

  /**
   * Rarity was the one thing on this view that took a click to see, and the
   * Loadout's panel already answers it on the tile. Same treatment, same place.
   */
  it("says what each boon was taken at, on the tile", () => {
    render(
      overview({
        groups: [
          {
            key: "god:Poseidon",
            label: "Poseidon",
            god: "Poseidon",
            weapon: null,
            boons: [
              boon("Tidal Dash", { view: { ...view("Tidal Dash"), rarity: "Heroic" } }),
              boon("Sea Storm", { view: { ...view("Sea Storm"), god: null, kind: "duo" } }),
            ],
          },
        ],
      }),
    );

    const icons = [...container.querySelectorAll<HTMLElement>(".overview__tileicon")];
    expect(icons.map((el) => el.dataset["treatment"])).toEqual(["Heroic", "Duo"]);
    // The colour rides with it, or the band has nothing to paint.
    expect(icons[0]?.style.getPropertyValue("--rarity")).not.toBe("");
  });

  /**
   * A Duo is drawn under both of its gods, so a trait id no longer names one
   * tile. Keyed on the id alone, one click opened the card in both groups at
   * once — against this view's own one-at-a-time rule.
   */
  it("opens a Duo's card in the group clicked, not in both it appears in", () => {
    const duo = boon("Sea Storm", { view: { ...view("Sea Storm"), god: null, kind: "duo" } });
    render(
      overview({
        groups: [
          { key: "god:Poseidon", label: "Poseidon", god: "Poseidon", weapon: null, boons: [duo] },
          { key: "god:Zeus", label: "Zeus", god: "Zeus", weapon: null, boons: [duo] },
        ],
      }),
    );

    const tiles = [...container.querySelectorAll<HTMLElement>(".overview__tile")];
    expect(tiles).toHaveLength(2);
    act(() => tiles[0]!.click());

    expect(container.querySelectorAll(".overview__detail")).toHaveLength(1);
    // And it is the group that was clicked that opened.
    const groups = [...container.querySelectorAll(".overview__group")];
    expect(groups[0]?.querySelector(".overview__detail")).not.toBeNull();
    expect(groups[1]?.querySelector(".overview__detail")).toBeNull();
  });

  /**
   * The pointer opens the whole card, the way the Loadout's tiles do — a native
   * tooltip saying less, slower, on top of it would be two answers to one
   * question.
   */
  it("opens the card on the pointer, level and all", () => {
    render(
      overview({
        groups: [
          {
            key: "god:Poseidon",
            label: "Poseidon",
            god: "Poseidon",
            weapon: null,
            boons: [boon("Tidal Dash", { level: 3 }), boon("Wave Pulse")],
          },
        ],
      }),
    );

    const tiles = [...container.querySelectorAll<HTMLElement>(".overview__tile")];
    expect(tiles[0]?.title).toBe("");
    expect(container.querySelector(".overview__detail")).toBeNull();

    act(() => tiles[0]!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(container.querySelector(".boonrow__desc")?.textContent).toBe("What Tidal Dash does.");
    expect(container.querySelector(".overview__level")?.textContent).toBe("Level 3");

    /* Straight from one tile to the next, which is what a pointer crossing a
       row does. The card has to swap in place: a render with neither showing
       unmounts it and brings it back, and the run flickers. */
    act(() => tiles[1]!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(container.querySelectorAll(".overview__detail")).toHaveLength(1);
    expect(container.querySelector(".boonrow__desc")?.textContent).toBe("What Wave Pulse does.");
    // Every boon is level 1, so saying so on all of them is noise.
    expect(container.querySelector(".overview__level")).toBeNull();

    // Leaving the group takes it away, the pointer having never committed.
    act(() =>
      container
        .querySelector(".overview__group")!
        .dispatchEvent(new MouseEvent("mouseout", { bubbles: true })),
    );
    expect(container.querySelector(".overview__detail")).toBeNull();
  });

  /**
   * The detail belongs to this view rather than to something it opens: a
   * finished run is read to look things up in.
   */
  it("holds a card open on a click, and lets go on a second", () => {
    render(
      overview({
        groups: [
          {
            key: "god:Poseidon",
            label: "Poseidon",
            god: "Poseidon",
            weapon: null,
            boons: [boon("Tidal Dash"), boon("Wave Pulse")],
          },
        ],
      }),
    );
    expect(container.querySelector(".overview__detail")).toBeNull();

    const tiles = [...container.querySelectorAll<HTMLElement>(".overview__tile")];
    act(() => tiles[0]!.click());
    expect(container.querySelector(".boonrow__desc")?.textContent).toBe("What Tidal Dash does.");
    expect(tiles[0]?.getAttribute("data-open")).toBe("true");

    // Held, so the pointer wandering off does not take it away — which is the
    // whole difference between a click and a hover here.
    act(() =>
      container
        .querySelector(".overview__group")!
        .dispatchEvent(new MouseEvent("mouseout", { bubbles: true })),
    );
    expect(container.querySelector(".boonrow__desc")?.textContent).toBe("What Tidal Dash does.");

    act(() => tiles[1]!.click());
    expect(container.querySelectorAll(".overview__detail")).toHaveLength(1);
    expect(container.querySelector(".boonrow__desc")?.textContent).toBe("What Wave Pulse does.");

    /* The control that opened it closes it, and the hover goes with it: the
       pointer is still on the tile, so otherwise the card comes straight back
       and the second click looks like it did nothing. */
    act(() => tiles[1]!.click());
    expect(container.querySelector(".overview__detail")).toBeNull();
  });

  /**
   * Two, always. There is no *finished* run in the model — only the run in
   * whichever slot is open — so what these say does not change with which one
   * is being shown, and the resume is never withheld: the run being left stays
   * in its own slot, so opening another costs nothing.
   */
  it("offers the same two actions whatever it is showing", () => {
    const onResume = vi.fn();
    const onSaveSlots = vi.fn();
    render(overview({ held: 1 }, onResume, onSaveSlots));

    expect(texts(".overview__actions button")).toEqual(["Resume this run", "Back to save slots"]);

    act(() => container.querySelector<HTMLButtonElement>(".overview__close")?.click());
    expect(onResume).toHaveBeenCalledTimes(1);
    act(() => container.querySelector<HTMLButtonElement>(".overview__slots")?.click());
    expect(onSaveSlots).toHaveBeenCalledTimes(1);
  });

  /** Escape goes where the always-safe control goes, never into a run. */
  it("goes back to the save slots on Escape", () => {
    const onResume = vi.fn();
    const onSaveSlots = vi.fn();
    render(overview({ held: 1 }, onResume, onSaveSlots));

    act(() => {
      container
        .querySelector(".sheet-scrim")
        ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onSaveSlots).toHaveBeenCalledTimes(1);
    expect(onResume).not.toHaveBeenCalled();
  });
});
