/**
 * @vitest-environment jsdom
 *
 * The Goals panel, which had no test of its own until the requirement rows
 * gained a shape. What is under test is the promise the linear surfaces carry:
 * everything the drawing says, the words say too.
 */

import type { TraitId } from "@repo/core";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Goal, GoalsPanel } from "./goals.js";
import type { NodeDetail, NodeView, RequirementRow } from "./node-view.js";
import { NodePresentation } from "./presentation.js";

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

function view(over: Partial<NodeView> = {}): NodeView {
  return {
    trait: "AllCloseBoon" as TraitId,
    name: "Island Getaway",
    state: "Pending",
    god: "Poseidon",
    tier: 3,
    iconKey: "official/hades2/Poseidon_01",
    kind: "duo",
    rarity: null,
    rarities: [],
    element: null,
    notice: null,
    dormant: false,
    replaces: null,
    label: "Island Getaway — Pending — Poseidon",
    ...over,
  };
}

function row(over: Partial<RequirementRow> = {}): RequirementRow {
  return {
    text: "any 1 of: Wave Pounding, Sunken Treasure",
    met: false,
    god: "Poseidon",
    need: 1,
    options: [
      { trait: "PoseidonWeaponBoon" as TraitId, name: "Wave Pounding", held: false },
      { trait: "PoseidonSpecialBoon" as TraitId, name: "Sunken Treasure", held: true },
    ],
    ...over,
  };
}

function detail(over: Partial<NodeDetail> = {}): NodeDetail {
  return {
    description: null,
    needed: [],
    rows: [row()],
    activation: [],
    displaces: null,
    ...over,
  };
}

const goal = (over: Partial<Goal> = {}): Goal => ({ view: view(), detail: detail(), ...over });

describe("a Goal Card's requirement rows", () => {
  it("draws the god, the count and the boons under it", () => {
    render(<GoalsPanel goals={[goal()]} />);

    expect(container.querySelector(".goal__ask")?.textContent).toContain("One of the following");
    const options = [...container.querySelectorAll(".goal__option")];
    expect(options.map((option) => option.getAttribute("data-held"))).toEqual(["false", "true"]);
    expect(container.querySelector(".goal__godart")).not.toBeNull();
  });

  /**
   * The fill and the dimming are the whole of what a sighted reader gets here,
   * so every one of them has a word beside it. This is the promise D51 makes and
   * the one nobody ever looks at.
   */
  it("says have and need in words, not only in the fill", () => {
    render(<GoalsPanel goals={[goal()]} />);

    const words = [...container.querySelectorAll(".goal__option .visually-hidden")].map(
      (span) => span.textContent,
    );
    expect(words).toEqual(["Need: ", "Have: "]);
    expect(container.querySelector(".goal__progress")?.textContent).toBe(
      "0/1 requirements met",
    );
  });

  it("keeps the sentence alone for a part that names no boon", () => {
    const element = row({ text: "2 more Fire", god: null, need: 0, options: [] });
    render(<GoalsPanel goals={[goal({ detail: detail({ rows: [element] }) })]} />);

    expect(container.querySelectorAll(".goal__option")).toHaveLength(0);
    expect(container.querySelector(".goal__row")?.textContent).toBe("Need: 2 more Fire");
  });

  it("words a single answer as the following rather than one of them", () => {
    const one = row({
      need: 1,
      options: [{ trait: "PoseidonWeaponBoon" as TraitId, name: "Wave Pounding", held: false }],
    });
    render(<GoalsPanel goals={[goal({ detail: detail({ rows: [one] }) })]} />);

    expect(container.querySelector(".goal__ask")?.textContent).toContain("The following");
    expect(container.querySelector(".goal__ask")?.textContent).not.toContain("One of");
  });

  it("says so where a goal's gate asks for nothing", () => {
    render(<GoalsPanel goals={[goal({ detail: detail({ rows: [] }) })]} />);

    expect(container.querySelector(".goal__none")?.textContent).toBe("No requirements.");
    expect(container.querySelector(".goal__progress")).toBeNull();
  });
});

describe("clearing a goal from its own card", () => {
  it("takes the goal key anywhere in the card", () => {
    const onGoal = vi.fn();
    render(<GoalsPanel goals={[goal()]} onGoal={onGoal} />);

    const card = container.querySelector(".goal");
    act(() => {
      card?.dispatchEvent(new KeyboardEvent("keydown", { key: "g", bubbles: true }));
    });
    expect(onGoal).toHaveBeenCalledWith("AllCloseBoon");
  });

  /**
   * Ctrl-G is the browser's find-next and Command-G the same on a Mac. A page
   * taking either would be overriding the platform for a key it does not own.
   */
  it("leaves the key alone when a modifier is held", () => {
    const onGoal = vi.fn();
    render(<GoalsPanel goals={[goal()]} onGoal={onGoal} />);

    act(() => {
      container.querySelector(".goal")?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "g", ctrlKey: true, bubbles: true }),
      );
    });
    expect(onGoal).not.toHaveBeenCalled();
  });
});

describe("the arrows between cards", () => {
  const on = () =>
    (document.activeElement as HTMLElement | null)?.closest("[data-trait]")?.getAttribute(
      "data-trait",
    ) ?? null;

  const second = (): Goal => ({
    view: view({ trait: "PoseidonWeaponBoon" as TraitId, name: "Wave Pounding" }),
    detail: detail(),
  });

  function press(trait: string, key: string): void {
    const control = container.querySelector<HTMLElement>(
      `[data-trait="${trait}"] .node__control`,
    );
    if (control === null) throw new Error(`no card for ${trait}`);
    act(() => control.focus());
    act(() => {
      control.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });
  }

  it("steps between goals and stops at the ends", () => {
    render(<GoalsPanel goals={[goal(), second()]} />);

    press("AllCloseBoon", "ArrowDown");
    expect(on()).toBe("PoseidonWeaponBoon");
    press("PoseidonWeaponBoon", "ArrowUp");
    expect(on()).toBe("AllCloseBoon");
    press("AllCloseBoon", "ArrowUp");
    expect(on()).toBe("AllCloseBoon");
  });

  /**
   * The node inside a card takes the goal key too and gets there first. Without
   * the guard the press would clear the goal and set it again on the way up,
   * which looks exactly like the key doing nothing.
   */
  it("clears a goal once, not twice, from the node inside the card", () => {
    const onGoal = vi.fn();
    render(<GoalsPanel goals={[goal()]} onGoal={onGoal} />);

    press("AllCloseBoon", "g");
    expect(onGoal).toHaveBeenCalledTimes(1);
  });
});
