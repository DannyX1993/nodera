import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Opt-in coverage (`vitest run --coverage`) needs the `@vitest/coverage-v8`
    // provider; plain test runs ignore this block. This file uses `defineConfig`
    // (not `defineProject`) because `coverage` is a root-config option.
    // Thresholds are a conservative per-package floor, never a target.
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/test/**", "src/**/index.ts"],
      thresholds: { lines: 50, functions: 50, branches: 40, statements: 50 },
    },
  },
});
