/**
 * @vitest-environment jsdom
 *
 * The picture the Run Overview takes of itself, and the one thing it may never
 * lose on the way out.
 */

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TraitId } from "@repo/core";
import type { FinishedBoon, FinishedRun } from "./finished-run.js";
import { UNAFFILIATED } from "./messages.js";
import type { NodeView } from "./node-view.js";
import { NodePresentation } from "./presentation.js";
import {
  OMIT,
  SLACK,
  paintImages,
  paintStyles,
  pictureClone,
  pictureFrame,
  pictureHeight,
  pictureScale,
  pictureStage,
  pictureStyles,
  pictureSvg,
  sourceUrls,
} from "./run-picture.js";
import { RunOverview } from "./run-overview.js";

/**
 * Only the raster is stubbed. Everything above it is the real module, so the
 * assertions below are about the view's wiring and not about a double.
 */
const taken = vi.hoisted(() => vi.fn());
vi.mock("./run-picture.js", async (actual) => ({
  ...(await actual<typeof import("./run-picture.js")>()),
  takePicture: taken,
}));

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
  vi.restoreAllMocks();
  taken.mockReset();
});

/** A picture as the raster hands one back. */
const PNG = "data:image/png;base64,AAA";

function picture(over: Record<string, unknown> = {}) {
  return {
    png: PNG,
    file: new File([new Uint8Array([1])], "run-overview.png", { type: "image/png" }),
    width: 896,
    height: 1200,
    missing: 0,
    ...over,
  };
}

async function press(label: string): Promise<void> {
  const control = [...container.querySelectorAll("button, a")].find(
    (node) => node.textContent?.includes(label) || node.getAttribute("title") === label,
  );
  if (control === undefined) throw new Error(`no control saying ${label}`);
  await act(async () => (control as HTMLElement).click());
}

function render(node: ReactElement): void {
  act(() =>
    root.render(
      <NodePresentation ladder="real-art" game="hades2">
        {node}
      </NodePresentation>,
    ),
  );
}

function view(name: string): NodeView {
  return {
    trait: name as TraitId,
    name,
    state: "Obtained",
    god: "Poseidon",
    weapon: null,
    aspect: false,
    tier: null,
    iconKey: "official/hades2/Poseidon_01",
    kind: null,
    rarity: "Common",
    rarities: [],
    element: null,
    notice: null,
    dormant: false,
    replaces: null,
    label: `${name} — Obtained — Poseidon`,
  };
}

function boon(name: string): FinishedBoon {
  return {
    view: view(name),
    detail: {
      description: `What ${name} does.`,
      stats: [],
      needed: [],
      rows: [],
      activation: [],
      displaces: null,
    },
    level: 1,
  };
}

function run(over: Partial<FinishedRun> = {}): FinishedRun {
  return {
    held: 2,
    gods: 1,
    goalsMet: 0,
    goals: 0,
    weapon: null,
    elements: [],
    groups: [
      {
        key: "god:Poseidon",
        label: "Poseidon",
        god: "Poseidon",
        weapon: null,
        boons: [boon("Tidal Dash"), boon("Wave Pulse")],
      },
    ],
    ...over,
  };
}

/** The view as it is on screen, which is what the picture is taken of. */
function overview(): HTMLElement {
  render(<RunOverview run={run()} onResume={() => {}} onDelete={() => {}} onSaveSlots={() => {}} />);
  const node = container.querySelector<HTMLElement>(".overview");
  if (node === null) throw new Error("the overview did not render");
  return node;
}

