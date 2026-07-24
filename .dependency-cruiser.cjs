/**
 * Import-boundary enforcement for the package layout.
 *
 * npm workspaces give a flat node_modules, so an undeclared cross-package
 * import resolves at runtime instead of failing; this is the exact hole that
 * would let the pure domain package just kinda silently get away w/ importing
 * the catalog and/or components. Therefore, the layering here has to be
 * enforced by lint instead of by the package manager.
 *
 * Dependencies point inward:
 *
 *     catalog -> core
 *     rules-hades1 / rules-hades2 -> catalog, core
 *     sync -> rules-*, catalog, core
 *     ui -> sync, rules-*, catalog, core
 *     apps/web -> anything above
 *
 * The extraction tool under tools/ is a leaf that literally nothing imports.
 */
module.exports = {
  forbidden: [
    {
      name: "core-is-pure",
      severity: "error",
      comment:
        "core imports nothing else in the repo — no IO, no rendering, no clock, " +
        "no game branching. Game-specific logic goes behind the game-rules seam; " +
        "static lookups go in catalog.",
      from: { path: "^packages/core/" },
      to: { path: "^packages/(catalog|rules-hades1|rules-hades2|sync|ui)/|^apps/" },
    },
    {
      name: "catalog-points-inward",
      severity: "error",
      comment: "catalog may depend on core only.",
      from: { path: "^packages/catalog/" },
      to: { path: "^packages/(rules-hades1|rules-hades2|sync|ui)/|^apps/" },
    },
    {
      name: "rules-point-inward",
      severity: "error",
      comment:
        "A game-rules implementation may depend on core and on catalog overlay " +
        "data, never on sync, ui, or an app.",
      from: { path: "^packages/rules-hades[12]/" },
      to: { path: "^packages/(sync|ui)/|^apps/" },
    },
    {
      name: "sync-points-inward",
      severity: "error",
      comment:
        "The run-state port sits below the UI, not beside it — components read " +
        "run state through the port, never the reverse.",
      from: { path: "^packages/sync/" },
      to: { path: "^packages/ui/|^apps/" },
    },
    {
      name: "ui-points-inward",
      severity: "error",
      comment: "Shared components must not depend on a specific app.",
      from: { path: "^packages/ui/" },
      to: { path: "^apps/" },
    },
    {
      name: "data-extract-is-a-leaf",
      severity: "error",
      comment:
        "Nothing imports the extraction tool. A game patch is absorbed by " +
        "re-running it; its output reaches the app as committed JSON under " +
        "packages/catalog/data.",
      from: { path: "^(packages|apps)/" },
      to: { path: "^tools/" },
    },
    {
      name: "no-circular",
      severity: "error",
      comment: "A cycle means the layering above has been broken.",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    // Type-only imports are erased at build time, so without this a boundary
    // violation that imports only a type would be invisible.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(node_modules|dist)/" },
    moduleSystems: ["es6", "cjs"],
  },
};
