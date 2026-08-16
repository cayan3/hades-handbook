/**
 * @vitest-environment jsdom
 *
 * The command set written out, and the dialog rules under it. Those rules were
 * the Action Sheet's and are shared now, so this checks the shared copy behaves
 * where the sheet's tests check the sheet.
 */

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SHORTCUTS } from "./keys.js";
import { Shortcuts } from "./shortcuts.js";

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

describe("the shortcut list", () => {
  it("writes out every binding", () => {
    render(<Shortcuts onClose={() => {}} />);

    const rows = [...container.querySelectorAll(".shortcuts__row")];
    expect(rows).toHaveLength(SHORTCUTS.length);
    // Each row is keys and words, never a key on its own: this list is the only
    // place the set is stated, so a row with no sentence says nothing.
    expect(rows.every((row) => (row.querySelector("dd")?.textContent ?? "") !== "")).toBe(true);
    expect(container.textContent).toContain("Set or clear a goal");
  });

  it("is a dialog and says so", () => {
    render(<Shortcuts onClose={() => {}} />);

    const dialog = container.querySelector(".shortcuts");
    expect(dialog?.getAttribute("role")).toBe("dialog");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    // Labelled by its own heading rather than by an attribute nobody maintains.
    const labelledBy = dialog?.getAttribute("aria-labelledby");
    expect(container.querySelector(`#${labelledBy}`)?.textContent).toBe("Keyboard shortcuts");
  });

  it("sets no tab index, like everything else here", () => {
    render(<Shortcuts onClose={() => {}} />);

    expect(container.querySelectorAll("[tabindex]")).toHaveLength(0);
  });
});

describe("the dialog rules it shares with the sheet", () => {
  it("takes focus on open and hands it back on close", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    render(<Shortcuts onClose={() => {}} />);
    expect(document.activeElement).toBe(container.querySelector(".sheet__close"));

    act(() => root.render(<></>));
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  /**
   * On the document rather than on the dialog: a tap on the shade leaves focus
   * outside, and a handler on the dialog would never hear the key.
   */
  it("closes on Escape pressed anywhere", () => {
    const onClose = vi.fn();
    render(<Shortcuts onClose={onClose} />);

    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on a click on the shade and not on one inside it", () => {
    const onClose = vi.fn();
    render(<Shortcuts onClose={onClose} />);

    act(() => {
      container
        .querySelector(".shortcuts")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      container.querySelector(".sheet-scrim")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalled();
  });
});
