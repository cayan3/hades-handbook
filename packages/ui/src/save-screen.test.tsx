/**
 * @vitest-environment jsdom
 *
 * The save screen: four slots and the row that starts a run. What is tested
 * here is the allocation and the arming, which are the component's own — the
 * app hands it what each slot holds and nothing else.
 */

import type { SaveSlot } from "@repo/sync";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NodePresentation } from "./presentation.js";
import { SaveScreen, type SlotState, type SlotView } from "./save-screen.js";

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

/** Four slots from four words, which is all this component reads. */
function slots(...states: SlotState[]): readonly SlotView[] {
  return states.map((state, at) => ({
    slot: (at + 1) as SaveSlot,
    state,
    summary: state === "empty" || state === "unreadable" ? null : { held: 3, gods: 2, goals: 1 },
  }));
}

function screen(
  states: readonly SlotView[],
  onStart: (slot: SaveSlot) => void = () => {},
  onOpen: (slot: SaveSlot) => void = () => {},
) {
  return <SaveScreen slots={states} onStart={onStart} onOpen={onOpen} onLeave={() => {}} />;
}

function labels(): string[] {
  return [...container.querySelectorAll<HTMLElement>(".saves__slot")].map(
    (el) =>
      el.querySelector(".saves__what")?.textContent ??
      el.querySelector(".saves__empty")?.textContent ??
      "",
  );
}

function press(what: string, at = 0): void {
  const found = [...container.querySelectorAll<HTMLElement>(".saves__take")].filter(
    (button) => button.querySelector(".saves__what")?.textContent === what,
  );
  const button = found[at];
  if (button === undefined) throw new Error(`no "${what}" control`);
  act(() => button.click());
}

describe("the row that starts a run", () => {
  /** Five rows and always five, so nothing a player reaches for can move. */
  it("draws the same shape whatever is stored", () => {
    render(screen(slots("empty", "empty", "empty", "empty")));
    expect(labels()).toHaveLength(5);

    render(screen(slots("open", "saved", "saved", "saved")));
    expect(labels()).toHaveLength(5);
  });

  it("takes the lowest free slot and says which before it is pressed", () => {
    const onStart = vi.fn();
    render(screen(slots("saved", "empty", "empty", "saved"), onStart));

    expect(container.querySelector(".saves__note")?.textContent).toContain("slot 2");
    press("Start a new run");

    expect(onStart).toHaveBeenCalledWith(2);
  });

  /**
   * The rule the run boundary's guard became. A run holding nothing is not a
   * slot, so the door can be walked twice without an empty run piling up in
   * front of the runs somebody kept.
   */
  it("reuses the open slot where the run in it holds nothing", () => {
    const onStart = vi.fn();
    render(screen(slots("saved", "empty", "saved", "saved"), onStart));

    press("Start a new run");

    expect(onStart).toHaveBeenCalledWith(2);
  });
});

/**
 * A run is lost only where the player fills the last slot and names the one to
 * drop — two deliberate presses rather than a confirmation nobody reads.
 */
describe("a screen with every slot taken", () => {
  const full = slots("open", "saved", "saved", "saved");

  it("says the question is coming rather than dropping anything", () => {
    const onStart = vi.fn();
    render(screen(full, onStart));

    expect(container.querySelector(".saves__note")?.textContent).toContain("pick one to replace");
    press("Start a new run");

    expect(onStart).not.toHaveBeenCalled();
    expect(container.querySelector(".saves__title")?.textContent).toBe("Choose a run to replace");
    expect(labels().slice(1).every((label) => label === "Replace this run")).toBe(true);
  });

  it("starts in the slot the player names", () => {
    const onStart = vi.fn();
    render(screen(full, onStart));

    press("Start a new run");
    press("Replace this run", 2);

    expect(onStart).toHaveBeenCalledWith(3);
  });

  it("puts the screen back where the player changes their mind", () => {
    const onStart = vi.fn();
    render(screen(full, onStart));

    press("Start a new run");
    press("Never mind");

    expect(onStart).not.toHaveBeenCalled();
    expect(container.querySelector(".saves__title")?.textContent).toBe(
      "Choose a save slot to begin",
    );
  });

  /** Opening a slot is not what the armed screen is for, and does not happen. */
  it("does not open a slot while it is asking", () => {
    const onOpen = vi.fn();
    render(screen(full, () => {}, onOpen));

    press("Start a new run");
    press("Replace this run", 1);

    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe("the slots themselves", () => {
  it("names the open one Continue run and the rest saved runs", () => {
    render(screen(slots("saved", "open", "empty", "unreadable")));

    expect(labels()).toEqual([
      "Start a new run",
      "Saved run",
      "Continue run",
      "( Empty Save Slot )",
      "Damaged save",
    ]);
  });

  it("numbers every slot, in fixed order", () => {
    render(screen(slots("saved", "open", "empty", "unreadable")));

    expect(
      [...container.querySelectorAll(".saves__ordinal")].map((el) => el.textContent),
    ).toEqual(["Slot 1", "Slot 2", "Slot 3", "Slot 4"]);
  });

  it("opens the slot it was pressed on", () => {
    const onOpen = vi.fn();
    render(screen(slots("saved", "open", "empty", "empty"), () => {}, onOpen));

    press("Saved run");

    expect(onOpen).toHaveBeenCalledWith(1);
  });

  /** The row above allocates, so an empty slot is not a second way to do it. */
  it("draws an empty slot as no control at all", () => {
    render(screen(slots("empty", "empty", "empty", "empty")));

    expect(container.querySelectorAll(".saves__take")).toHaveLength(1);
  });

  it("shows the three counts a filled slot carries", () => {
    render(screen(slots("open", "empty", "empty", "empty")));

    expect([...container.querySelectorAll(".saves__stat dt")].map((el) => el.textContent)).toEqual([
      "Boons",
      "Gods met",
      "Goals",
    ]);
    expect([...container.querySelectorAll(".saves__stat dd")].map((el) => el.textContent)).toEqual([
      "3",
      "2",
      "1",
    ]);
  });

  /**
   * A record this build cannot read keeps its slot rather than reading as free:
   * there is something in it, and it is somebody's run.
   */
  it("says a damaged save can be replaced, and asks before it is", () => {
    const onStart = vi.fn();
    render(screen(slots("open", "saved", "saved", "unreadable"), onStart));

    expect(container.querySelector(".saves__note")?.textContent).toContain("pick one to replace");
    press("Start a new run");
    press("Replace this run", 3);

    expect(onStart).toHaveBeenCalledWith(4);
  });
});
