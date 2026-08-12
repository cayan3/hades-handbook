/**
 * @vitest-environment jsdom
 *
 * The god page in a document. What is under test is the drawing and the order
 * it is drawn in; which node belongs in which band is settled next door, on the
 * node environment, where it costs nothing.
 *
 * No test here asserts where a wire *lands*. The runner has no layout, so every
 * box measures zero, and a coordinate asserted against that would be a fact
 * about jsdom. What a wire is drawn *for* is testable and is what these check.
 */

import type { TraitId } from "@repo/core";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GodGraph, GraphBand, GraphEdge } from "./god-graph.js";
import { GodPage } from "./god-page.js";
import { GOD_VIEW_ACCENT, godColour } from "./god-palette.js";
import type { NodeView } from "./node-view.js";

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

function view(trait: TraitId, over: Partial<NodeView> = {}): NodeView {
  return {
    trait,
    name: trait,
    state: "Available",
    god: "Zeus",
    tier: 1,
    iconKey: "official/Zeus_01",
    rarity: null,
    rarities: [],
    notice: null,
    dormant: false,
    replaces: null,
    label: `${trait} — Available — Zeus`,
    ...over,
  };
}

function band(over: Partial<GraphBand>): GraphBand {
  return { key: "tier-1", kind: "tier", label: null, junctions: [], members: [], ...over };
}

function edge(from: string, to: string, taken = false): GraphEdge {
  return { id: `${from}>${to}`, from, to, taken };
}

function page(graph: GodGraph, props: Partial<Parameters<typeof GodPage>[0]> = {}) {
  const traits = graph.bands.flatMap((b) => b.members.map((m) => m.trait));
  return (
    <GodPage
      graph={graph}
      views={new Map(traits.map((trait) => [trait, view(trait)]))}
      {...props}
    />
  );
}

const names = () => [...container.querySelectorAll(".node__name")].map((el) => el.textContent);
const wires = () => [...container.querySelectorAll(".godpage__wire")];

/** A ladder of two bands: `a` and `b` on top, `d` under them through a junction. */
const LADDER: GodGraph = {
  god: "Zeus",
  bands: [
    band({ key: "tier-1", members: [{ trait: "a", partner: null }, { trait: "b", partner: null }] }),
    band({
      key: "tier-2",
      junctions: [{ id: "d#0", dependent: "d", min: 1, of: 4, status: "pending" }],
      members: [{ trait: "d", partner: null }],
    }),
  ],
  edges: [edge("a", "d#0", true), edge("b", "d#0"), edge("d#0", "d", true)],
};

describe("the page as a path through", () => {
  it("emits its nodes in band order, which is the tab order", () => {
    render(page(LADDER));

    expect(names()).toEqual(["a", "b", "d"]);
    // Tab order is DOM order, and the only version of that promise that cannot
    // quietly stop being true is that nothing anywhere sets an index. A laid-out
    // canvas is exactly where that usually goes.
    expect([...container.querySelectorAll("[tabindex]")]).toEqual([]);
  });

  it("groups into bands without naming a tier anywhere", () => {
    render(
      page({
        ...LADDER,
        bands: [
          ...LADDER.bands,
          band({ key: "duo", kind: "duo", label: "Duos", members: [{ trait: "duo", partner: "Ares" }] }),
        ],
      }),
    );

    expect(container.querySelectorAll(".godpage__band")).toHaveLength(3);
    expect(container.querySelectorAll(".godpage__bandname")).toHaveLength(1);
    // The tier is the game's own internal rank and the game never shows it, so
    // it orders the page and is neither drawn nor announced. Rendered text and
    // the accessibility tree, not the markup: `data-kind="tier"` is a styling
    // hook carrying the kind rather than the number, and a reader never meets
    // an attribute.
    expect(container.textContent).not.toMatch(/tier/i);
    const announced = [...container.querySelectorAll("[aria-label]")].map((el) =>
      el.getAttribute("aria-label"),
    );
    expect(announced.some((label) => /tier|\btier \d/i.test(label ?? ""))).toBe(false);
  });

  it("says what a junction stands for without making it a stop", () => {
    render(page(LADDER));
    const junction = container.querySelector(".junction")!;

    // Four branches offered and two drawn: the page has the rest of them on
    // other gods' pages, and the count belongs to the requirement.
    expect(junction.getAttribute("aria-label")).toBe("Any 1 of 4 — not yet met");
    expect(junction.matches("button, [tabindex]")).toBe(false);
  });

  it("marks the pinned ones and only those", () => {
    render(page(LADDER, { pinned: new Set(["b"]) }));
    expect(container.querySelectorAll(".node__marker")).toHaveLength(1);
  });
});

