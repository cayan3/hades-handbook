/**
 * @vitest-environment jsdom
 *
 * Help, which is the one dialog reachable from every page — and the home of the
 * getting-started copy that used to sit on the Hub.
 */

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Help } from "./help.js";
import { SHORTCUTS_KEY } from "./keys.js";
import { MARKING_HINT } from "./messages.js";
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

describe("Help", () => {
  it("carries the gestures a run is marked with", () => {
    render(<Help onClose={() => {}} />);
    expect(container.textContent).toContain(MARKING_HINT);
  });

  /** Same text in both games: nothing it explains differs between them. */
  it("says the same thing whichever game is being read", () => {
    render(<Help onClose={() => {}} />);
    const hades2 = container.querySelector(".help")?.textContent;

    act(() =>
      root.render(
        <NodePresentation ladder="real-art" game="hades1">
          <Help onClose={() => {}} />
        </NodePresentation>,
      ),
    );
    expect(container.querySelector(".help")?.textContent).toBe(hades2);
  });

  /** The list is a step past this one, so this is where it gets named. */
  it("points at the shortcut list rather than repeating it", () => {
    render(<Help onClose={() => {}} />);

    expect(container.querySelector(".help__more")?.textContent).toContain(SHORTCUTS_KEY);
    expect(container.querySelectorAll(".shortcuts__row")).toHaveLength(0);
  });

  it("is a dialog with its own way out", () => {
    const closed = vi.fn();
    render(<Help onClose={closed} />);

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    act(() => container.querySelector<HTMLElement>(".sheet__close")?.click());
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
