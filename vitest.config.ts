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
  },
});
