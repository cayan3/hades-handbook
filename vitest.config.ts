import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Workspace sources only. `tools/` is a Python leaf (lol), so is never
    // part of the TypeScript workspace (& its tests run under pytest o7).
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "tools/**"],
  },
});
