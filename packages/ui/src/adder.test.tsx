/** @vitest-environment jsdom */
/*
 * The Adder: what it opens onto, what the search finds and in what order, and
 * what a row says. The ranking is most of this file — the games name in
 * families, so "strike" is nine records in Hades I and ten in Hades II, and a
 * substring match alone hands them back in no order at all.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";
import { NodePresentation } from "./presentation.js";
import { Adder, type AddItem, type Entry, type AdderProps } from "./adder.js";

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

type State = "Obtained" | "Available" | "Pending" | "Locked" | "Impossible";
const rec = (
  trait: string,
  name: string,
  god: string | null,
  state: State,
  whose?: string,
): AddItem => ({
  kind: "record",
  trait,
  name,
  god,
  whose: whose ?? god,
  iconKey: "official/_missing",
  state,
});

/* Bands for the query "strike": FORCE and ONE start with it; ATHLETIC, FLUTTER
   and STORM carry it as a later word, and STORM is held so it trails its band. */
const FORCE = rec("force", "Strike Force", "Ares", "Pending");
const ONE = rec("one", "Strike One", "Aphrodite", "Available");
const ATHLETIC = rec("athletic", "Athletic Strike", "Zeus", "Available");
const FLUTTER = rec("flutter", "Flutter Strike", "Aphrodite", "Available");
const STORM = rec("storm", "Storm Strike", "Zeus", "Obtained");
const LUNAR = rec("lunar", "Lunar Ray", null, "Available", "Hex");
const DUO = rec("duo", "Splitting Headache", null, "Available", "Zeus / Ares");
const HEART = rec("heart", "Heart Rend", "Aphrodite", "Impossible");
/* Starts with the same prefix as her tab, which is what tells "a tab wins" from
   "a tab happens to sort early": without it the tab could drop two bands and
   still lead, every other hit for that query matching only through her name. */
const BLESSING = rec("blessing", "Aphrodite's Blessing", "Aphrodite", "Available");

const BOW: AddItem = { kind: "weapon", weapon: "BowWeapon", name: "Heart-Seeking Bow" };
const APHRODITE: AddItem = { kind: "god", god: "Aphrodite" };
const ZEUS: AddItem = { kind: "god", god: "Zeus" };

const SEARCHABLE: readonly AddItem[] = [
  APHRODITE,
  ZEUS,
  BOW,
  FORCE,
  ONE,
  ATHLETIC,
  FLUTTER,
  STORM,
  LUNAR,
  DUO,
  HEART,
  BLESSING,
];
const ROOT: readonly Entry[] = [
  ZEUS,
  { kind: "god", god: "Ares" },
  {
    id: "others",
    label: "Others",
    entries: [
      { id: "weapons", label: "Weapons / Hammers", entries: [BOW] },
      { id: "hexes", label: "Hexes", entries: [LUNAR] },
    ],
  },
];

function draw(props: Partial<AdderProps> = {}) {
  act(() =>
    root.render(
      <NodePresentation ladder="fallback" game="hades2">
        <Adder
          root={ROOT}
          searchable={SEARCHABLE}
          onPickGod={() => undefined}
          onPickWeapon={() => undefined}
          onMark={() => undefined}
          {...props}
        />
      </NodePresentation>,
    ),
  );
}
const open = () => act(() => container.querySelector<HTMLButtonElement>(".adder__open")!.click());
const rows = () =>
  [...container.querySelectorAll(".adder__row .adder__name")].map((n) => n.textContent);
const branches = () =>
  [...container.querySelectorAll(".adder__branch .adder__name")].map((n) => n.textContent);
const texts = (selector: string) =>
  [...container.querySelectorAll(selector)].map((n) => n.textContent);
const field = () => container.querySelector<HTMLInputElement>(".adder__field")!;
const press = (key: string) =>
  act(() => field().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
const branch = (label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>(".adder__branch")].find((b) =>
    b.textContent?.includes(label),
  )!;
const hover = (label: string) =>
  act(() => branch(label).dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
const openBranch = (label: string) => act(() => branch(label).click());
const type = (q: string) =>
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field(), q);
    field().dispatchEvent(new Event("input", { bubbles: true }));
  });

it("layered is the default: every root row opens something", () => {
  draw();
  open();
  expect(branches()).toEqual(["Olympians", "Weapons / Hammers", "Hexes"]);
  expect(rows()).toEqual([]);
});

it("opens the cursor into an empty field, without a click", () => {
  draw();
  open();
  expect(document.activeElement).toBe(field());
  type("strike");
  act(() => container.querySelector<HTMLButtonElement>(".adder__open")!.click());
  open();
  expect(field().value).toBe("");
  expect(document.activeElement).toBe(field());
});

it("hovering a neighbouring branch switches which one is open", () => {
  draw();
  open();
  hover("Olympians");
  expect(container.querySelectorAll(".adder__list")).toHaveLength(2);
  expect(rows()).toEqual(["Zeus", "Ares"]);
  hover("Weapons / Hammers");
  expect(container.querySelectorAll(".adder__list")).toHaveLength(2);
  expect(rows()).toEqual(["Heart-Seeking Bow"]);
});

