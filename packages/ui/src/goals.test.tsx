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

/** The requirements are behind a hover, as the panel's neighbours are. */
function openCard(): void {
  const card = container.querySelector(".goal");
  act(() => card?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
}

describe("a Goal Card's requirement rows", () => {
  it("draws the god, the count and the boons under it", () => {
    render(<GoalsPanel goals={[goal()]} />);
    openCard();

    expect(container.querySelector(".goal__ask")?.textContent).toContain("One of the following");
    const options = [...container.querySelectorAll(".goal__option")];
    expect(options.map((option) => option.getAttribute("data-held"))).toEqual(["false", "true"]);
    expect(container.querySelector(".goal__godart")).not.toBeNull();
  });

  /**
   * The fill and the dimming are the whole of what a sighted reader gets here,
   * so every one of them has a word beside it. This is the promise the linear
   * surfaces carry, and the one nobody ever looks at.
   */
  it("says have and need in words, not only in the fill", () => {
    render(<GoalsPanel goals={[goal()]} />);
    openCard();

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
    openCard();

    expect(container.querySelectorAll(".goal__option")).toHaveLength(0);
    expect(container.querySelector(".goal__row")?.textContent).toBe("Need: 2 more Fire");
  });

  it("words a single answer as the following rather than one of them", () => {
    const one = row({
      need: 1,
      options: [{ trait: "PoseidonWeaponBoon" as TraitId, name: "Wave Pounding", held: false }],
    });
    render(<GoalsPanel goals={[goal({ detail: detail({ rows: [one] }) })]} />);
    openCard();

    expect(container.querySelector(".goal__ask")?.textContent).toContain("The following");
    expect(container.querySelector(".goal__ask")?.textContent).not.toContain("One of");
  });

  it("says so where a goal's gate asks for nothing, and still opens", () => {
    render(<GoalsPanel goals={[goal({ detail: detail({ rows: [] }) })]} />);

    expect(container.querySelector(".goal__summary")?.textContent).toBe("No requirements.");
    // Nothing to count, so no count — an empty gate is not "0/0".
    expect(container.querySelector(".goal__progress")).toBeNull();

    // And it opens onto the games' own phrase. A card that refused to open
    // reads as one whose requirements failed to load.
    expect(container.querySelector(".goal__rows")?.hasAttribute("hidden")).toBe(true);
    openCard();
    expect(container.querySelector(".goal__rows")?.hasAttribute("hidden")).toBe(false);
    // The same element a heading is, so it lines up with "One of the following:"
    // by construction rather than by a number kept in step.
    const none = container.querySelector(".goal__ask--none");
    expect(none?.textContent).toBe("(None in particular)");
    expect(none?.classList.contains("goal__ask")).toBe(true);
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

describe("the best next pick", () => {
  it("names the boon and how many goals it serves", () => {
    render(
      <GoalsPanel
        goals={[goal()]}
        bestNextPick={{ ...view({ name: "Wave Pounding" }), serves: ["Island Getaway", "Carnal Pleasure"] }}
      />,
    );

    const strip = container.querySelector(".goals__best")?.textContent ?? "";
    expect(strip).toContain("Wave Pounding");
    // The goals it serves by name: a count is a number the player then has to
    // resolve against the list underneath it.
    expect(strip).toContain("fulfills requirements for Island Getaway, Carnal Pleasure");
  });

  it("draws nothing where no boon serves more than one", () => {
    render(<GoalsPanel goals={[goal()]} bestNextPick={null} />);
    expect(container.querySelector(".goals__best")).toBeNull();
  });
});

/**
 * The card collapsed is the icon, the name and one line saying what is left;
 * the requirements arrive on a hover. A resting panel is one line per goal.
 */
describe("a Goal Card collapsed and open", () => {
  it("draws no name under the icon, the title carrying it instead", () => {
    render(<GoalsPanel goals={[goal()]} />);

    // The name is still the node's accessible name, so nothing a reader gets
    // depends on it being drawn twice.
    expect(container.querySelector(".node__name")).toBeNull();
    expect(container.querySelector(".goal__name")?.textContent).toContain("Island Getaway");
    expect(container.querySelector(".node__control")?.getAttribute("aria-label")).toContain(
      "Island Getaway",
    );
  });

  it("puts held on the title's own line, not on a line of its own", () => {
    render(<GoalsPanel goals={[goal({ view: view({ state: "Obtained" }) })]} />);

    expect(container.querySelector(".goal__name")?.textContent).toBe("Island Getaway(Held)");
    expect(container.querySelector(".goal__held")).not.toBeNull();
  });

  /**
   * The card carries the pin, so the icon inside it does not — every boon on
   * this panel is pinned by being there, and two marks for one fact collide.
   * `pinned` stays true, so the state is still in the description.
   */
  it("draws no pin on the icon, the card's own corner carrying it", () => {
    render(<GoalsPanel goals={[goal()]} />);

    expect(container.querySelector(".node__box .node__marker")).toBeNull();
    expect(container.querySelector(".goal__marker .node__marker")).not.toBeNull();
    const described = document.getElementById(
      container.querySelector(".node__control")?.getAttribute("aria-describedby") ?? "",
    );
    expect(described?.textContent).toContain("Pinned to a goal.");
  });

  it("keeps the requirements shut until the card is hovered", () => {
    render(<GoalsPanel goals={[goal()]} />);

    expect(container.querySelector(".goal__rows")?.hasAttribute("hidden")).toBe(true);
    openCard();
    expect(container.querySelector(".goal__rows")?.hasAttribute("hidden")).toBe(false);
  });

  /** Focus counts as hover, or the requirements are a thing only a mouse reaches. */
  it("opens on focus as well as on the pointer", () => {
    render(<GoalsPanel goals={[goal()]} />);
    const control = container.querySelector<HTMLElement>(".node__control");

    act(() => control?.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
    expect(container.querySelector(".goal__rows")?.hasAttribute("hidden")).toBe(false);
  });

  /**
   * How far along and nothing about which boons: a card is opened to read those,
   * so the closed one says only whether it is worth opening. The `n/m` beside it
   * carries the arithmetic.
   */
  it("says how far along rather than what is left", () => {
    const summary = () => container.querySelector(".goal__summary")?.textContent;
    const rows = (...met: boolean[]) => detail({ rows: met.map((m, i) => row({ met: m, text: `r${i}` })) });

    render(<GoalsPanel goals={[goal({ detail: rows(false, false) })]} />);
    expect(summary()).toBe("No requirements met yet.");
    expect(container.querySelector(".goal__progress")?.textContent).toBe("0/2 requirements met");

    render(<GoalsPanel goals={[goal({ detail: rows(true, false) })]} />);
    expect(summary()).toBe("Some requirements met.");

    render(<GoalsPanel goals={[goal({ detail: rows(true, true) })]} />);
    expect(summary()).toBe("All requirements met.");
  });

  /**
   * The pin in the card's corner is the same have-against-need pair one level
   * up — whether the *whole* goal is done. Hidden from a reader, because the
   * summary beside it already says it in words.
   */
  it("marks the card done on its own pin, and says so in words too", () => {
    render(<GoalsPanel goals={[goal()]} />);
    expect(container.querySelector(".goal__marker")?.getAttribute("data-met")).toBe("false");
    expect(container.querySelector(".goal__marker")?.getAttribute("aria-hidden")).toBe("true");

    render(<GoalsPanel goals={[goal({ detail: detail({ rows: [row({ met: true })] }) })]} />);
    expect(container.querySelector(".goal__marker")?.getAttribute("data-met")).toBe("true");
  });
});

/**
 * A hover previews and a click holds it, which is the **held open** rule the
 * Loadout's cards already use — the same words, because it is the same thing
 * happening to a different card.
 */
describe("a Goal Card held open", () => {
  it("says it is held open and stays that way with the pointer gone", () => {
    render(<GoalsPanel goals={[goal()]} heldOpen={new Set(["AllCloseBoon"])} />);

    const card = container.querySelector(".goal");
    expect(card?.getAttribute("data-held-open")).toBe("true");
    expect(container.querySelector(".goal__rows")?.hasAttribute("hidden")).toBe(false);

    // No hover has happened at all, which is the half a preview cannot give.
    act(() => card?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true })));
    expect(container.querySelector(".goal__rows")?.hasAttribute("hidden")).toBe(false);
  });

  it("asks the caller to toggle when the card is clicked", () => {
    const onHeldOpen = vi.fn();
    render(<GoalsPanel goals={[goal()]} onHeldOpen={onHeldOpen} />);

    act(() => {
      container.querySelector(".goal__summary")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(onHeldOpen).toHaveBeenCalledWith("AllCloseBoon");
  });

  /**
   * The icon opens the boon's details and the card's own click is the
   * disclosure, so a click that landed on a control belongs to that control.
   */
  it("leaves a click on the icon to the icon", () => {
    const onHeldOpen = vi.fn();
    const onOpen = vi.fn();
    render(
      <GoalsPanel
        goals={[goal({ view: view({ state: "Obtained" }) })]}
        onHeldOpen={onHeldOpen}
        onOpen={onOpen}
      />,
    );

    act(() => container.querySelector<HTMLElement>(".node__control")?.click());
    expect(onOpen).toHaveBeenCalledWith("AllCloseBoon");
    expect(onHeldOpen).not.toHaveBeenCalled();
  });
});
