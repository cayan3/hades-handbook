import { describe, expect, it } from "vitest";
// The stylesheet as text, the same way the node ladder's own rule is checked:
// this is a fact about painting and the runner does not paint.
import CSS from "./app.css?raw";

/**
 * The chrome's type scale. Its counterpart in the component library holds the
 * node's, and the two are separate because each file owns the surface it draws.
 */
describe("the page stylesheet", () => {
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
});
