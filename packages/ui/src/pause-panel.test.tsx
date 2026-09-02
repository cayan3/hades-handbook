/**
 * @vitest-environment jsdom
 *
 * The pause panel: four rows, two groups, and nothing in it that acts on a run.
 * Every row is a way somewhere else, which is what the panel is for.
 */

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PausePanel } from "./pause-panel.js";
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

function render(node: ReactElement, game: "hades1" | "hades2" = "hades2"): void {
  act(() =>
    root.render(
      <NodePresentation ladder="real-art" game={game}>
        {node}
      </NodePresentation>,
    ),
  );
}

/** All four handlers, so a test can assert the one it pressed and no other. */
function handlers() {
  return {
    onContinue: vi.fn(),
    onHelp: vi.fn(),
    onSaveSlots: vi.fn(),
    onHome: vi.fn(),
  };
}

function options(): string[] {
  return [...container.querySelectorAll(".pause__option")].map((el) => el.textContent ?? "");
}

function press(label: string): void {
  const option = [...container.querySelectorAll<HTMLElement>(".pause__option")].find(
    (button) => button.textContent === label,
  );
  if (option === undefined) throw new Error(`no option "${label}"`);
  act(() => option.click());
}

describe("the pause panel", () => {
  it("offers the four rows in the order they were asked for", () => {
    render(<PausePanel {...handlers()} />);

    expect(options()).toEqual([
      "Continue",
      "How to use this Handbook",
      "Save slots",
      "Return to Home",
    ]);
  });

  /**
   * The gap is the design: staying in the run and leaving it are different
   * kinds of choice, and grouping is the only thing that says so.
   */
  it("puts the two that leave the run in a group of their own", () => {
    render(<PausePanel {...handlers()} />);

    const groups = [...container.querySelectorAll(".pause__group")].map((group) =>
      [...group.querySelectorAll(".pause__option")].map((el) => el.textContent),
    );
    expect(groups).toEqual([
      ["Continue", "How to use this Handbook"],
      ["Save slots", "Return to Home"],
    ]);
  });

  /**
   * Which handler, not just how many: the first version of this asked only that
   * exactly one fired, and a row wired to its neighbour passed it.
   */
  it("sends each row to its own handler and to no other", () => {
    const wiring = {
      Continue: "onContinue",
      "How to use this Handbook": "onHelp",
      "Save slots": "onSaveSlots",
      "Return to Home": "onHome",
    } as const;

    for (const [label, expected] of Object.entries(wiring)) {
      const spies = handlers();
      render(<PausePanel {...spies} />);
      press(label);

      const called = Object.entries(spies)
        .filter(([, spy]) => spy.mock.calls.length > 0)
        .map(([name]) => name);
      expect(called, `"${label}" reached the wrong handler`).toEqual([expected]);
      expect(spies[expected]).toHaveBeenCalledTimes(1);
    }
  });

  /**
   * Every way out of it is *Continue*, which is what makes both the shade and
   * the key safe on a panel opened over a run in play.
   */
  it("treats a dismissal as continuing", () => {
    const spies = handlers();
    render(<PausePanel {...spies} />);

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(spies.onContinue).toHaveBeenCalledTimes(1);

    act(() => container.querySelector<HTMLElement>(".sheet-scrim")?.click());
    expect(spies.onContinue).toHaveBeenCalledTimes(2);
    expect(spies.onSaveSlots).not.toHaveBeenCalled();
    expect(spies.onHome).not.toHaveBeenCalled();
  });

  /** The rows glow in the game being read, so the panel says which one it is. */
  it("carries the game it is drawn over", () => {
    render(<PausePanel {...handlers()} />, "hades1");
    expect(container.querySelector(".pause")?.getAttribute("data-game")).toBe("hades1");

    render(<PausePanel {...handlers()} />, "hades2");
    expect(container.querySelector(".pause")?.getAttribute("data-game")).toBe("hades2");
  });

  /** A modal, and focus lands on the row that costs nothing. */
  it("is a dialog whose first control is Continue", () => {
    render(<PausePanel {...handlers()} />);

    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-label")).toBe("Menu");
    expect(document.activeElement?.textContent).toBe("Continue");
  });
});
