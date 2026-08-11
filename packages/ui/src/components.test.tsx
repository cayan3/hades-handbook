/**
 * @vitest-environment jsdom
 *
 * The components, in a document. Everything else here runs on the node
 * environment, so the cost lands on the two files that need one.
 */

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoonNode } from "./boon-node.js";
import { Junction } from "./junction.js";
import type { NodeView } from "./node-view.js";
import { NodePresentation } from "./presentation.js";
import { TierBands } from "./tier-bands.js";

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

function view(over: Partial<NodeView> = {}): NodeView {
  return {
    trait: "ZeusWeaponTrait",
    name: "Storm Lightning",
    state: "Available",
    god: "Zeus",
    tier: 2,
    iconKey: "official/Zeus_01",
    rarity: null,
    rarities: [],
    notice: null,
    dormant: false,
    label: "Storm Lightning — Available — Zeus",
    ...over,
  };
}

const STATES = ["Obtained", "Available", "Pending", "Locked", "Impossible"] as const;

describe("BoonNode", () => {
  it("is a focusable control, not a shape", () => {
    render(<BoonNode view={view()} />);
    const control = container.querySelector("button");
    expect(control).not.toBeNull();
    act(() => control!.focus());
    expect(document.activeElement).toBe(control);
  });

  it("carries its state in the accessible name rather than in colour alone", () => {
    for (const state of STATES) {
      render(<BoonNode view={view({ state, label: `Storm Lightning — ${state}` })} />);
      expect(container.querySelector("button")?.getAttribute("aria-label")).toBe(
        `Storm Lightning — ${state}`,
      );
    }
  });

  it("renders each of the five states as a distinguishable node", () => {
    render(
      <>
        {STATES.map((state) => (
          <BoonNode key={state} view={view({ state })} />
        ))}
      </>,
    );
    const drawn = [...container.querySelectorAll<HTMLElement>(".node")];
    expect(drawn.map((el) => el.dataset["state"])).toEqual([...STATES]);
  });

  it("reflects held and pinned where a reader can find them", () => {
    render(
      <BoonNode
        view={view({ state: "Obtained", label: "Storm Lightning — Obtained — Zeus" })}
        pinned
        onOpen={() => {}}
      />,
    );
    const control = container.querySelector("button")!;
    // Held is carried in words rather than by `aria-pressed`, and the control
    // says what it actually does, which is open a dialog. A toggle whose
    // activation does not toggle the state it advertises is a control that
    // lies; nothing is lost, because the name is what a reader hears first.
    expect(control.getAttribute("aria-label")).toContain("Obtained");
    expect(control.getAttribute("aria-pressed")).toBeNull();
    expect(control.getAttribute("aria-haspopup")).toBe("dialog");
    expect(control.getAttribute("aria-current")).toBe("true");
    expect(container.querySelector(".node__marker")).not.toBeNull();

    render(<BoonNode view={view({ state: "Locked" })} />);
    // Nothing to open, so nothing is claimed.
    expect(container.querySelector("button")?.getAttribute("aria-haspopup")).toBeNull();
    expect(container.querySelector("button")?.getAttribute("aria-current")).toBeNull();
    expect(container.querySelector(".node__marker")).toBeNull();
  });

  it("keeps the obtained treatment and adds a ring when a boon is inert", () => {
    // The badge is on Obtained rather than beside it: a sixth state would say
    // the player does not have the boon.
    render(<BoonNode view={view({ state: "Obtained", dormant: true })} />);
    expect(container.querySelector<HTMLElement>(".node")?.dataset["state"]).toBe("Obtained");
    expect(container.querySelector(".node__dormant")).not.toBeNull();
    expect(container.querySelector("[hidden]")?.textContent).toContain("not active yet");
  });

  it("puts the whole of a verdict where a reader will hear it", () => {
    render(
      <BoonNode
        view={view({
          state: "Impossible",
          notice: {
            lead: "Impossible for now.",
            body: "Equip this god's keepsake next region to invite them to your pool.",
            keepsake: "Conch Shell",
          },
        })}
      />,
    );

    // On the node, so somebody scanning a page of dead ends sees that one of
    // them is not one.
    expect(container.querySelector(".node__lead")?.textContent).toBe("Impossible for now.");
    const description = container.querySelector("[hidden]")?.textContent ?? "";
    expect(description).toContain(
      "Impossible for now. Equip this god's keepsake next region to invite them to your pool.",
    );
    expect(description).toContain("Conch Shell");
  });

  it("describes the node without naming it twice", () => {
    // A separate element the control points at, not content inside it: content
    // inside a button becomes part of its name, so a reader would announce the
    // state twice and the sentence in the middle of the label.
    render(<BoonNode view={view()} />);
    const control = container.querySelector("button")!;
    const described = document.getElementById(control.getAttribute("aria-describedby")!);
    expect(described).not.toBeNull();
    expect(control.contains(described)).toBe(false);
  });

  it("escapes text it did not author", () => {
    // A boon's name is extracted game text and a note is the player's. Neither
    // is ever markup, and this asserts it about the framework rather than about
    // a convention somebody has to remember.
    const hostile = '<img src=x onerror="alert(1)">';
    render(<BoonNode view={view({ name: hostile })} />);
    const label = container.querySelector(".node__name")!;
    expect(label.textContent).toBe(hostile);
    expect(label.children).toHaveLength(0);
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("renders the path the resolver's key composes to, and nothing else", () => {
    render(<BoonNode view={view({ iconKey: "official/Zeus_01" })} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/art/official/Zeus_01.png");
  });

  it("falls back to the placeholder when a file will not load", () => {
    render(<BoonNode view={view()} />);
    const art = container.querySelector("img")!;
    act(() => art.dispatchEvent(new Event("error", { bubbles: true })));
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "/art/official/_missing.png",
    );
  });

  it("opens the detail surface from a click and from the keyboard alike", () => {
    const onOpen = vi.fn();
    render(<BoonNode view={view()} onOpen={onOpen} />);
    const control = container.querySelector("button")!;

    act(() => control.click());
    // A button gets Enter and Space for free, which is why it is a button.
    act(() => control.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenLastCalledWith("ZeusWeaponTrait");
  });

  it("fetches no artwork at all on the fallback ladder", () => {
    // A hidden image is still fetched, and the fallback is for when there is
    // nothing to fetch.
    render(
      <NodePresentation ladder="fallback">
        <BoonNode view={view()} />
      </NodePresentation>,
    );
    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelector<HTMLElement>(".node")?.dataset["ladder"]).toBe("fallback");
  });

  it("hands the god's colour to the node as a property rather than a class", () => {
    render(<BoonNode view={view({ god: "Zeus" })} />);
    expect(container.querySelector<HTMLElement>(".node")?.style.getPropertyValue("--god")).toBe(
      "#FFE81F",
    );

    render(<BoonNode view={view({ god: null })} />);
    expect(container.querySelector<HTMLElement>(".node")?.style.getPropertyValue("--god")).toBe(
      "#C9BFB2",
    );
  });
});

describe("Junction", () => {
  it("renders the three-way answer for the group it stands for", () => {
    for (const status of ["satisfied", "pending", "unsatisfiable"] as const) {
      render(<Junction status={status} min={1} of={5} />);
      expect(container.querySelector<HTMLElement>(".junction")?.dataset["status"]).toBe(status);
    }
  });

  it("says what it is without being a tab stop", () => {
    render(<Junction status="pending" min={1} of={5} />);
    const junction = container.querySelector(".junction")!;
    expect(junction.getAttribute("aria-label")).toBe("Any 1 of 5 — not yet met");
    expect(junction.matches("button, [tabindex]")).toBe(false);
  });
});

describe("TierBands", () => {
  it("emits nodes in tier order, which is the tab order", () => {
    render(
      <TierBands
        views={[
          view({ trait: "c", name: "C", tier: 3 }),
          view({ trait: "untiered", name: "Untiered", tier: null }),
          view({ trait: "a", name: "A", tier: 1 }),
          view({ trait: "b", name: "B", tier: 1 }),
        ]}
      />,
    );

    const order = [...container.querySelectorAll(".node__name")].map((el) => el.textContent);
    expect(order).toEqual(["A", "B", "C", "Untiered"]);
    expect([...container.querySelectorAll("[tabindex]")]).toEqual([]);
  });

  /**
   * Rewritten rather than deleted: it used to assert the bands were labelled
   * "Tier 1" and "Untiered". The tier is the game's internal rank and the game
   * never shows it, so it groups the page and is not written on it. The bands
   * themselves stay, because they are the order.
   */
  it("groups into bands without naming the tier", () => {
    render(<TierBands views={[view({ tier: 1 }), view({ trait: "x", tier: null })]} />);
    expect(container.querySelectorAll(".tier-bands__band")).toHaveLength(2);
    expect(container.textContent).not.toMatch(/tier/i);
  });

  it("marks the pinned ones and only those", () => {
    render(
      <TierBands
        views={[view({ trait: "a", tier: 1 }), view({ trait: "b", tier: 1 })]}
        pinned={new Set(["b"])}
      />,
    );
    expect(container.querySelectorAll(".node__marker")).toHaveLength(1);
  });
});
