/**
 * @vitest-environment jsdom
 *
 * The one file in the workspace that asks for a document. Everything else runs
 * on the node environment, which is why the suite still reports a couple of
 * milliseconds of environment setup rather than a couple of seconds.
 *
 * Throwaway alongside the component it covers, with one exception worth
 * keeping in some form: the escaping test below is about the stack, not about
 * this component.
 */

import type { BoonState } from "@repo/core";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BoonDiamond } from "./boon-diamond.js";

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

const ALL_STATES: readonly BoonState[] = ["Obtained", "Available", "Pending", "Locked", "Impossible"];

describe("BoonDiamond", () => {
  it("renders each of the five states as a distinguishable node", () => {
    render(
      <>
        {ALL_STATES.map((state) => (
          <BoonDiamond key={state} name="Storm Lightning" iconPath="official/Zeus_Attack" state={state} />
        ))}
      </>,
    );

    const rendered = [...container.querySelectorAll<HTMLElement>(".boon-diamond")];
    expect(rendered.map((el) => el.dataset["state"])).toEqual([...ALL_STATES]);
  });

  it("carries its state in the accessible name rather than in colour alone", () => {
    render(<BoonDiamond name="Storm Lightning" iconPath="official/Zeus_Attack" state="Impossible" />);

    const node = container.querySelector(".boon-diamond");
    expect(node?.getAttribute("aria-label")).toBe("Storm Lightning — Impossible");
  });

  it("renders the path the resolver returned, byte for byte", () => {
    // Nothing between the resolver and the `src` attribute may rewrite this —
    // a bundler that fingerprinted or inlined the art would be a bundler that
    // took the withdrawal path away.
    render(<BoonDiamond name="Storm Lightning" iconPath="/art/official/ZeusAttack.png" state="Obtained" />);

    const art = container.querySelector<HTMLImageElement>(".boon-diamond__art");
    expect(art?.getAttribute("src")).toBe("/art/official/ZeusAttack.png");
  });

  it("escapes text it did not author", () => {
    // The two strings this product renders and did not write are extracted
    // game text and the player's own note. Neither is ever markup, and this is
    // the assertion that says so about the framework rather than about a
    // convention somebody has to remember.
    const hostile = '<img src=x onerror="alert(1)">';
    render(<BoonDiamond name={hostile} iconPath="official/_missing" state="Locked" />);

    const label = container.querySelector(".boon-diamond__name");
    expect(label?.textContent).toBe(hostile);
    expect(label?.children).toHaveLength(0);
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });
});
