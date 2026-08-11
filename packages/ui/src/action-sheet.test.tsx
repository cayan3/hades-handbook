/**
 * @vitest-environment jsdom
 *
 * The detail surface, mostly its focus behaviour, which is the half that cannot
 * be checked by looking at it.
 */

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionSheet } from "./action-sheet.js";
import { OVERRIDDEN_LABEL, PURGE_LABEL, REMOVE_LABEL } from "./messages.js";
import type { NodeDetail, NodeView } from "./node-view.js";

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
    state: "Pending",
    god: "Zeus",
    tier: 2,
    iconKey: "official/Zeus_01",
    rarity: null,
    rarities: [],
    notice: null,
    dormant: false,
    label: "Storm Lightning — Pending — Zeus",
    ...over,
  };
}

function detail(over: Partial<NodeDetail> = {}): NodeDetail {
  return { description: null, needed: [], rows: [], activation: [], displaces: null, ...over };
}

const noop = () => {};

function press(key: string, shiftKey = false): void {
  act(() => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key, shiftKey, bubbles: true }),
    );
  });
}

describe("ActionSheet", () => {
  it("is a modal dialog with a name", () => {
    render(<ActionSheet view={view()} detail={detail()} onClose={noop} />);
    const dialog = container.querySelector("[role='dialog']")!;
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const title = document.getElementById(dialog.getAttribute("aria-labelledby")!);
    expect(title?.textContent).toBe("Storm Lightning");
  });

  it("takes focus on open and gives it back on close", () => {
    // Without the second half, closing the sheet drops a keyboard user at the
    // top of the document, having lost the node they were reading about.
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();

    render(<ActionSheet view={view()} detail={detail()} onClose={noop} />);
    expect(document.activeElement).toBe(container.querySelector(".sheet__close"));

    act(() => root.render(<></>));
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("keeps the keyboard inside itself while it is open", () => {
    render(
      <ActionSheet
        view={view()}
        detail={detail()}
        onClose={noop}
        actions={{ mark: noop, pin: noop }}
      />,
    );
    const stops = [...container.querySelectorAll("button")];
    expect(stops.length).toBeGreaterThan(2);

    const first = stops[0]!;
    const last = stops[stops.length - 1]!;

    expect(document.activeElement).toBe(first);
    press("Tab", true);
    expect(document.activeElement).toBe(last);
    press("Tab");
    expect(document.activeElement).toBe(first);
  });

  it("closes on Escape and on the close control", () => {
    const onClose = vi.fn();
    render(<ActionSheet view={view()} detail={detail()} onClose={onClose} />);

    press("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => container.querySelector<HTMLElement>(".sheet__close")!.click());
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("still closes on Escape when focus is not inside it", () => {
    // The exception matters more than the rule: a tap on the shade, or a window
    // that lost focus and came back to the body, leaves the key everybody tries
    // pressed at something that is not the sheet. Found in a browser, where the
    // sheet sat there and would not close.
    const onClose = vi.fn();
    render(<ActionSheet view={view()} detail={detail()} onClose={onClose} />);

    act(() => (document.activeElement as HTMLElement | null)?.blur());
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a tap on the shade, and not on a tap inside itself", () => {
    const onClose = vi.fn();
    render(<ActionSheet view={view()} detail={detail()} onClose={onClose} />);

    act(() => container.querySelector<HTMLElement>(".sheet__title")!.click());
    expect(onClose).not.toHaveBeenCalled();

    act(() => container.querySelector<HTMLElement>(".sheet-scrim")!.click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the required copy word for word, with the keepsake beside it", () => {
    render(
      <ActionSheet
        view={view({
          state: "Impossible",
          notice: {
            lead: "Impossible for now.",
            body: "Equip this god's keepsake next region to invite them to your pool.",
            keepsake: "Conch Shell",
          },
        })}
        detail={detail()}
        onClose={noop}
      />,
    );

    const notice = container.querySelector(".sheet__notice")!;
    expect(notice.textContent).toContain(
      "Impossible for now. Equip this god's keepsake next region to invite them to your pool.",
    );
    // Emphasis is markup around the sentence, never a rewrite of it.
    expect(notice.querySelector("strong")?.textContent).toBe("Impossible for now.");
    expect(notice.querySelector(".sheet__keepsake")?.textContent).toContain("Conch Shell");
  });

  it("names the shortfall for a boon that is owned and doing nothing", () => {
    render(
      <ActionSheet
        view={view({ state: "Obtained", dormant: true })}
        detail={detail({ activation: ["needs 3 Fire — you have 2"] })}
        onClose={noop}
      />,
    );
    expect(container.querySelector(".sheet__activation")?.textContent).toContain(
      "needs 3 Fire — you have 2",
    );
  });

  it("lists what is still needed", () => {
    render(
      <ActionSheet
        view={view()}
        detail={detail({ needed: ["any boon from Zeus", "2 more Water"] })}
        onClose={noop}
      />,
    );
    const lines = [...container.querySelectorAll(".sheet__needed li")].map((el) => el.textContent);
    expect(lines).toEqual(["any boon from Zeus", "2 more Water"]);
  });

  it("offers no action nothing can perform", () => {
    // Both write run state, which needs a source this package deliberately does
    // not have. A control that looked live and did nothing is worse than none.
    render(<ActionSheet view={view()} detail={detail()} onClose={noop} />);
    expect(container.querySelector(".sheet__actions")).toBeNull();

    const mark = vi.fn();
    render(<ActionSheet view={view()} detail={detail()} onClose={noop} actions={{ mark }} />);
    act(() => container.querySelector<HTMLElement>(".sheet__actions button")!.click());
    expect(mark).toHaveBeenCalledWith("ZeusWeaponTrait", null);
  });

  it("renders description text and a player's own words as text", () => {
    const hostile = '<b onmouseover="alert(1)">note</b>';
    render(<ActionSheet view={view()} detail={detail({ description: hostile })} onClose={noop} />);
    const description = container.querySelector(".sheet__description")!;
    expect(description.textContent).toBe(hostile);
    expect(description.children).toHaveLength(0);
  });

  it("shows a rarity only when the derivation gave it one", () => {
    render(<ActionSheet view={view()} detail={detail()} onClose={noop} />);
    expect(container.querySelector(".sheet__rarity")).toBeNull();

    render(<ActionSheet view={view({ rarity: "Epic" })} detail={detail()} onClose={noop} />);
    expect(container.querySelector(".sheet__rarity")?.textContent).toContain("Epic");
  });
});

describe("the write path", () => {
  function actionButtons(): HTMLElement[] {
    return [...container.querySelectorAll<HTMLElement>(".sheet__actions button")];
  }

  /**
   * Asking the rarity by *being* the rarity. The marking gesture has to stay
   * instant, so a dialog in front of it would be the wrong trade — but where
   * the record declares rarities the choice can be the tap itself, which is
   * what stops the run storing a value nobody observed.
   */
  it("asks the rarity where the record declares any, and not where it does not", () => {
    const mark = vi.fn();
    render(
      <ActionSheet
        view={view({ state: "Available", rarities: ["Common", "Rare", "Epic"] })}
        detail={detail()}
        onClose={noop}
        actions={{ mark }}
      />,
    );
    const offered = actionButtons().map((button) => button.textContent);
    expect(offered).toEqual(["Common", "Rare", "Epic"]);

    act(() => actionButtons()[1]!.click());
    expect(mark).toHaveBeenCalledWith("ZeusWeaponTrait", "Rare");

    render(
      <ActionSheet
        view={view({ state: "Available", rarities: [] })}
        detail={detail()}
        onClose={noop}
        actions={{ mark }}
      />,
    );
    expect(actionButtons().map((button) => button.textContent)).toEqual(["Mark as have"]);
    act(() => actionButtons()[0]!.click());
    expect(mark).toHaveBeenLastCalledWith("ZeusWeaponTrait", null);
  });

  /**
   * Two removals, not one. A mis-tap never happened, so the god goes back out
   * of the pool if nothing else holds them; a boon lost in game was really
   * taken, so the god stays. One control would have to pick one silently.
   */
  it("offers the two removals separately for a boon the run holds", () => {
    const remove = vi.fn();
    const purge = vi.fn();
    render(
      <ActionSheet
        view={view({ state: "Obtained" })}
        detail={detail()}
        onClose={noop}
        actions={{ mark: noop, remove, purge }}
      />,
    );

    const labels = actionButtons().map((button) => button.textContent);
    expect(labels).toEqual([REMOVE_LABEL, PURGE_LABEL]);
    act(() => actionButtons()[0]!.click());
    act(() => actionButtons()[1]!.click());
    expect(remove).toHaveBeenCalledWith("ZeusWeaponTrait");
    expect(purge).toHaveBeenCalledWith("ZeusWeaponTrait");
  });

  it("offers no mark for a boon already held, and no removal for one that is not", () => {
    render(
      <ActionSheet
        view={view({ state: "Obtained", rarities: ["Common"] })}
        detail={detail()}
        onClose={noop}
        actions={{ mark: noop }}
      />,
    );
    expect(actionButtons()).toHaveLength(0);

    render(
      <ActionSheet
        view={view({ state: "Locked" })}
        detail={detail()}
        onClose={noop}
        actions={{ remove: noop, purge: noop }}
      />,
    );
    expect(actionButtons()).toHaveLength(0);
  });

  it("says what a mark would replace, and which goal wanted it", () => {
    render(
      <ActionSheet
        view={view({ state: "Available" })}
        detail={detail({
          displaces: { trait: "ZeusAttack", name: "Heaven Strike", neededBy: ["Lightning Rod"] },
        })}
        onClose={noop}
        actions={{ mark: noop }}
      />,
    );
    const said = container.querySelector(".sheet__displaces")!.textContent ?? "";
    expect(said).toContain("Taking this replaces Heaven Strike.");
    expect(said).toContain("Heaven Strike is a prerequisite of Lightning Rod.");
  });

  it("marks a hand-held field as such and offers it back", () => {
    const clearOverride = vi.fn();
    render(
      <ActionSheet
        view={view({ state: "Obtained" })}
        detail={detail()}
        overridden
        onClose={noop}
        actions={{ clearOverride }}
      />,
    );
    expect(container.querySelector(".sheet__overridden")?.textContent).toContain(OVERRIDDEN_LABEL);

    act(() => container.querySelector<HTMLElement>(".sheet__handback")!.click());
    expect(clearOverride).toHaveBeenCalledWith("ZeusWeaponTrait");
  });

  it("toggles the goal control on whether it is already pinned", () => {
    const pin = vi.fn();
    const unpin = vi.fn();
    render(
      <ActionSheet view={view()} detail={detail()} onClose={noop} actions={{ pin, unpin }} />,
    );
    expect(actionButtons().map((button) => button.textContent)).toEqual(["Set as goal"]);

    render(
      <ActionSheet view={view()} detail={detail()} pinned onClose={noop} actions={{ pin, unpin }} />,
    );
    expect(actionButtons().map((button) => button.textContent)).toEqual(["Remove goal"]);
  });
});
