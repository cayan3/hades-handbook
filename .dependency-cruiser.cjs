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
      name: "framework-stays-above-the-port",
      severity: "error",
      comment:
        "Only the components package and the app may import the rendering " +
        "framework. The rules above say which repo packages may import which; " +
        "this one says the same thing about the one external dependency that " +
        "would otherwise let rendering leak downward, since a flat " +
        "node_modules makes react resolve just as happily from the domain " +
        "package as from a component.",
      from: {
        path: "^packages/(core|catalog|rules-hades1|rules-hades2|sync)/",
      },
      to: { path: "(^|/)node_modules/react(-dom)?/" },
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
    // Installed packages stay in the graph as leaves: followed no further, but
    // still visible as the target of an import. Excluding them outright — which
    // is the obvious setting and was the one here — drops the edge as well, and
    // a rule written about an installed package then matches nothing and
    // reports success. Measured: with node_modules excluded, a react import
    // added to the domain package produced no violation and did not move the
    // module count either.
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)dist/" },
    moduleSystems: ["es6", "cjs"],
  },
};
