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
    notice: null,
    dormant: false,
    label: "Storm Lightning — Pending — Zeus, tier 2",
    ...over,
  };
}

function detail(over: Partial<NodeDetail> = {}): NodeDetail {
  return { description: null, needed: [], activation: [], ...over };
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
        onMarkAsHave={noop}
        onSetAsGoal={noop}
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

    const onMarkAsHave = vi.fn();
    render(
      <ActionSheet view={view()} detail={detail()} onClose={noop} onMarkAsHave={onMarkAsHave} />,
    );
    act(() => container.querySelector<HTMLElement>(".sheet__actions button")!.click());
    expect(onMarkAsHave).toHaveBeenCalledWith("ZeusWeaponTrait");
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
