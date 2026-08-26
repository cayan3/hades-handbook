import { loadGame } from "./packages/catalog/src/data.js";

/**
 * Both games' snapshots, before any test file runs. The app awaits one at its
 * route; a test has no route, and the alternative is an await in the fifty-odd
 * files that reach the shipped catalog one way or another.
 *
 * Imported from the registry module rather than from the package, and that is
 * load-bearing: a setup file warms whatever it touches, so pulling the index in
 * here left `traits.js` evaluated before `traits-merge.test.ts` could mock the
 * overlay under it, and four assertions quietly read the real one.
 *
 * `data.test.ts` asks about the unloaded case against a fresh copy of the
 * module, this file having hidden it here.
 */
await loadGame("hades1");
await loadGame("hades2");
