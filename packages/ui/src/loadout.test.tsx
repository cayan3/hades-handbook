/**
 * @vitest-environment jsdom
 *
 * The Loadout's gestures, which are the whole of what this panel adds to a grid
 * of tiles: a card previews under the pointer, sticks on a click, and comes
 * back out on the next one.
 *
 * Hover is dispatched rather than simulated — jsdom has a pointer only in the
 * sense that it will deliver the events, which is exactly the half under test.
 */

import type { TraitId } from "@repo/core";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Loadout, type LoadoutEntry } from "./loadout.js";
import type { NodeDetail, NodeView } from "./node-view.js";

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
  act(() => root.render(node));
}

function view(trait: TraitId): NodeView {
  return {
    trait,
    name: trait,
    state: "Obtained",
    god: "Zeus",
    tier: 1,
    iconKey: "official/Zeus_01",
    kind: null,
    rarity: null,
    rarities: [],
    notice: null,
    dormant: false,
    replaces: null,
    label: `${trait} — Obtained — Zeus`,
  };
}

function entry(trait: TraitId, slot: string | null = null): LoadoutEntry {
  return { view: view(trait), slot };
}

const detail = (trait: TraitId): NodeDetail => ({
  description: `about ${trait}`,
  needed: [],
  rows: [],
  activation: [],
  displaces: null,
});

const ENTRIES = [entry("a", "Melee"), entry("b", "Secondary"), entry("c"), entry("d")];

function panel(over: Partial<Parameters<typeof Loadout>[0]> = {}): ReactElement {
  return (
    <Loadout
      entries={ENTRIES}
      coreSlots={["Melee", "Secondary"]}
      detailOf={detail}
      expanded
      {...over}
    />
  );
}

const tiles = () => [...container.querySelectorAll<HTMLElement>(".loadout__tile")];
const tile = (trait: TraitId) =>
  tiles().find((el) => el.querySelector("button")?.getAttribute("aria-label")?.startsWith(trait))!;
const cards = () =>
  [...container.querySelectorAll(".loadout__card")].map(
    (el) => el.querySelector(".loadout__cardname")?.textContent,
  );
const lit = () => tiles().filter((el) => el.dataset["lit"] === "true").length;

function hover(trait: TraitId): void {
  act(() => {
    tile(trait).dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
}

function click(trait: TraitId): void {
  act(() => tile(trait).querySelector("button")!.click());
}

describe("a tile's card", () => {
  it("previews under the pointer without sticking", () => {
    render(panel());
    expect(cards()).toEqual([]);

    hover("a");
    expect(cards()).toEqual(["a"]);
    // The glow and the stack are one set, so a previewed tile is lit too.
    expect(lit()).toBe(1);

    hover("b");
    expect(cards()).toEqual(["b"]);
  });

  it("sticks on a click and comes back out on the next one", () => {
    // The gesture is a toggle: the control that put a card in the stack is the
    // one that takes it away, so there is no second affordance to find. And
    // the pointer is still on the tile when the second click lands, which is
    // the case that made the card refuse to close.
    render(panel());
    hover("a");
    click("a");
    hover("b");
    expect(cards()).toEqual(["a", "b"]);

    hover("a");
    click("a");
    expect(cards()).toEqual([]);
  });

  it("says whether it is open on the control that opens it", () => {
    render(panel());
    const control = () => tile("a").querySelector("button")!;
    expect(control().getAttribute("aria-expanded")).toBe("false");
    // Not a dialog: the card is beside the grid, and claiming one would send a
    // reader looking for something modal.
    expect(control().getAttribute("aria-haspopup")).toBeNull();

    click("a");
    expect(control().getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps the ones held open in the order they were opened", () => {
    render(panel());
    click("b");
    click("a");
    expect(cards()).toEqual(["b", "a"]);

    // Hovering one already held open brings its card forward and leaves it
    // where it is, so a glance does not rearrange what is being compared.
    hover("b");
    expect(cards()).toEqual(["b", "a"]);
    expect(container.querySelector(".loadout__card[data-front]")?.textContent).toContain("b");
  });

  it("adds and lights nothing once the stack is full", () => {
    // The one place the glow and membership come apart, and it is written as
    // the exception rather than leaving the rule stated absolutely: a tile that
    // lit on hover and then refused to open would be the panel lying about
    // what a click does.
    render(panel({ capacity: 2 }));
    click("a");
    click("b");
    expect(cards()).toEqual(["a", "b"]);

    hover("c");
    expect(cards()).toEqual(["a", "b"]);
    expect(lit()).toBe(2);

    click("c");
    expect(cards()).toEqual(["a", "b"]);
  });

  it("takes a card away when its boon leaves the run", () => {
    render(panel());
    click("a");
    expect(cards()).toEqual(["a"]);

    render(panel({ entries: ENTRIES.filter((each) => each.view.trait !== "a") }));
    expect(cards()).toEqual([]);
  });

  it("takes a previewed card away too, and leaves nothing behind it", () => {
    // A boon can leave the run while the pointer is still on the tile that was
    // holding it. The stack is pruned for exactly that and the preview was not,
    // so the panel drew an empty frame where the card had been.
    render(panel());
    hover("a");
    expect(cards()).toEqual(["a"]);

    render(panel({ entries: ENTRIES.filter((each) => each.view.trait !== "a") }));
    expect(cards()).toEqual([]);
    expect(container.querySelector(".loadout__cards")).toBeNull();
  });

  it("puts every card away when the pointer leaves the panel", () => {
    render(panel());
    hover("a");
    click("b");
    expect(cards()).toEqual(["b", "a"]);

    act(() => {
      container
        .querySelector(".loadout")!
        .dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    // The one that was only being previewed goes; the one held open stays.
    expect(cards()).toEqual(["b"]);
  });
});

describe("the panel itself", () => {
  it("expands under the pointer and collapses again when it leaves", () => {
    render(panel({ expanded: false }));
    expect(tiles()).toHaveLength(2);

    act(() => {
      container
        .querySelector(".loadout")!
        .dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(tiles()).toHaveLength(4);

    act(() => {
      container
        .querySelector(".loadout")!
        .dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    expect(tiles()).toHaveLength(2);
  });

  it("keeps the control saying what will still be true once the pointer has gone", () => {
    const control = () =>
      [...container.querySelectorAll("button")].find((el) => el.className === "loadout__more")!;
    render(panel({ expanded: false, onExpanded: () => {} }));

    expect(control().getAttribute("aria-expanded")).toBe("false");
    expect(control().textContent).toBe("Show all boons");
  });
});
