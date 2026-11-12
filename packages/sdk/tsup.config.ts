import { defineConfig } from "tsup";

/**
 * Bundle of `@nodera/sdk` — the framework-free public package.
 *
 * One entry, one `dist/`: the SDK is a single import path for a host, so every
 * core package it composes (contracts, domain, application, document,
 * serialization, registries, validation, history, layout, theme, ui-core) is
 * inlined here. `noExternal` on the `@nodera/` scope is what makes the published
 * tarball self-contained: a consumer installs one package and no workspace
 * package has to be published for it to resolve.
 *
 * React, React DOM and React Flow are `external` on purpose. The SDK never
 * imports them (see `scripts/check-architecture.mjs`, rule
 * `sdk-framework-free`); listing them keeps the bundle honest if that ever
 * changes, and keeps a future engine binding out of the core artifact.
 */
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  // `resolve` is the declaration side of `noExternal`: without it the bundle
  // hoists the core packages' types and the published `.d.ts` would still import
  // `@nodera/*` specifiers a consumer cannot resolve.
  dts: { resolve: true },
  sourcemap: true,
  clean: true,
  noExternal: [/^@nodera\//],
  external: ["react", "react-dom", "@xyflow/react", "react/jsx-runtime"],
});