describe("the connectors", () => {
  it("draws none at rest", () => {
    // A page carries up to 66 and one gate can fan to nine on its own, so the
    // resting state is quiet or the light-up on satisfaction reads as noise.
    render(page(LADDER));
    expect(wires()).toHaveLength(0);
  });

  it("draws the neighbourhood of whatever has focus", () => {
    render(page(LADDER));
    const [first] = [...container.querySelectorAll<HTMLElement>("button")];
    act(() => first!.focus());

    // `a` feeds the junction, and the junction's own way down comes with it —
    // otherwise the path leaves the node, reaches a diamond and stops.
    expect(wires().map((el) => el.getAttribute("data-taken"))).toEqual(["true", "true"]);

    act(() => first!.blur());
    expect(wires()).toHaveLength(0);
  });

  it("draws the lot when asked, and says which paths are contributing", () => {
    render(page(LADDER));
    const toggle = container.querySelector<HTMLInputElement>(".godpage__showall input")!;
    act(() => toggle.click());

    // Line style carries path status and nothing else: solid where the run
    // holds the prerequisite, dashed where the branch is still open.
    expect(wires().map((el) => el.getAttribute("data-taken"))).toEqual(["true", "false", "true"]);
  });

  it("offers no toggle on a god with nothing to connect", () => {
    // Four gods in Hades II have no on-page prerequisite at all.
    render(page({ ...LADDER, edges: [] }));
    expect(container.querySelector(".godpage__showall")).toBeNull();
  });

  it("draws nothing for an endpoint that never reached the page", () => {
    // A member with no view is skipped, so it anchors nothing, so the wire into
    // it has no geometry — an empty path rather than a line to the origin. The
    // same guard covers the first frame, before any measurement has run.
    render(
      <GodPage graph={LADDER} views={new Map([["b", view("b")], ["d", view("d")]])} />,
    );
    act(() => container.querySelector<HTMLInputElement>(".godpage__showall input")!.click());

    // `a` was never rendered; `b`'s wire and the junction's own way down still
    // have both their ends, so exactly one of the three comes out empty.
    expect(names()).toEqual(["b", "d"]);
    const drawn = wires().map((el) => el.getAttribute("d"));
    expect(drawn).toHaveLength(3);
    expect(drawn.filter((d) => d === "")).toHaveLength(1);
  });
});

describe("the one hue a single-god page carries", () => {
  it("gives its own boons the page accent rather than the god's colour", () => {
    render(page(LADDER));
    const nodes = [...container.querySelectorAll<HTMLElement>(".node")];

    // Every node here belongs to the same god, so that god's hue would be the
    // strongest channel on the page spent on nothing.
    expect(nodes.map((el) => el.style.getPropertyValue("--god"))).toEqual([
      GOD_VIEW_ACCENT,
      GOD_VIEW_ACCENT,
      GOD_VIEW_ACCENT,
    ]);
    expect(GOD_VIEW_ACCENT).not.toBe(godColour("Zeus"));
  });

  it("puts a Duo on the rim in its partner's colour, and in words as well", () => {
    render(
      page({
        god: "Zeus",
        bands: [
          band({
            key: "duo",
            kind: "duo",
            label: "Duos",
            members: [{ trait: "duo", partner: "Ares" }],
          }),
        ],
        edges: [],
      }),
    );

    expect(container.querySelector<HTMLElement>(".node")?.style.getPropertyValue("--god")).toBe(
      godColour("Ares"),
    );
    // A hue is the one thing the linear surfaces cannot repeat, so the partner
    // is named as well as coloured.
    expect(container.querySelector(".godpage__partner")?.textContent).toBe("with Ares");
  });
});

describe("the gestures the page inherits", () => {
  it("marks what the run lacks and pins from a context menu", () => {
    const onMark = vi.fn();
    const onGoal = vi.fn();
    render(page(LADDER, { onMark, onGoal }));

    const first = container.querySelector<HTMLElement>("button")!;
    act(() => first.click());
    expect(onMark).toHaveBeenCalledWith("a");

    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    act(() => {
      first.dispatchEvent(menu);
    });
    expect(onGoal).toHaveBeenCalledWith("a");
  });
});
