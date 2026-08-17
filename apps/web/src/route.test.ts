import { describe, expect, it } from "vitest";
import { GAME_HASH, GETTING_STARTED_HASH, routeFor } from "./route.js";

/**
 * The whole of the routing, which is deliberately a handful of comparisons over
 * hashes the product writes itself.
 */
describe("routeFor", () => {
  it("gives each game its own route", () => {
    expect(routeFor(GAME_HASH.hades1)).toEqual({ kind: "game", game: "hades1" });
    expect(routeFor(GAME_HASH.hades2)).toEqual({ kind: "game", game: "hades2" });
  });

  it("gives getting started its own", () => {
    expect(routeFor(GETTING_STARTED_HASH)).toEqual({ kind: "getting-started" });
  });

  /**
   * The bare URL, the empty hash a link home leaves behind, and a hash nothing
   * here wrote — a stale bookmark is better answered by the front page than by
   * an error, the only links in being this app's own.
   */
  it("sends everything else home", () => {
    expect(routeFor("")).toEqual({ kind: "home" });
    expect(routeFor("#/")).toEqual({ kind: "home" });
    expect(routeFor("#/hades3")).toEqual({ kind: "home" });
  });

  /**
   * Snapshots are compared by identity, so a fresh object per read would be an
   * infinite render loop rather than a wasted allocation.
   */
  it("answers with the same object every time", () => {
    expect(routeFor(GAME_HASH.hades2)).toBe(routeFor(GAME_HASH.hades2));
    expect(routeFor("")).toBe(routeFor("#/anything"));
  });
});
