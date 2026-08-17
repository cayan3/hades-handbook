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
    element: null,
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
    (el) => el.querySelector(".loadout__card .boonrow__title")?.textContent,
  );
const lit = () => tiles().filter((el) => el.dataset["lit"] === "true").length;

function hover(trait: TraitId): void {
  act(() => {
    tile(trait).dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  });
}

/**
 * A click, with the hover a pointer always arrives with. The runner does not
 * synthesise one and a browser does, so a bare `.click()` here would be testing
 * a sequence no player can produce — and the cards render only while the panel
 * has the pointer.
 */
function click(trait: TraitId): void {
  hover(trait);
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

  /**
   * The room a card takes is its **name's** lines, not one card. The cards
   * split the panel's height between them, so what a further one costs is the
   * strip the ones already open need to show their names — and a name that
   * wraps needs two of them.
   */
  it("charges a wrapping name two of the stack's lines", () => {
    const long = entry("a name long enough to wrap the card's title column");
    render(panel({ entries: [...ENTRIES, long], capacity: 3 }));

    click(long.view.trait);
    click("a");
    // Two lines for the long one and one for `a` is three, so nothing further.
    expect(cards()).toEqual([long.view.trait, "a"]);

    hover("b");
    expect(cards()).toEqual([long.view.trait, "a"]);
    click("b");
    expect(cards()).toEqual([long.view.trait, "a"]);

    // Take the long one out and the same click has room twice over.
    click(long.view.trait);
    click("b");
    expect(cards()).toEqual(["a", "b"]);
  });

  /**
   * The stack splits the panel's height between the cards it holds, which is
   * arithmetic only the stylesheet can do — so the counts go to it as
   * properties. Read here because the runner has no layout to measure and this
   * is the half of the rule it can still hold to account.
   */
  it("hands the stylesheet the stack's size and each card's place in it", () => {
    render(panel());
    click("a");
    click("b");
    click("c");

    const stack = container.querySelector<HTMLElement>(".loadout__cards")!;
    expect(stack.style.getPropertyValue("--slots")).toBe("3");
    expect(
      [...container.querySelectorAll<HTMLElement>(".loadout__card")].map((card) =>
        card.style.getPropertyValue("--slot"),
      ),
    ).toEqual(["0", "1", "2"]);
  });

  /**
   * Hovering the card itself brings it forward, not just its tile: a squeezed
   * stack shows little more than a name, and the card is the bigger target.
   * It stays where it is in the stack either way.
   */
  it("brings a card forward when the pointer is on the card", () => {
    render(panel());
    click("a");
    click("b");
    click("c");

    const cardFor = (trait: string) =>
      [...container.querySelectorAll<HTMLElement>(".loadout__card")].find((card) =>
        card.querySelector(".boonrow__title")?.textContent?.startsWith(trait),
      )!;

    act(() => cardFor("a").dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(cardFor("a").dataset["front"]).toBe("true");
    expect(cardFor("c").dataset["front"]).toBeUndefined();
    // Still first, and still carrying the first band.
    expect(cards()).toEqual(["a", "b", "c"]);
    expect(cardFor("a").style.getPropertyValue("--slot")).toBe("0");
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

  it("puts every card away when the pointer leaves a panel it was holding open", () => {
    // Not pinned: the panel is open because the pointer is on it, so the cards
    // are the pointer's too.
    render(panel({ expanded: false }));
    click("b");
    hover("a");
    // One held open and one only previewed, so this says something about both.
    expect(cards()).toEqual(["b", "a"]);

    act(() => {
      container
        .querySelector(".loadout")!
        .dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    // Every card goes with the pointer, the previewed one and the held-open one
    // alike: a card lies over the god page and one left behind covers something
    // nobody is reading the Loadout to see.
    expect(cards()).toEqual([]);
  });

  /**
   * Pinned open by its own control, the cards stay. The control says *show all
   * boons*, and a panel that kept the grid and dropped the cards read as one
   * that had half worked.
   */
  it("keeps its cards when the panel is the control's rather than the pointer's", () => {
    render(panel({ expanded: true }));
    click("b");
    click("a");
    expect(cards()).toEqual(["b", "a"]);

    act(() => {
      container
        .querySelector(".loadout")!
        .dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    expect(cards()).toEqual(["b", "a"]);
  });

  it("brings the same cards back on the next hover", () => {
    // What goes away is the drawing, not the stack. Otherwise leaving the panel
    // would silently undo the clicks that filled it, and the toggle would have
    // a second way to fire that nothing pressed.
    render(panel({ expanded: false }));
    click("b");
    click("a");
    expect(cards()).toEqual(["b", "a"]);

    act(() => {
      container
        .querySelector(".loadout")!
        .dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    expect(cards()).toEqual([]);
    // Still held open while nothing is drawn, which is what the tile says too.
    expect(tile("a").querySelector("button")?.getAttribute("aria-expanded")).toBe("true");

    // A core tile, since an unpinned panel has put the rest of the grid away
    // along with the cards — and both come back together.
    hover("a");
    expect(cards()).toEqual(["b", "a"]);
  });
});

describe("the panel itself", () => {
  it("marks no tile with an element, the count being the panel's own question", () => {
    // Every tile here declares one, so an empty result is the panel refusing
    // rather than the fixture having nothing to draw.
    const withElement = ENTRIES.map((e) => ({ ...e, view: { ...e.view, element: "Fire" as const } }));
    render(panel({ entries: withElement }));
    expect(tiles()).not.toHaveLength(0);
    expect(container.querySelectorAll(".node__element")).toHaveLength(0);
  });

  it("sizes its columns by the game's slot count, not by what is held", () => {
    // The row count is what makes the fill go down before it goes across. Taken
    // from the slots the game has rather than the ones this run has filled: a
    // shape that changed as boons arrived would rearrange under the pointer.
    render(panel({ coreSlots: ["Melee", "Secondary", "Ranged"] }));
    const styled = container.querySelector<HTMLElement>(".loadout__panel");
    expect(styled?.style.getPropertyValue("--core-rows")).toBe("3");

    render(panel({ coreSlots: ["Melee"], entries: ENTRIES }));
    expect(
      container.querySelector<HTMLElement>(".loadout__panel")?.style.getPropertyValue("--core-rows"),
    ).toBe("1");
  });

  it("counts the run's elements once, over the whole panel", () => {
    // The tiles carry no element mark, so this row is the only place a Hades II
    // run's elements are said at all — which is what made removing the mark
    // from a tile safe.
    // Handed over in the order a run met them; drawn in the game's own order,
    // so the row does not rearrange as elements arrive. All five, because an
    // Infusion is planned against the ceiling as much as against the count.
    render(panel({ elements: new Map([["Fire" as const, 3], ["Water" as const, 1]]) }));
    const row = [...container.querySelectorAll(".loadout__elements li")];
    expect(row.map((li) => li.textContent)).toEqual(["0Earth", "1Water", "0Air", "3Fire", "0Aether"]);
    expect(container.querySelectorAll(".node__element")).toHaveLength(0);
    // Inside the panel and above the grid. The space it takes is reserved by
    // the panel's own margin while it is not drawn, so the boons never move and
    // the backdrop grows up to meet the row instead.
    const list = container.querySelector(".loadout__elements")!;
    const grid = container.querySelector(".loadout__grid")!;
    expect(container.querySelector(".loadout__panel")!.contains(list)).toBe(true);
    expect(list.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("draws the row only while the panel is open", () => {
    // The same disclosure the rest of the grid follows, so the panel opens as
    // one thing. Collapsed it is the core slots and nothing else.
    render(panel({ expanded: false, elements: new Map([["Fire" as const, 3]]) }));
    expect(container.querySelector(".loadout__elements")).toBeNull();
    // The panel says so, and the stylesheet holds the row's place with a margin
    // while it does — so nothing below the row moves when it arrives.
    expect(container.querySelector(".loadout__panel")!.getAttribute("data-open")).toBeNull();

    act(() => {
      container
        .querySelector(".loadout")!
        .dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(container.querySelectorAll(".loadout__elements li")).toHaveLength(5);
  });

  it("draws no element row at all in Hades I", () => {
    // Guarded on the game rather than on the map being empty: 0 of 449 Hades I
    // records declare an affinity, so that run hands over an empty map for good
    // and would otherwise carry five permanent zeroes.
    render(
      <NodePresentation ladder="real-art" game="hades1">
        {panel({ elements: new Map() })}
      </NodePresentation>,
    );
    expect(container.querySelector(".loadout__elements")).toBeNull();
  });

  it("draws a core slot the run has not filled, in its place in the column", () => {
    // The column is read by position, so a slot nobody has filled has to hold
    // its rung rather than close the gap. Three slots, two held: the empty one
    // is Ranged and it is third, not appended.
    render(panel({ coreSlots: ["Melee", "Secondary", "Ranged"] }));
    const column = [...container.querySelectorAll(".loadout__core > li")];
    expect(column).toHaveLength(3);
    expect(column[2]!.querySelector(".loadout__emptyslot")).not.toBeNull();
    expect(column[2]!.textContent).toBe("Cast — empty");
  });

  it("names an empty slot the way the game does, not the way the data files it", () => {
    // `Ranged` is what the record says and `Cast` is what the player reads, so
    // the row that goes to a screen reader has to be the second.
    render(panel({ coreSlots: ["Rush", "Ranged"] }));
    const words = [...container.querySelectorAll(".loadout__emptyslot")].map((el) => el.textContent);
    expect(words).toEqual(["Dash — empty", "Cast — empty"]);
  });

  it("sizes an empty slot off the same property a tile does", () => {
    // It is not a tile, so it inherits nothing from one: the size was reaching
    // it through a fallback in the stylesheet while tiles had moved to each
    // game's own God View size, and an empty slot drew visibly smaller.
    render(panel({ coreSlots: ["Melee", "Ranged"] }));
    const empty = container.querySelector<HTMLElement>(".loadout__emptyslot")!;
    expect(empty.dataset["game"]).toBe("hades2");
  });

  it("keeps the rung for a slot the game draws no glyph for", () => {
    // Hades II's own tray has an icon for five of its six core slots and none
    // for the Hex. The box stays anyway: the column is read by position, and a
    // rung that vanished would shorten the column against the rest grid beside
    // it, which counts its rows off the game's slot count either way.
    render(panel({ coreSlots: ["Spell"] }));
    const empty = container.querySelector(".loadout__emptyslot")!;
    expect(empty).not.toBeNull();
    expect(empty.querySelector("img")).toBeNull();

    render(panel({ coreSlots: ["Ranged"] }));
    expect(container.querySelector(".loadout__emptyslot img")).not.toBeNull();
  });

  it("hands the panel's frame over as a property, never as a path in the markup", () => {
    // The skin: the resolver owns the path, the stylesheet owns the slicing, and
    // what crosses between them is one custom property. Unset, the border image
    // computes to none and the panel is exactly what it was.
    render(panel());
    const styled = container.querySelector<HTMLElement>(".loadout__panel")!;
    expect(styled.style.getPropertyValue("--chrome-panel")).toBe(
      'url("/art/official/hades2/Chrome_Panel.webp")',
    );
    expect(styled.dataset["game"]).toBe("hades2");
  });

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

  /**
   * Drawn whatever the run holds. Expanding is also what pins the cards, so a
   * run with nothing but core slots still needs the control to keep one on
   * screen — it used to appear only where there was a second column to reveal.
   */
  it("offers the control even where there is nothing extra to show", () => {
    render(panel({ entries: [entry("a", "Melee")], onExpanded: () => {} }));
    expect(container.querySelector(".loadout__more")).not.toBeNull();
  });

  it("keeps the control saying what will still be true once the pointer has gone", () => {
    const control = () =>
      [...container.querySelectorAll("button")].find((el) => el.className === "loadout__more")!;
    render(panel({ expanded: false, onExpanded: () => {} }));

    expect(control().getAttribute("aria-expanded")).toBe("false");
    expect(control().textContent).toBe("Expand");
  });

  /**
   * The card and the Action Sheet are one component now. They say the same
   * things about one boon and were drawn twice, so restyling the sheet left the
   * card behind — which is what was reported.
   */
  it("draws its card as the same row the sheet does", () => {
    render(panel());
    hover("c");

    const row = container.querySelector(".loadout__card .boonrow");
    expect(row).not.toBeNull();
    expect(row?.querySelector(".boonrow__icon .node__art")).not.toBeNull();
    expect(row?.querySelector(".boonrow__title")?.textContent).toBe("c");
    expect(row?.querySelector(".boonrow__desc")?.textContent).toBe("about c");
    // No control inside the row: the card is already about this boon.
    expect(row?.querySelectorAll("button")).toHaveLength(0);
  });

  /**
   * The card is already under the pointer whenever it is drawn, so a menu that
   * opened on hover would spring up on the way past its label. Opening one is a
   * decision here rather than a look.
   */
  it("opens the rarity menu on a click and not on a hover", () => {
    // The menu is only drawn where the record declares rarities to offer.
    const rare = { ...entry("c"), view: { ...view("c"), rarities: ["Common", "Epic"] as const } };
    render(panel({ entries: [rare], actions: { mark: () => undefined } }));
    hover("c");

    const label = container.querySelector<HTMLElement>(".cardmenu__open");
    expect(label).not.toBeNull();

    act(() => {
      container
        .querySelector(".cardmenu")
        ?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(container.querySelector(".cardmenu__list")).toBeNull();

    act(() => label?.click());
    expect(container.querySelector(".cardmenu__list")).not.toBeNull();
  });

  /**
   * A browser focuses a button on the way into clicking it, and focus used to
   * open the panel whether or not hover did — so the click that followed
   * toggled it straight back and the first one on any card did nothing.
   *
   * `.click()` alone cannot see this: the runner fires no focus, so the whole
   * defect lives in the order a real pointer produces. **The two go in separate
   * `act`s on purpose** — in one, React batches them and reads `open` from a
   * render that has not committed the focus yet, which hides the defect exactly
   * the way the original test did.
   */
  it("opens on the first click, the focus a pointer brings with it included", () => {
    const rare = { ...entry("c"), view: { ...view("c"), rarities: ["Common", "Epic"] as const } };
    render(panel({ entries: [rare], actions: { mark: () => undefined } }));
    hover("c");

    const label = container.querySelector<HTMLButtonElement>(".cardmenu__open")!;
    act(() => label.focus());
    act(() => label.click());
    expect(container.querySelector(".cardmenu__list")).not.toBeNull();

    // And it is still a toggle once it is open.
    act(() => label.click());
    expect(container.querySelector(".cardmenu__list")).toBeNull();
  });

  /**
   * A removal is written in the danger colour, and the tone sits on the menu
   * rather than on each control so the opener and both choices agree without
   * any of them saying so.
   */
  it("marks the whole removal menu as the one that takes something away", () => {
    render(
      panel({
        entries: [entry("c")],
        actions: { purge: () => undefined, remove: () => undefined },
      }),
    );
    hover("c");

    // One boon from this god, so the pool question is a question and Remove is
    // the menu rather than a plain button.
    const menu = [...container.querySelectorAll<HTMLElement>(".cardmenu")].find(
      (each) => each.querySelector(".cardmenu__open")?.textContent === "Remove",
    )!;
    expect(menu.dataset["tone"]).toBe("danger");

    act(() => menu.querySelector<HTMLButtonElement>(".cardmenu__open")!.click());
    expect(
      [...menu.querySelectorAll(".cardmenu__list button")].map((each) => each.textContent),
    ).toEqual(["Remove boon only", "Remove boon and god from pool"]);
  });

  /** The keyboard has no hover to open it with, so the click has to. */
  it("still opens the menu for a keyboard, which never hovers", () => {
    const rare = { ...entry("c"), view: { ...view("c"), rarities: ["Common", "Epic"] as const } };
    render(panel({ entries: [rare], actions: { mark: () => undefined } }));
    hover("c");

    const label = container.querySelector<HTMLButtonElement>(".cardmenu__open")!;
    act(() => label.focus());
    expect(container.querySelector(".cardmenu__list")).toBeNull();
    act(() => label.click());
    expect(container.querySelector(".cardmenu__list")).not.toBeNull();
  });

  /**
   * Inside the row's text column, so it starts where the name and the
   * description start rather than under the icon.
   */
  it("puts the card's controls in line with its words", () => {
    render(panel({ actions: { purge: () => undefined } }));
    hover("c");

    const body = container.querySelector(".loadout__card .boonrow__body");
    expect(body?.querySelector(".loadout__cardactions")).not.toBeNull();
    expect(container.querySelector(".loadout__card > .loadout__cardactions")).toBeNull();
  });
});

describe("the arrows across the tiles", () => {
  /** Where focus is, by the tile it sits in. */
  const on = () =>
    (document.activeElement as HTMLElement | null)?.closest("[data-trait]")?.getAttribute(
      "data-trait",
    ) ?? null;

  function press(trait: TraitId, key: string, over: KeyboardEventInit = {}): void {
    const control = container.querySelector<HTMLElement>(
      `[data-trait="${trait}"] .node__control`,
    );
    if (control === null) throw new Error(`no tile for ${trait}`);
    act(() => control.focus());
    act(() => {
      control.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...over }));
    });
  }

  /**
   * All four arrows step through the tiles as drawn, because this panel owns no
   * coordinate model either: the core is a column of one game's slot count and
   * the rest is a grid whose width belongs to the stylesheet.
   */
  it("steps through the tiles in the order they are drawn", () => {
    render(panel());

    press("a", "ArrowDown");
    expect(on()).toBe("b");
    press("b", "ArrowRight");
    expect(on()).toBe("c");
    press("c", "ArrowUp");
    expect(on()).toBe("b");
    press("b", "End");
    expect(on()).toBe("d");
    press("d", "Home");
    expect(on()).toBe("a");
  });

  /**
   * An empty core slot is not a control and is deliberately out of the tab
   * order, so the arrows have to skip it as well — which they do by it not
   * carrying the attribute they walk rather than by a rule about it.
   */
  it("passes over a core slot the run has not filled", () => {
    render(panel({ entries: [entry("a", "Melee")], coreSlots: ["Melee", "Secondary"] }));

    expect(container.querySelectorAll(".loadout__emptyslot")).toHaveLength(1);
    expect(container.querySelectorAll("[data-trait]")).toHaveLength(1);
    press("a", "ArrowDown");
    expect(on()).toBe("a");
  });
});
