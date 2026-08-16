/**
 * @vitest-environment jsdom
 *
 * Home, whose one non-negotiable is the last paragraph: a product that ships
 * somebody else's artwork with no statement of whose it is has no business
 * being published, so that sentence is asserted rather than trusted.
 */

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GodId } from "@repo/core";
import { Home, type HomeProps } from "./home.js";
import { UNAFFILIATED } from "./messages.js";
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

function home(over: Partial<HomeProps> = {}) {
  return (
    <Home held={0} pooled={[]} onGod={() => {}} onShortcuts={() => {}} {...over} />
  );
}

function texts(selector: string): string[] {
  return [...container.querySelectorAll(selector)].map((el) => el.textContent?.trim() ?? "");
}

describe("Home", () => {
  it("says whose the artwork is, in words a stranger reads", () => {
    render(home());

    const said = container.querySelector(".home__disclaimer")?.textContent ?? "";
    expect(said).toBe(UNAFFILIATED);
    expect(said).toContain("Supergiant Games");
    expect(said).toContain("unofficial");
  });

  /** Last on the page and behind nothing: findable, never in front of the run. */
  it("draws the disclaimer after everything else in the region", () => {
    render(home());

    const about = container.querySelector(".home__about");
    expect(about?.lastElementChild).toBe(container.querySelector(".home__disclaimer"));
  });

  it("offers the shortcut list a way in that is not a key", () => {
    const opened = vi.fn();
    render(home({ onShortcuts: opened }));

    const control = container.querySelector<HTMLElement>(".home__shortcuts");
    expect(control?.textContent).toBe("Keyboard shortcuts");
    act(() => control?.click());
    expect(opened).toHaveBeenCalledTimes(1);
  });
});

describe("this run", () => {
  it("asks for a god where the run has met nobody", () => {
    render(home());

    expect(container.querySelector(".home__run")?.textContent).toContain("Pick a god");
    expect(container.querySelector(".home__gods")).toBeNull();
  });

  it("says what the run holds and hands back every god it met", () => {
    const gone = vi.fn();
    render(home({ held: 3, pooled: ["Poseidon", "Ares"] as GodId[], onGod: gone }));

    expect(container.querySelector(".home__resume")?.textContent).toBe("3 boons from 2 gods.");
    expect(texts(".home__god")).toEqual(["Poseidon", "Ares"]);

    act(() => container.querySelector<HTMLElement>(".home__god")?.click());
    expect(gone).toHaveBeenCalledWith("Poseidon");
  });

  /** One boon and one god, which is the state a run spends its first minute in. */
  it("counts one of a thing without an s on it", () => {
    render(home({ held: 1, pooled: ["Ares"] as GodId[] }));
    expect(container.querySelector(".home__resume")?.textContent).toBe("1 boon from 1 god.");
  });

  /**
   * A disclosure rather than a state: it is still reachable once a run is going,
   * which is what keeps it from being a first-visit view you navigate away from
   * and never find again.
   */
  it("keeps getting started reachable with a run in progress", () => {
    render(home({ held: 3, pooled: ["Ares"] as GodId[] }));

    const control = container.querySelector<HTMLElement>(".home__howto");
    expect(control?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(".home__steps")).toBeNull();

    act(() => control?.click());
    expect(container.querySelector(".home__howto")?.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".home__steps")?.textContent).toContain("mark it as taken");
  });
});
