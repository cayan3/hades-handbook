import { loadGame } from "./packages/catalog/src/data.js";

/**
 * Both games' snapshots, before any test file runs.
 *
 * The app fetches one game's data at its route and everything under that route
 * reads it synchronously. A test has no route, and forty-odd files reach the
 * shipped catalog one way or another — through `traitsFor`, the asset resolver,
 * `shippedCatalog`, a rules package — so asking each of them to await the right
 * game would be churn in every file to describe a boundary that lives in one.
 *
 * The one thing this hides is the unloaded case, which is exactly what the
 * registry throws for. `data.test.ts` asks about it against a fresh copy of the
 * module rather than against this one.
 *
 * Imported from the registry module rather than from the package, and that is
 * load-bearing: a setup file runs before every test file and warms whatever it
 * touches, so pulling the package index in here left `traits.js` already
 * evaluated by the time `traits-merge.test.ts` mocked the overlay under it, and
 * four assertions quietly read the real one.
 */
await loadGame("hades1");
await loadGame("hades2");
