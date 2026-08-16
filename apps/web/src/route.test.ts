import { describe, expect, it } from "vitest";
import { ABOUT_HASH, routeFor } from "./route.js";

/**
 * The whole of the routing, which is deliberately one comparison: a hash the
 * product controls, so anything else is the app.
 */
describe("routeFor", () => {
  it("sends the site's own hash to the site page", () => {
    expect(routeFor(ABOUT_HASH)).toBe("about");
  });

  it("sends everything else to the app", () => {
    // The bare URL, the empty hash a link back leaves behind, and a hash
    // somebody else's link put there.
    expect(routeFor("")).toBe("app");
    expect(routeFor("#/")).toBe("app");
    expect(routeFor("#anything-else")).toBe("app");
  });
});
