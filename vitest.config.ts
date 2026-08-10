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
  },
});
