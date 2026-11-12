// Root flat ESLint config (ESLint 9 + typescript-eslint).
//
// `pnpm lint` runs a single `eslint .` from the repository root. No package has
// its own `lint` script and turbo no longer declares a `lint` task, so one
// invocation lints the whole workspace (packages, plugins, examples, apps and
// the tooling in `scripts/`).
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** Globals available to the plain-JS files of this repository (tooling only). */
const nodeGlobals = {
  process: "readonly",
  console: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  Buffer: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
};

/**
 * Inert definitions for `eslint-plugin-react-hooks`.
 *
 * The plugin is not a dependency of this repository (the lint rollout is
 * limited to ESLint + typescript-eslint), but `packages/react-flow` and
 * `packages/ui-react` already carry `// eslint-disable-next-line
 * react-hooks/exhaustive-deps` directives in their sources. Registering these
 * no-op rules keeps the existing directives resolvable instead of failing hard
 * with "Definition for rule was not found".
 */
const noopRule = { create: () => ({}) };
const inertReactHooksPlugin = {
  rules: { "exhaustive-deps": noopRule, "rules-of-hooks": noopRule },
};

export default tseslint.config(
  {
    ignores: [
      "**/dist/",
      "**/node_modules/",
      "**/.turbo/",
      "**/coverage/",
      "**/*.tsbuildinfo",
      ".codegraph/",
      ".atl/",
      "docs/",
      "**/*.log",
      "**/*.map",
      "pnpm-lock.yaml",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The sources predate ESLint and carry suppressions (including the inert
    // react-hooks ones above) that cannot be verified here; reporting them adds
    // noise without enforcing a rule.
    linterOptions: { reportUnusedDisableDirectives: "off" },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: { globals: nodeGlobals },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": inertReactHooksPlugin },
    rules: {
      // Pre-existing code has unused imports/params in ~40 files and `any` in
      // canvas internals and tests. Both are reported as warnings so the lint
      // run stays green without editing sources; new occurrences stay visible.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