describe("what the picture is taken of", () => {
  /**
   * The one assertion this row exists for. The disclaimer is the product's own
   * and the picture is the only thing here that leaves the site, so it is
   * checked against the thing the raster reads rather than against the page.
   */
  it("carries the disclaimer out of the site with it", () => {
    const page = pictureFrame(pictureClone(overview()), 800);
    const svg = pictureSvg(new XMLSerializer().serializeToString(page), "", 800, 1200);
    expect(svg).toContain(UNAFFILIATED);
  });

  /**
   * The two entrances, compared rather than trusted: the component marks what
   * to leave out and the picture reads the mark, and nothing else would notice
   * a rename on either side.
   */
  it("leaves the controls out and keeps the run in", () => {
    const clone = pictureClone(overview());
    expect(clone.querySelector(".overview__actions")).toBeNull();
    expect(clone.querySelector(".overview__picture")).toBeNull();
    expect(clone.textContent).not.toContain("Delete this run");
    expect(clone.textContent).toContain("Tidal Dash");
    expect(clone.textContent).toContain("Poseidon");
  });

  it("marks every one of those with the attribute the picture looks for", () => {
    const node = overview();
    for (const control of [".overview__actions", ".overview__picture"]) {
      expect(node.querySelector(control)?.hasAttribute(OMIT), control).toBe(true);
    }
  });

  /**
   * The view clips itself to nine tenths of a viewport, and inside the picture
   * a viewport is the picture — so left alone it would crop itself to nine
   * tenths of itself and the footer is what falls off the bottom.
   */
  it("undoes the view's own clipping", () => {
    const clone = pictureClone(overview());
    expect(clone.style.maxHeight).toBe("none");
    expect(clone.style.overflow).toBe("visible");
  });

  it("leaves the view on the page untouched", () => {
    const node = overview();
    pictureClone(node);
    expect(node.querySelector(".overview__actions")).not.toBeNull();
    expect(node.style.maxHeight).toBe("");
  });
});

describe("the room under the last line", () => {
  /**
   * The height is measured in the page and the picture is laid out a second
   * time inside the SVG. A pixel of drift between the two has to eat something,
   * and this is what it eats.
   */
  it("leaves slack below what was measured", () => {
    const clone = document.createElement("div");
    vi.spyOn(clone, "getBoundingClientRect").mockReturnValue({ height: 1200.4 } as DOMRect);
    expect(pictureHeight(clone)).toBe(1201 + SLACK);
    expect(SLACK).toBeGreaterThan(0);
  });

  it("fills that room on the page rather than leaving it transparent", () => {
    const page = pictureFrame(document.createElement("div"), 800);
    expect(page.style.paddingBottom).toBe(`${SLACK}px`);
    expect(page.style.width).toBe("800px");
    // `body`'s own rules cannot reach inside a picture — there is no body in it.
    expect(page.style.background).toContain("--ground");
    expect(page.style.color).toContain("--ink");
    expect(page.style.fontFamily).toContain("--face-body");
  });
});

describe("what the picture embeds", () => {
  const clone = (html: string): HTMLElement => {
    const node = document.createElement("div");
    node.innerHTML = html;
    return node;
  };

  it("names every icon and every face once", () => {
    const node = clone(
      `<img src="/art/official/hades2/a.webp"><img src="/art/official/hades2/a.webp">` +
        `<img src="/art/official/hades2/b.webp">`,
    );
    const css = `@font-face{src:url("/fonts/cinzel.woff2") format("woff2")} a{background:url(/fonts/x.woff2)}`;
    expect(sourceUrls(css, node)).toEqual([
      "/art/official/hades2/a.webp",
      "/art/official/hades2/b.webp",
      "/fonts/cinzel.woff2",
      "/fonts/x.woff2",
    ]);
  });

  it("asks for nothing off this origin, which a picture could not fetch anyway", () => {
    const node = clone(`<img src="https://example.test/a.webp"><img src="data:image/webp;base64,x">`);
    expect(sourceUrls("a{background:url(https://example.test/b.woff2)}", node)).toEqual([]);
  });

  it("swaps each icon for its bytes", () => {
    const node = clone(`<img src="/art/a.webp">`);
    expect(paintImages(node, new Map([["/art/a.webp", "data:image/webp;base64,AAA"]]))).toBe(0);
    expect(node.querySelector("img")?.getAttribute("src")).toBe("data:image/webp;base64,AAA");
  });

  /**
   * A hole rather than a broken-image glyph, and counted: the player is told
   * the picture is short of something instead of finding out by looking.
   */
  it("counts the icons that did not arrive and draws none of them", () => {
    const node = clone(`<img src="/art/a.webp"><img src="/art/b.webp">`);
    expect(paintImages(node, new Map([["/art/a.webp", "data:image/webp;base64,AAA"]]))).toBe(1);
    expect(node.querySelectorAll("img")[1]?.hasAttribute("src")).toBe(false);
  });

  it("rewrites a face it has and leaves one it does not", () => {
    const css = `@font-face{src:url("/fonts/a.woff2")}@font-face{src:url(/fonts/b.woff2)}`;
    const painted = paintStyles(css, new Map([["/fonts/a.woff2", "data:font/woff2;base64,AAA"]]));
    expect(painted).toContain(`url("data:font/woff2;base64,AAA")`);
    expect(painted).toContain("url(/fonts/b.woff2)");
  });

  it("styles the picture from the same sheet the view is styled from", () => {
    const style = document.createElement("style");
    style.textContent = ".overview__tile > span { color: red; }";
    document.head.appendChild(style);
    try {
      expect(pictureStyles(document.styleSheets)).toContain(".overview__tile > span");
    } finally {
      style.remove();
    }
  });
});