it("a tab beats a boon on the same prefix", () => {
  draw();
  open();
  type("aphro");
  expect(rows()).toEqual([
    "Aphrodite",
    "Aphrodite's Blessing",
    "Flutter Strike",
    "Heart Rend",
    "Strike One",
  ]);
});

it("a weapon tab is findable by a word inside its name", () => {
  draw();
  open();
  type("seeking");
  expect(rows()).toEqual(["Heart-Seeking Bow"]);
});

it("ungrouped, a family comes back in band order and nothing else", () => {
  draw({ grouped: false });
  open();
  type("strike");
  expect(rows()).toEqual([
    "Strike Force",
    "Strike One",
    "Athletic Strike",
    "Flutter Strike",
    "Storm Strike",
  ]);
});

it("grouped, a family clusters under the god that offers it", () => {
  draw({ grouped: true });
  open();
  type("strike");
  // Aphrodite's best hit is band 2, so both of hers come before Zeus's two.
  expect(rows()).toEqual([
    "Strike Force",
    "Strike One",
    "Flutter Strike",
    "Athletic Strike",
    "Storm Strike",
  ]);
});

it("state sits by the name and whose-it-is stays a right-hand column", () => {
  draw();
  open();
  type("strike");
  expect(texts(".adder__meta")).toEqual(["Ares", "Aphrodite", "Aphrodite", "Zeus", "Zeus"]);
  expect(texts(".adder__state")).toEqual(["pending", "held"]);
  expect(container.querySelector(".adder__row")!.getAttribute("aria-label")).toBe(
    "Strike Force — Ares — Pending",
  );
});

it("a tab says nothing in the right-hand column", () => {
  draw();
  open();
  type("aphro");
  const first = container.querySelector(".adder__row")!;
  expect(first.getAttribute("data-kind")).toBe("god");
  expect(first.querySelector(".adder__meta")).toBeNull();
});

it("a Duo names both its gods rather than saying 'duo'", () => {
  draw();
  open();
  type("headache");
  expect(texts(".adder__meta")).toEqual(["Zeus / Ares"]);
});

it("draws no state stripe: the channel is the word and the hover outline", () => {
  draw();
  open();
  type("strike");
  expect(container.querySelector("[data-state]")).toBeNull();
});

it("a god row carries its own hue and a weapon row carries none", () => {
  draw();
  open();
  type("aphro");
  expect(
    container.querySelector<HTMLElement>(".adder__row")!.style.getPropertyValue("--god"),
  ).not.toBe("");
  type("seeking");
  expect(
    container.querySelector<HTMLElement>(".adder__row")!.style.getPropertyValue("--god"),
  ).toBe("");
});

it("the arrows walk the results without taking focus off the field", () => {
  draw();
  open();
  type("strike");
  expect(field().getAttribute("aria-activedescendant")).toBe("adder-force");
  press("ArrowDown");
  expect(document.activeElement).toBe(field());
  expect(field().getAttribute("aria-activedescendant")).toBe("adder-one");
  expect(container.querySelector("[data-active]")!.id).toBe("adder-one");
  press("ArrowUp");
  expect(field().getAttribute("aria-activedescendant")).toBe("adder-force");
  // Clamped at the near end rather than wrapping, as every other walk here is.
  press("ArrowUp");
  expect(field().getAttribute("aria-activedescendant")).toBe("adder-force");
});

it("Enter takes the row the arrows are on", () => {
  const picked: string[] = [];
  draw({ onMark: (trait) => picked.push(trait) });
  open();
  type("strike");
  press("ArrowDown");
  press("Enter");
  expect(picked).toEqual(["one"]);
});

it("nothing anywhere sets a tab index", () => {
  draw();
  open();
  type("strike");
  expect(container.querySelector("[tabindex]")).toBeNull();
});

it("tree keeps three levels: Others, then a category, then its members", () => {
  draw({ arrangement: "tree" });
  open();
  expect(branches()).toEqual(["Others"]);
  openBranch("Others");
  openBranch("Hexes");
  expect(container.querySelectorAll(".adder__list")).toHaveLength(3);
  // The gods stay drawn at the root, which is what "gods stay one hover deep"
  // means: the branches opened beside them rather than replacing them.
  expect(rows()).toEqual(["Zeus", "Ares", "Lunar Ray"]);
});

it("one-others folds every category into one list", () => {
  draw({ arrangement: "one-others" });
  open();
  openBranch("Others");
  expect(container.querySelectorAll(".adder__branch")).toHaveLength(1);
  expect(rows()).toEqual(["Zeus", "Ares", "Heart-Seeking Bow", "Lunar Ray"]);
});

it("flat folds it to one level with no branch at all", () => {
  draw({ arrangement: "flat" });
  open();
  expect(container.querySelectorAll(".adder__branch")).toHaveLength(0);
  expect(rows()).toEqual(["Zeus", "Ares", "Heart-Seeking Bow", "Lunar Ray"]);
});

it("keeps the row the arrows are on in view", () => {
  const seen: string[] = [];
  const real = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (this: Element) {
    seen.push(this.id);
  };
  try {
    draw();
    open();
    type("strike");
    seen.length = 0;
    press("ArrowDown");
    expect(seen).toEqual(["adder-one"]);
  } finally {
    Element.prototype.scrollIntoView = real;
  }
});
