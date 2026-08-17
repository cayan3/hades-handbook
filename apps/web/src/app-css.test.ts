import { describe, expect, it } from "vitest";
// The stylesheet as text, the same way the node ladder's own rule is checked:
// this is a fact about painting and the runner does not paint.
import CSS from "./app.css?raw";

/** Every rule's body, comments stripped so prose about a property is not one. */
function bodyOf(selector: string): string {
  const literal = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  return rules.match(new RegExp(`(^|[{}])\\s*${literal}\\s*\\{([^}]*)\\}`, "m"))?.[2] ?? "";
}

function remOf(selector: string): number {
  return Number(/font-size:\s*([\d.]+)rem/.exec(bodyOf(selector))?.[1]);
}

/**
 * The chrome's type scale. Its counterpart in the component library holds the
 * node's, and the two are separate because each file owns the surface it draws.
 */
describe("the page stylesheet", () => {
  /**
   * The other half of the picker pairing. Two controls for one job is only
   * honest while exactly one of them is drawn — `display: none` takes the
   * hidden one out of the tab order and out of the accessibility tree, which a
   * visual trick would not.
   */
  it("hides the platform picker wherever the hovered list is drawn", () => {
    const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const hoverable = rules.match(/@media \(hover: hover\) \{([\s\S]*?)\n\}/);
    expect(hoverable?.[1], "no hover query to hide it in").toMatch(
      /\.app__addgod\s*\{[^}]*display:\s*none/,
    );
  });

  /**
   * The header, the tabs, the notices and the hint were all between 0.75 and
   * 0.85rem, which is 12 to 13.6px at the default root size. Nothing the chrome
   * writes goes below 0.85rem now — the page has no counterpart to the boon
   * name, which is the one thing on the other side that stayed put.
   */
  it("writes nothing below the floor", () => {
    const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const sized = [...rules.matchAll(/([^{}]+)\{([^}]*)\}/g)].flatMap(([, selector, body]) =>
      [...body!.matchAll(/font-size:\s*([\d.]+)rem/g)].map((m) => ({
        selector: selector!.trim().replace(/\s+/g, " "),
        rem: Number(m[1]),
      })),
    );
    expect(sized.length).toBeGreaterThan(5);

    for (const rule of sized) {
      expect(rule.rem, `${rule.selector} is ${rule.rem}rem`).toBeGreaterThanOrEqual(0.85);
    }
  });

  /**
   * Two steps, and the order is what was asked for rather than the numbers: the
   * product's name above the controls that act on the whole run. A God Tab has
   * no size of its own, drawing a symbol and no label.
   */
  it("steps the header's type down from the title", () => {
    const title = remOf(".app__head h1");
    const controls = remOf(".app__goalstoggle,\n.app__finish");

    expect(title).toBeGreaterThan(controls);
    expect(bodyOf(".app__godtab")).not.toMatch(/font-size/);
  });

  /**
   * The two that act on the whole run are one size because they are one kind of
   * thing. Goals had a rule of its own and was a step smaller than the one
   * beside it, which is the sort of drift a shared rule cannot have. The game
   * switch left this rule when it became a pair of marks with their own size.
   */
  it("gives the run-wide controls one rule between them", () => {
    const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    // Found by the selector rather than by the size it happens to carry: the
    // site page's own link is 1.15rem too, and searching on the number found
    // that instead.
    const shared = [...rules.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(
      ([, selector, body]) =>
        /font-size:/.test(body!) && selector!.split(",").some((s) => s.trim() === ".app__finish"),
    );
    const names = (shared?.[1] ?? "").split(",").map((s) => s.trim());
    expect(names.sort()).toEqual([".app__finish", ".app__goalstoggle"]);

    // And none of them carries a second size that would win over it.
    expect(bodyOf(".app__goalstoggle")).not.toMatch(/font-size/);
  });

  /**
   * The marks sit against the product's name rather than at the far end of the
   * header. Nothing may grow between them: a title told to fill the row puts
   * the whole of the rest of the header on the other side of the page, which is
   * where they were for a round.
   */
  it("keeps the game marks beside the title", () => {
    expect(bodyOf(".app__head h1")).not.toMatch(/flex:\s*1/);
    // The end of the header is what pushes right, and it is the only thing that
    // does.
    expect(bodyOf(".app__headend")).toMatch(/margin-left:\s*auto/);
  });

  /** Lit at rest, brighter under the pointer, and never underlined. */
  it("glows the title without being asked to", () => {
    expect(bodyOf(".app__name")).toMatch(/text-shadow:/);
    expect(bodyOf(".app__name")).toMatch(/text-decoration:\s*none/);

    const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const hover = rules.match(/\.app__name:hover,[^{]*\{([^}]*)\}/);
    expect(hover?.[1]).toMatch(/text-shadow:\s*0 0 1\.1rem currentColor/);
    expect(hover?.[1]).not.toMatch(/text-decoration:\s*underline/);
  });

  /**
   * The two ends of a mark have to meet: the numeral's square is the width the
   * revealed half starts at, so the rule leading it lands on that edge rather
   * than near it. Read as text, the runner having no layout to measure.
   */
  it("starts a mark's second half at the square's own edge", () => {
    // The square is sized by one property and nothing else sets a width, so the
    // revealed half begins where the box ends by construction.
    expect(bodyOf(".app__marknum")).toMatch(/width:\s*var\(--mark\)/);
    expect(bodyOf(".app__marknum")).toMatch(/box-sizing:\s*border-box/);
    expect(bodyOf(".app__markmore")).not.toMatch(/margin-left|padding-left/);
  });

  /** A slide nobody asked for is a slide that should not run. */
  it("stops both slides where motion is refused", () => {
    const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const reduced = rules.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/);
    expect(reduced?.[1]).toMatch(/\.app__markmore/);
    expect(reduced?.[1]).toMatch(/\.app__openmore/);
    expect(reduced?.[1]).toMatch(/\.app__name/);
    expect(reduced?.[1]).toMatch(/transition:\s*none/);
    // One block, so there is one place to forget rather than two.
    expect(CSS.match(/@media \(prefers-reduced-motion/g)).toHaveLength(1);
  });

  /**
   * The tabs start where the boons do. Same track sizes as the body's grid, so
   * the two stay aligned by construction rather than by a number kept in step
   * by hand — read as text because the runner has no layout to measure.
   */
  it("gives the god bar the body's own columns", () => {
    const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    const wide = rules.match(/@media \(min-width: 48rem\) \{([\s\S]*?)\n\}/);
    const tracks = [...(wide?.[1] ?? "").matchAll(/grid-template-columns:\s*([^;]+);/g)].map(
      (m) => m[1]!.trim(),
    );
    expect(tracks).toHaveLength(2);
    expect(tracks[0]).toBe(tracks[1]);
    expect(wide?.[1]).toMatch(/\.app__godbar\s*\{[^}]*grid-column:\s*2/);
  });

});
