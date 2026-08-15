/**
 * @vitest-environment jsdom
 *
 * The picker's focus behaviour, which is why it is a component rather than a
 * stylesheet change — the native select beside it needed none of this. Hover is
 * dispatched rather than simulated: jsdom has a pointer only in the sense that
 * it delivers the events, and that is the half under test.
 */

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GodPicker } from "./god-picker.js";

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

const GODS = ["Aphrodite", "Ares", "Hera"];

function opener(): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>(".godpicker__open");
  if (found === null) throw new Error("no control to open the picker");
  return found;
}

function offered(): string[] {
  return [...container.querySelectorAll(".godpicker__god")].map((el) => el.textContent ?? "");
}

describe("the god picker", () => {
  it("draws nothing at all when every god is already on the bar", () => {
    render(<GodPicker gods={[]} onPick={() => undefined} />);
    expect(container.querySelector(".godpicker")).toBeNull();
  });

  it("stays shut until it is hovered", () => {
    render(<GodPicker gods={GODS} onPick={() => undefined} />);

    expect(offered()).toEqual([]);
    expect(opener().getAttribute("aria-expanded")).toBe("false");

    act(() => {
      container
        .querySelector(".godpicker")
        ?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    expect(offered()).toEqual(GODS);
    expect(opener().getAttribute("aria-expanded")).toBe("true");
  });

  /**
   * The half a native select gets for free. Focus counts as hover here for the
   * same reason it does in the Loadout: otherwise the control is a thing only a
   * mouse can reach, and `ui-views.md`'s accessibility approach forbids that.
   */
  it("opens on focus and closes when focus leaves it", () => {
    render(<GodPicker gods={GODS} onPick={() => undefined} />);

    act(() => opener().focus());
    expect(offered()).toEqual(GODS);

    // A blur whose next stop is outside the picker. React reads
    // `relatedTarget`, so the event has to carry one.
    act(() => {
      opener().dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body }),
      );
    });
    expect(offered()).toEqual([]);
  });

  /** Moving from the control onto a god must not take the list away en route. */
  it("stays open while focus is on one of the gods", () => {
    render(<GodPicker gods={GODS} onPick={() => undefined} />);
    act(() => opener().focus());

    const first = container.querySelector<HTMLButtonElement>(".godpicker__god");
    act(() => {
      opener().dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: first }));
    });

    expect(offered()).toEqual(GODS);
  });

  it("hands back the god that was clicked and puts the list away", () => {
    const onPick = vi.fn();
    render(<GodPicker gods={GODS} onPick={onPick} />);
    act(() => opener().focus());

    act(() => container.querySelectorAll<HTMLElement>(".godpicker__god")[2]?.click());

    expect(onPick).toHaveBeenCalledWith("Hera");
    expect(offered()).toEqual([]);
  });

  /**
   * Escape is the key everybody tries, and closing without moving the focus
   * back would leave a keyboard user standing on an element that is gone.
   */
  it("closes on Escape and gives the focus back to the control", () => {
    render(<GodPicker gods={GODS} onPick={() => undefined} />);
    act(() => opener().focus());
    // Pressed from inside the list rather than from the control, or the
    // assertion below is true before the key is ever sent.
    const god = container.querySelectorAll<HTMLButtonElement>(".godpicker__god")[1];
    act(() => god?.focus());
    expect(document.activeElement).toBe(god);

    act(() => {
      god?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(offered()).toEqual([]);
    expect(document.activeElement).toBe(opener());
  });

  /**
   * The dismissal is about the key that was pressed, not a state the control
   * is left in: a keyboard that closed the list and then asked for it again
   * has to get it, or Escape has disabled the control.
   */
  it("opens again after an Escape", () => {
    render(<GodPicker gods={GODS} onPick={() => undefined} />);
    act(() => opener().focus());
    act(() => {
      container
        .querySelectorAll<HTMLButtonElement>(".godpicker__god")[0]
        ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(offered()).toEqual([]);

    act(() => opener().click());

    expect(offered()).toEqual(GODS);
  });

  /** And the same for coming back to it, rather than only for asking again. */
  it("opens again after an Escape and a trip away", () => {
    render(<GodPicker gods={GODS} onPick={() => undefined} />);
    act(() => opener().focus());
    act(() => {
      container
        .querySelectorAll<HTMLButtonElement>(".godpicker__god")[0]
        ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    act(() => {
      opener().dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body }),
      );
    });
    act(() => opener().dispatchEvent(new FocusEvent("focusin", { bubbles: true })));

    expect(offered()).toEqual(GODS);
  });

  /**
   * Nothing here sets a tab index, which is the only version of the tab-order
   * promise that cannot quietly stop being true — so the list is walked in
   * document order like everything else on the page.
   */
  it("sets no tab index anywhere", () => {
    render(<GodPicker gods={GODS} onPick={() => undefined} />);
    act(() => opener().focus());

    expect(container.querySelectorAll("[tabindex]")).toHaveLength(0);
  });

  /** Every entry is named, because four of the shipped gods have no symbol. */
  it("names each god beside its symbol", () => {
    render(<GodPicker gods={GODS} onPick={() => undefined} />);
    act(() => opener().focus());

    expect(offered()).toEqual(GODS);
    expect(container.querySelectorAll(".godpicker__art")).toHaveLength(GODS.length);
  });

  /**
   * A list that scrolls says so at whichever end has gods past it. Read off the
   * element rather than counted, since what fits is a fact about the box and
   * this component owns no layout — which is also why jsdom has to be told the
   * three numbers it does not compute.
   */
  it("marks the end that has more gods past it", () => {
    render(<GodPicker gods={GODS} onPick={() => undefined} />);
    act(() => opener().focus());
    const list = container.querySelector<HTMLElement>(".godpicker__list")!;

    // jsdom lays nothing out, so every scroll figure is zero and the list looks
    // as though it fits. That is the honest default: no marks.
    expect(list.dataset["more"]).toBe("none");

    Object.defineProperty(list, "clientHeight", { value: 100, configurable: true });
    Object.defineProperty(list, "scrollHeight", { value: 300, configurable: true });
    act(() => list.dispatchEvent(new Event("scroll", { bubbles: true })));
    expect(list.dataset["more"]).toBe("below");

    list.scrollTop = 100;
    act(() => list.dispatchEvent(new Event("scroll", { bubbles: true })));
    expect(list.dataset["more"]).toBe("both");

    list.scrollTop = 200;
    act(() => list.dispatchEvent(new Event("scroll", { bubbles: true })));
    expect(list.dataset["more"]).toBe("above");
  });

  /**
   * Hovering opens it, so a click on the control the pointer is already resting
   * on has to keep it open — toggling would close the thing just reached for.
   * Reported after the first version did exactly that.
   */
  it("stays open when the control it opened from is clicked", () => {
    render(<GodPicker gods={GODS} onPick={() => undefined} />);
    const wrap = container.querySelector(".godpicker")!;

    act(() => wrap.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
    expect(offered()).toEqual(GODS);

    act(() => opener().click());
    expect(offered()).toEqual(GODS);
  });

  /** Without a pointer the same control is the only way in and the only way out. */
  it("still toggles for a click that no hover preceded", () => {
    render(<GodPicker gods={GODS} onPick={() => undefined} />);

    act(() => opener().click());
    expect(offered()).toEqual(GODS);

    act(() => opener().click());
    expect(offered()).toEqual([]);
  });

  /** Under the list: it is what to reach for having read it and wanted none. */
  it("puts Show all after the gods", () => {
    render(<GodPicker gods={GODS} onPick={() => undefined} onPickAll={() => undefined} />);
    act(() => opener().focus());

    const rows = [...container.querySelectorAll(".godpicker__list > li")];
    expect(rows[rows.length - 1]?.textContent).toBe("Show all");
    // A row like the others rather than chrome above them.
    expect(rows[rows.length - 1]?.querySelector(".godpicker__god")).not.toBeNull();
  });

  /** The shortcut past the list, and it is not one where a list is one long. */
  it("offers Show all, and not for a single god", () => {
    const onPickAll = vi.fn();
    render(<GodPicker gods={GODS} onPick={() => undefined} onPickAll={onPickAll} />);
    act(() => opener().focus());

    const all = container.querySelector<HTMLElement>(".godpicker__all");
    expect(all?.textContent).toBe("Show all");
    act(() => all?.click());
    expect(onPickAll).toHaveBeenCalledTimes(1);
    expect(offered()).toEqual([]);

    render(<GodPicker gods={["Hera"]} onPick={() => undefined} onPickAll={onPickAll} />);
    act(() => opener().focus());
    expect(container.querySelector(".godpicker__all")).toBeNull();
  });

  it("offers no Show all where the caller has none to give", () => {
    render(<GodPicker gods={GODS} onPick={() => undefined} />);
    act(() => opener().focus());
    expect(container.querySelector(".godpicker__all")).toBeNull();
  });
});
