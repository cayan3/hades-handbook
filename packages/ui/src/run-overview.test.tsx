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

function overview(over: Partial<FinishedRun> = {}, onClose = () => {}): ReactElement {
  return <RunOverview run={run(over)} onClose={onClose} />;
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
   * A Duo answers to two gods, so inside one god's group it used to fall to the
   * unassigned neutral — which reads as a boon whose god the app could not work
   * out. On a surface with no page god the games' own Duo colour is the answer.
   */
  it("gives a Duo the Duo colour rather than a god's or the neutral", () => {
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
    expect(icons[0]?.style.getPropertyValue("--god")).toBe("#D2FF61");
    // And an ordinary boon of the group's god is untouched by the rule.
    expect(icons[1]?.style.getPropertyValue("--god")).toBe("#2080FF");
  });

  /** The pointer answers without opening anything, which is most of the asking. */
  it("says what a boon is on the pointer, and its level only past the first", () => {
    render(
      overview({
        groups: [
          {
            key: "god:Poseidon",
            label: "Poseidon",
            god: "Poseidon",
            weapon: null,
            boons: [
              boon("Tidal Dash", { level: 3 }),
              boon("Wave Pulse"),
            ],
          },
        ],
      }),
    );

    const tiles = [...container.querySelectorAll<HTMLElement>(".overview__tile")];
    expect(tiles[0]?.title).toBe("Tidal Dash — Common — Level 3");
    // Every boon is level 1, so saying so on all of them is noise.
    expect(tiles[1]?.title).toBe("Wave Pulse — Common");
  });

  /**
   * The detail belongs to this view rather than to something it opens: a
   * finished run is read to look things up in.
   */
  it("opens a boon's Codex row in place, one at a time", () => {
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
    expect(tiles[0]?.getAttribute("aria-expanded")).toBe("true");

    act(() => tiles[1]!.click());
    expect(container.querySelectorAll(".overview__detail")).toHaveLength(1);
    expect(container.querySelector(".boonrow__desc")?.textContent).toBe("What Wave Pulse does.");

    // The control that opened it closes it.
    act(() => tiles[1]!.click());
    expect(container.querySelector(".overview__detail")).toBeNull();
  });

  /** Offered only where the caller says there is something to pick back up. */
  it("offers to pick the run back up only when handed a way to", () => {
    render(overview({ held: 1 }));
    expect(container.querySelector(".overview__reopen")).toBeNull();

    const onReopen = vi.fn();
    act(() =>
      root.render(
        <NodePresentation ladder="real-art" game="hades2">
          <RunOverview run={run({ held: 1 })} onClose={() => {}} onReopen={onReopen} />
        </NodePresentation>,
      ),
    );
    act(() => container.querySelector<HTMLButtonElement>(".overview__reopen")?.click());
    expect(onReopen).toHaveBeenCalledTimes(1);
  });

  it("closes on the control and on Escape", () => {
    const onClose = vi.fn();
    render(overview({ held: 1 }, onClose));

    act(() => {
      container.querySelector<HTMLButtonElement>(".overview__close")?.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      container
        .querySelector(".sheet-scrim")
        ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
