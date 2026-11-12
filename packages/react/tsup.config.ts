import { defineConfig } from "tsup";

/**
 * Bundle of `@nodera/react` — the React binding of the Nodera framework.
 *
 * One entry, one `dist/`: a React host installs this package plus React and
 * React Flow, and imports everything from `@nodera/react`. `noExternal` on the
 * `@nodera/` scope inlines the framework-free core (`@nodera/sdk`) and the two
 * React packages it composes (`@nodera/react-flow`, `@nodera/ui-react`), so the
 * published tarball is self-contained and the internal packages stay
 * unpublished.
 *
 * The peer dependencies are `external` because the host owns them: one React
 * runtime and one React Flow instance in an application, never a bundled copy.
 * That list is also the binding's whole allowed framework surface
 * (`scripts/check-architecture.mjs`, rule `react-binding-is-the-react-surface`).
 */
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  // `tsconfig.build.json` is the paths-free variant of the package tsconfig:
  // `tsconfig.base.json` maps `@nodera/sdk`/`@nodera/react` to the *unbundled*
  // declaration trees so the workspace keeps one type identity, and esbuild must
  // not follow that mapping while bundling (it would resolve a `.d.ts` as code)
  // or while rolling the declarations up (they must be inlined here).
  tsconfig: "tsconfig.build.json",
  // `resolve` is the declaration side of `noExternal`: the published `.d.ts`
  // must carry the SDK and the two React packages' types instead of importing
  // `@nodera/*` specifiers a consumer cannot resolve. React and React Flow stay
  // external, because the host owns those types.
  dts: { resolve: [/^@nodera\//, /^\.\.?\//] },
  sourcemap: true,
  clean: true,
  noExternal: [/^@nodera\//],
  external: ["react", "react-dom", "@xyflow/react", "react/jsx-runtime"],
});
