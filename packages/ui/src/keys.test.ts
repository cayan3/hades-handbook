/**
 * @vitest-environment jsdom
 *
 * A document, for one reason: the typing guard asks whether the press landed in
 * a field, and "is this an element" has no answer without one.
 */

import { describe, expect, it } from "vitest";
import {
  GOAL_KEY,
  HELP_KEY,
  NEXT_GOD_KEY,
  PREVIOUS_GOD_KEY,
  SHORTCUTS,
  godStep,
  isGoalKey,
  isHelpKey,
  isTyping,
  stepFor,
  stepIndex,
} from "./keys.js";

/**
 * The predicates on their own, with no document near them. Which key means what
 * is the half of this that can be wrong quietly: a binding that fires under a
 * modifier is a page overriding the platform, and nothing on screen says so.
 */

function press(key: string, over: Record<string, unknown> = {}) {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target: null,
    ...over,
  };
}

describe("the goal key", () => {
  it("fires on the key, either case", () => {
    expect(isGoalKey(press(GOAL_KEY))).toBe(true);
    expect(isGoalKey(press("G", { shiftKey: true }))).toBe(true);
  });

  /**
   * Control-G is find-next in every browser and Command-G is the same on a Mac.
   * Taking either would be this page claiming a key it does not own.
   */
  it("leaves the platform's own chords alone", () => {
    for (const modifier of ["ctrlKey", "metaKey", "altKey"]) {
      expect(isGoalKey(press(GOAL_KEY, { [modifier]: true }))).toBe(false);
    }
  });

  it("does not swallow a letter somebody is typing", () => {
    const field = document.createElement("input");
    expect(isGoalKey(press(GOAL_KEY, { target: field }))).toBe(false);
  });
});

describe("the arrows", () => {
  it("reads the four arrows and both ends", () => {
    expect(stepFor(press("ArrowUp"))).toBe("up");
    expect(stepFor(press("ArrowDown"))).toBe("down");
    expect(stepFor(press("ArrowLeft"))).toBe("left");
    expect(stepFor(press("ArrowRight"))).toBe("right");
    expect(stepFor(press("Home"))).toBe("first");
    expect(stepFor(press("End"))).toBe("last");
    expect(stepFor(press("a"))).toBeNull();
  });

  /**
   * Alt-Left is the browser's history and Command-Left is the start of a line.
   * Both are the platform's and neither belongs to a graph.
   */
  it("leaves a modified arrow to the platform", () => {
    expect(stepFor(press("ArrowLeft", { altKey: true }))).toBeNull();
    expect(stepFor(press("ArrowLeft", { metaKey: true }))).toBeNull();
  });

  it("clamps a list at both ends rather than wrapping", () => {
    expect(stepIndex(0, "left", 4)).toBe(0);
    expect(stepIndex(3, "right", 4)).toBe(3);
    expect(stepIndex(1, "right", 4)).toBe(2);
    expect(stepIndex(2, "first", 4)).toBe(0);
    expect(stepIndex(2, "last", 4)).toBe(3);
  });
});

describe("the page-wide keys", () => {
  it("steps the gods on the brackets", () => {
    expect(godStep(press(PREVIOUS_GOD_KEY))).toBe(-1);
    expect(godStep(press(NEXT_GOD_KEY))).toBe(1);
    expect(godStep(press("["))).toBe(-1);
    expect(godStep(press("x"))).toBeNull();
  });

  /**
   * These listen on the document, so they hear every press in the app — a search
   * box that cannot type a bracket would be this binding's fault and nothing on
   * screen would say why.
   */
  it("keeps out of a field somebody is typing in", () => {
    const field = document.createElement("textarea");
    expect(godStep(press(NEXT_GOD_KEY, { target: field }))).toBeNull();
    expect(isHelpKey(press(HELP_KEY, { target: field }))).toBe(false);
  });

  it("opens the list on the key it is typed with", () => {
    // Shift is how `?` is reached on most layouts, so it cannot disqualify it —
    // the other three modifiers still do.
    expect(isHelpKey(press(HELP_KEY, { shiftKey: true }))).toBe(true);
    expect(isHelpKey(press(HELP_KEY, { ctrlKey: true }))).toBe(false);
  });
});

describe("what counts as typing", () => {
  it("names the three fields and anything editable", () => {
    for (const tag of ["input", "textarea", "select"]) {
      expect(isTyping(document.createElement(tag))).toBe(true);
    }
    // The attribute rather than the property: measured, the runner's
    // `contentEditable` setter reflects nothing — the attribute stays null and
    // `isContentEditable` is `undefined` — so setting the property here would
    // assert against an element that is not editable at all.
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    expect(isTyping(editable)).toBe(true);
    editable.setAttribute("contenteditable", "false");
    expect(isTyping(editable)).toBe(false);
    expect(isTyping(document.createElement("button"))).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
});

describe("the written-out set", () => {
  /**
   * The list is the only place the bindings are stated, so a key that works and
   * is not in it is a key nobody can find. The two that are constants are read
   * from them; this checks the reading happened.
   */
  it("names every key the predicates answer to", () => {
    const keys = SHORTCUTS.flatMap((shortcut) => shortcut.keys);
    for (const key of [GOAL_KEY, HELP_KEY, PREVIOUS_GOD_KEY, NEXT_GOD_KEY]) {
      expect(keys).toContain(key);
    }
    expect(SHORTCUTS.every((shortcut) => shortcut.what.endsWith("."))).toBe(true);
  });
});
