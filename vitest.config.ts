import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Workspace sources only. `tools/` is a Python leaf (lol), so is never
    // part of the TypeScript workspace (& its tests run under pytest o7).
    // The runner stays on the node environment for the whole workspace. A
    // component test asks for a document with a `@vitest-environment jsdom`
    // docblock at the top of its own file, so the cost lands on the files that
    // need one instead of on all 26 of them.
    include: [
      "packages/*/src/**/*.test.ts",
      "packages/*/src/**/*.test.tsx",
      "apps/*/src/**/*.test.ts",
      "apps/*/src/**/*.test.tsx",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "tools/**"],
    // The runner stubs stylesheets with an empty module by default, to save work
    // no assertion was going to look at. One assertion does: the node ladder's
    // rule is that state is structural and never a colour, kept by a test that
    // reads the stylesheet. With the stub in place that test read an empty
    // string, passed and proved nothing -- which its own "is the ladder in here
    // at all" case caught. Nothing else imports a stylesheet, so this costs the
    // one file that asked for it.
    css: true,
    // 60 s rather than vitest's 5, and for every file rather than one.
    //
    // Quiet, the core property file runs all thirteen clauses in 3.4 s and its
    // deepest in 2.4 s. Under the 50-file parallel run on a loaded machine that
    // clause took 37-38 s, and the failure moves around -- one run took two
    // component tests in apps/web at the default instead. So it is contention
    // for the machine rather than a slow test, and a budget on the one file
    // that showed it first left every other file exposed.
    //
    // A budget rather than fewer runs or a fixed seed: the runs are not what is
    // slow, cutting them costs P4's universal clause the independence of its
    // witness and P9's the only bound on `unsatisfiable` in the suite, and
    // seeding stops fast-check exploring, which is most of what it is for.
    testTimeout: 60_000,
  },
});
