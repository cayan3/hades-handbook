import { act } from "react";
import { type Root, createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * @vitest-environment jsdom
 *
 * What a cold start reaches for, asked the way the browser asks it.
 *
 * Both tests here exist because the same defect shipped twice in one session
 * and every other gate said it was fine. The build succeeded, bundling not
 * being execution; the suite passed, the runner's setup file loading both games
 * before any test file starts; and the only thing that noticed was opening the
 * page. So these two reset the registry and put the app back in the state a
 * browser is in.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLElement;
let root: Root | null = null;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(() => {
  if (root !== null) act(() => root!.unmount());
  root = null;
  container.remove();
  window.location.hash = "";
});

/**
 * Nothing may read a game's snapshot merely by being imported.
 *
 * The app fetches one game's data at its route and everything under that route
 * reads it synchronously, so a module that builds a per-game table as it loads
 * reaches the data before anything has asked for it — which is a throw on the
 * first line of the app and a blank page.
 *
 * **This test exists because that shipped and every other gate said it was
 * fine.** The build succeeded, because bundling does not execute; the suite
 * passed, because the runner's setup file loads both games before any test file
 * starts; and the defect was in `sync` rather than in `catalog`, so the guard in
 * `data.test.ts` — which imports only the catalog package — could not see it.
 * The one thing that noticed was opening the page.
 *
 * So the question is asked the way the browser asks it: reset the registry and
 * import what the entry actually pulls in.
 */
describe("a cold start", () => {
  it("reads no game's data before the route asks for one", async () => {
    vi.resetModules();

    const catalog = await import("@repo/catalog");
    expect(catalog.isLoaded("hades1")).toBe(false);
    expect(catalog.isLoaded("hades2")).toBe(false);

    // In dependency order, because each of these is a chance to build a table
    // early and the first one that does hides the rest.
    await import("@repo/core");
    await import("@repo/rules-hades1");
    await import("@repo/rules-hades2");
    await import("@repo/sync");
    await import("@repo/ui");
    await import("./app.js");

    expect(catalog.isLoaded("hades1"), "something read Hades I on the way in").toBe(false);
    expect(catalog.isLoaded("hades2"), "something read Hades II on the way in").toBe(false);
  });

  /**
   * Switching games, with only the game being left already loaded.
   *
   * The route prop moves a render before the session hook does, so for one
   * render the hook still holds the previous game's open session while
   * everything under it is keyed on the new one. That cost a frame of the wrong
   * run for as long as both catalogs were always present; once they load per
   * game it throws during render and the page goes blank, which is what a
   * player saw.
   *
   * The rest of the suite cannot reach this: its setup file has both games
   * loaded, so the wrong session renders perfectly well.
   */
  it("switches to a game whose data has not arrived yet", async () => {
    vi.resetModules();
    const catalog = await import("@repo/catalog");
    const sync = await import("@repo/sync");
    const { App } = await import("./app.js");

    await catalog.loadGame("hades2");
    expect(catalog.isLoaded("hades1")).toBe(false);

    window.location.hash = "#/hades2";
    root = createRoot(container);
    const store = sync.createMemoryStore();
    await act(async () => {
      root!.render(<App store={store} presence={null} persistent />);
    });
    expect(container.querySelector(".saves")).not.toBeNull();

    await act(async () => {
      window.location.hash = "#/hades1";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    // The fetch and the session open are two awaits deep, and this is the same
    // promise the app is waiting on rather than a second one.
    await act(async () => {
      await catalog.loadGame("hades1");
    });
    await act(async () => {});

    expect(catalog.isLoaded("hades1")).toBe(true);
    expect(container.querySelector(".app")).not.toBeNull();
    expect(container.textContent).not.toBe("");
  });
});
