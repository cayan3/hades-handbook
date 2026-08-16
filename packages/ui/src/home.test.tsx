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
import { Home } from "./home.js";
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

describe("Home", () => {
  it("says whose the artwork is, in words a stranger reads", () => {
    render(<Home onShortcuts={() => {}} />);

    const said = container.querySelector(".home__disclaimer")?.textContent ?? "";
    expect(said).toBe(UNAFFILIATED);
    expect(said).toContain("Supergiant Games");
    expect(said).toContain("unofficial");
  });

  /** Last on the page and behind nothing: findable, never in front of the run. */
  it("draws the disclaimer after everything else in the region", () => {
    render(<Home onShortcuts={() => {}} />);

    const about = container.querySelector(".home__about");
    expect(about?.lastElementChild).toBe(container.querySelector(".home__disclaimer"));
  });

  it("offers the shortcut list a way in that is not a key", () => {
    const opened = vi.fn();
    render(<Home onShortcuts={opened} />);

    const control = container.querySelector<HTMLElement>(".home__shortcuts");
    expect(control?.textContent).toBe("Keyboard shortcuts");
    act(() => control?.click());
    expect(opened).toHaveBeenCalledTimes(1);
  });
});