describe("the clone while it is being measured", () => {
  /**
   * `aria-hidden` leaves everything in the tab order, and the clone is a second
   * copy of every tile the view draws — a keyboard would otherwise land in a
   * run that is about to be removed from the document.
   */
  it("is inert while it sits in the page", () => {
    const stage = pictureStage(pictureFrame(pictureClone(overview()), 800), 800);
    expect(stage.inert).toBe(true);
    expect(stage.getAttribute("aria-hidden")).toBe("true");
  });

  it("is off-screen at the width it is measured for", () => {
    const stage = pictureStage(document.createElement("div"), 800);
    expect(stage.style.width).toBe("800px");
    expect(stage.style.left).toBe("-10000px");
  });
});

describe("the picture as one document", () => {
  it("is the size it was measured at", () => {
    const svg = pictureSvg("<div/>", "a{color:red}", 896, 2480);
    expect(svg).toContain(`width="896" height="2480"`);
    expect(svg).toContain(`viewBox="0 0 896 2480"`);
  });

  /** A serializer escapes a combinator; a CDATA section does not. */
  it("carries the stylesheet unescaped", () => {
    expect(pictureSvg("<div/>", ".a > .b{color:red}", 10, 10)).toContain(
      "<![CDATA[.a > .b{color:red}]]>",
    );
  });

  /**
   * Loud rather than quiet: a picture that silently lost its styling still
   * looks like a picture, and nothing downstream would notice.
   */
  it("refuses a rule that would close the section early", () => {
    expect(() => pictureSvg("<div/>", "a{content:']]>'}", 10, 10)).toThrow(/CDATA/);
  });

  it("draws at twice the pixel until the bitmap would be too big for a phone", () => {
    expect(pictureScale(896, 1200)).toBe(2);
    expect(pictureScale(896, 12000) * 896 * pictureScale(896, 12000) * 12000).toBeLessThanOrEqual(
      16e6,
    );
    expect(pictureScale(896, 12000)).toBeLessThan(2);
  });
});

