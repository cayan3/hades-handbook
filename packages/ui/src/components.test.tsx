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
    kind: null,
    rarity: null,
    rarities: [],
    element: null,
    notice: null,
    dormant: false,
    replaces: null,
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

  it("marks a boon's element in a corner and in words both", () => {
    // The symbol is the game's own art rather than a drawn glyph, so it says
    // *which* element — which is the thing five hollow rings could not. A
    // reader who never meets a picture gets the same fact as a sentence.
    render(<BoonNode view={view({ element: "Fire" })} />);
    const marker = container.querySelector<HTMLImageElement>(".node__element");
    expect(marker?.getAttribute("src")).toContain("Element_Fire");
    expect(marker?.getAttribute("alt")).toBe("");
    expect(container.querySelector("[hidden]")?.textContent).toContain("Fire affinity.");
  });

  it("draws no element corner where the record declares none", () => {
    // 28 of the 218 Hades II records reaching a page, and all 449 Hades I ones.
    render(<BoonNode view={view()} />);
    expect(container.querySelector(".node__element")).toBeNull();
  });

  it("drops the element corner where the surface asks, and keeps the words", () => {
    // The Loadout answers the element question once over the whole run rather
    // than marking every tile, so what a reader hears must not depend on it.
    render(<BoonNode view={view({ element: "Water" })} showElement={false} />);
    expect(container.querySelector(".node__element")).toBeNull();
    expect(container.querySelector("[hidden]")?.textContent).toContain("Water affinity.");
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

  it("says what kind of boon it is where it has one, and the rarity otherwise", () => {
    // A held Hades I Duo used to read "Legendary" here, that game having no
    // Duo rarity and all 28 of them declaring it.
    render(<BoonNode view={view({ state: "Obtained", kind: "duo" })} />);
    expect(container.querySelector("[hidden]")?.textContent).toContain("Duo.");

    render(<BoonNode view={view({ state: "Obtained", rarity: "Epic" })} />);
    expect(container.querySelector("[hidden]")?.textContent).toContain("Epic.");
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
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/art/official/Zeus_01.webp");
  });

  it("falls back to the placeholder when a file will not load", () => {
    render(<BoonNode view={view()} />);
    const art = container.querySelector("img")!;
    act(() => art.dispatchEvent(new Event("error", { bubbles: true })));
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "/art/official/_missing.webp",
    );
  });

  /**
   * A click is one gesture with two meanings, and the run decides which: mark
   * what it does not have, open the details of what it does. Marking something
   * already held would mean nothing, and putting a sheet in front of a boon you
   * are about to take is a dialog in front of the gesture a player makes dozens
   * of times a run.
   */
  it("marks what the run lacks and opens what it holds, from click and keyboard alike", () => {
    const onMark = vi.fn();
    const onOpen = vi.fn();

    render(<BoonNode view={view({ state: "Available" })} onMark={onMark} onOpen={onOpen} />);
    const takeable = container.querySelector("button")!;
    act(() => takeable.click());
    // A button gets Enter and Space for free, which is why it is a button.
    act(() => takeable.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onMark).toHaveBeenCalledTimes(2);
    expect(onMark).toHaveBeenLastCalledWith("ZeusWeaponTrait");
    expect(onOpen).not.toHaveBeenCalled();

    render(<BoonNode view={view({ state: "Obtained" })} onMark={onMark} onOpen={onOpen} />);
    act(() => container.querySelector("button")!.click());
    expect(onOpen).toHaveBeenCalledWith("ZeusWeaponTrait");
    expect(onMark).toHaveBeenCalledTimes(2);
  });

  /**
   * A right-click on a pointer and a long press on a touch screen both raise
   * `contextmenu`, so one handler is both gestures. A double-tap was the other
   * candidate and would have had to hold the first tap back a quarter-second to
   * recognise itself — and the tap it delays is the mark.
   */
  it("sets a goal from a context menu, and swallows the platform's own", () => {
    const onGoal = vi.fn();
    render(<BoonNode view={view()} onGoal={onGoal} />);
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    act(() => {
      container.querySelector("button")!.dispatchEvent(menu);
    });

    expect(onGoal).toHaveBeenCalledWith("ZeusWeaponTrait");
    // The platform's menu would cover the node it was opened on.
    expect(menu.defaultPrevented).toBe(true);
  });

  /**
   * Why a boon cannot be had, on hover and on focus, the way the game says the
   * same thing. Hidden from the accessibility tree because every word of it is
   * already in the description the control points at.
   */
  it("puts a verdict in a tooltip without saying it twice to a reader", () => {
    render(
      <BoonNode
        view={view({
          state: "Impossible",
          notice: { lead: "Impossible for now.", body: "Equip the keepsake.", keepsake: null },
        })}
      />,
    );
    const tip = container.querySelector(".node__tip");
    expect(tip?.textContent).toBe("Impossible for now. Equip the keepsake.");
    expect(tip?.getAttribute("aria-hidden")).toBe("true");

    render(<BoonNode view={view({ state: "Available" })} />);
    expect(container.querySelector(".node__tip")).toBeNull();
  });

  it("fetches no artwork at all on the fallback ladder", () => {
    // A hidden image is still fetched, and the fallback is for when there is
    // nothing to fetch.
    render(
      <NodePresentation ladder="fallback" game="hades2">
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

/**
 * The textual-state pass, on the surface it starts from: every state a node
 * draws has to be readable as words. The marker, the ring and the frame are all
 * `aria-hidden` or pure CSS, so the description is the only place a reader meets
 * any of them.
 */
describe("the textual state of a node", () => {
  const described = () => {
    const control = container.querySelector("button")!;
    return document.getElementById(control.getAttribute("aria-describedby")!)?.textContent ?? "";
  };

  /**
   * The pin was the one thing drawn and never said. `aria-current="true"` says
   * this control is the current *something* without saying of what, and the
   * glyph beside it is hidden.
   */
  it("says a boon is pinned, not only marks it", () => {
    render(<BoonNode view={view()} pinned />);
    expect(described()).toContain("Pinned to a goal.");

    render(<BoonNode view={view()} />);
    expect(described()).not.toContain("Pinned");
  });

  it("says the rest of what it draws", () => {
    render(
      <BoonNode
        view={view({ state: "Obtained", dormant: true, element: "Fire", rarities: ["Common"] })}
        pinned
      />,
    );
    const words = described();
    for (const said of ["Held.", "Pinned to a goal.", "Owned, and not active yet.", "Fire affinity."]) {
      expect(words).toContain(said);
    }
  });

  /**
   * Enter marks a boon the run does not hold, so before this there was no way to
   * reach an un-held boon's requirements at all without taking it first — which
   * is what the sheet exists to let a player decide.
   */
  it("opens the details of an un-held boon on its own key", () => {
    const onOpen = vi.fn();
    const onMark = vi.fn();
    render(<BoonNode view={view({ state: "Available" })} onOpen={onOpen} onMark={onMark} />);

    const control = container.querySelector("button")!;
    act(() => {
      control.dispatchEvent(new KeyboardEvent("keydown", { key: "d", bubbles: true }));
    });
    expect(onOpen).toHaveBeenCalledWith("ZeusWeaponTrait");
    // The marking gesture is untouched: it is what a player does dozens of times
    // a run and it still costs one press.
    expect(onMark).not.toHaveBeenCalled();
  });
});