describe("taking one from the view", () => {
  it("draws the picture in place of the run rather than over it", async () => {
    taken.mockResolvedValue(picture());
    overview();
    await press("Picture of this run");

    expect(container.querySelectorAll(".sheet-scrim")).toHaveLength(1);
    expect(container.querySelector(".overview__title")?.textContent).toBe("Picture of this run");
    expect(container.querySelector<HTMLImageElement>(".picture__image")?.getAttribute("src")).toBe(
      PNG,
    );
    expect(container.textContent).not.toContain("Delete this run");
  });

  /**
   * Whether a card is open is an artifact of where the pointer happens to be —
   * the card opens on hover — so it is closed before the view is read rather
   * than stripped out of the clone afterwards.
   */
  it("closes an open card before it reads the view", async () => {
    // Copied as the call is made, not read back afterwards: the view handed
    // over is the live node, and by the time an assertion could reach it the
    // picture has already replaced what it was looking at.
    let read: HTMLElement | null = null;
    taken.mockImplementation((view: HTMLElement) => {
      read = view.cloneNode(true) as HTMLElement;
      return Promise.resolve(picture());
    });

    overview();
    await act(async () => container.querySelector<HTMLElement>(".overview__tile")?.click());
    expect(container.querySelector(".overview__detail")).not.toBeNull();

    await press("Picture of this run");
    expect(read).not.toBeNull();
    expect(read!.querySelector(".overview__detail")).toBeNull();
  });

  it("goes back to the run", async () => {
    taken.mockResolvedValue(picture());
    overview();
    await press("Picture of this run");
    await press("Back to the run");
    expect(container.querySelector(".overview__title")?.textContent).toBe("Run Overview");
    expect(container.textContent).toContain("Delete this run");
  });

  /** Said rather than swallowed: a control that did nothing reads as broken. */
  it("says so when the browser could not draw one", async () => {
    taken.mockRejectedValue(new Error("no canvas to draw the picture on"));
    overview();
    await press("Picture of this run");
    expect(container.querySelector(".picture__missing")?.textContent).toContain(
      "could not draw the picture",
    );
    expect(container.querySelector(".picture__image")).toBeNull();
  });

  /**
   * Two things at once, both about the press that is already working. The
   * control says so without going `disabled`, which would drop the keyboard
   * user to the body; and a second press starts nothing, the effect that draws
   * the picture already depending on the flag that press would set again.
   */
  it("refuses a second press without taking the focus away", async () => {
    let settle = (_: unknown) => {};
    taken.mockReturnValue(new Promise((resolve) => (settle = resolve)));
    overview();

    const control = container.querySelector<HTMLElement>(".overview__picture")!;
    control.focus();
    await press("Picture of this run");
    expect(control.getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(control);

    await act(async () => control.click());
    expect(taken).toHaveBeenCalledTimes(1);

    // Any render while one is being drawn, not only another press: without the
    // flag in the effect's dependencies this starts a second capture, drops the
    // first on the floor and reads a view somebody has since clicked in.
    await act(async () => container.querySelector<HTMLElement>(".overview__tile")?.click());
    expect(taken).toHaveBeenCalledTimes(1);

    await act(async () => settle(picture()));
    expect(container.querySelector(".picture__image")).not.toBeNull();
  });

  it("says how many icons the picture is short of", async () => {
    taken.mockResolvedValue(picture({ missing: 3 }));
    overview();
    await press("Picture of this run");
    expect(container.textContent).toContain("3 icons could not be drawn");
  });
});

describe("how the picture reaches the player", () => {
  /**
   * The one control that always exists. `download` on the picture's own data
   * URL: the policy refuses `blob:`, so an object URL would hand over nothing.
   */
  it("offers a save that needs no platform to support it", async () => {
    taken.mockResolvedValue(picture());
    overview();
    await press("Picture of this run");

    const save = container.querySelector<HTMLAnchorElement>(".picture__save");
    expect(save?.getAttribute("href")).toBe(PNG);
    expect(save?.getAttribute("download")).toBe("run-overview.png");
  });

  it("offers a share only where the platform can take a file", async () => {
    taken.mockResolvedValue(picture());
    overview();
    await press("Picture of this run");
    expect(container.textContent).not.toContain("Share this picture");

    act(() => root.unmount());
    root = createRoot(container);
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    try {
      overview();
      await press("Picture of this run");
      expect(container.textContent).toContain("Share this picture");
    } finally {
      Reflect.deleteProperty(navigator, "canShare");
    }
  });
});
