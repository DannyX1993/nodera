# `@nodera/testing`

Reserved placeholder for shared test fixtures, fakes and harnesses.

This package is intentionally empty, `private`, and not published. When the
framework needs cross-package test doubles (fake registries, document fixtures,
builder helpers), they will live here and be consumed by the packages' test
suites. Until then, every package keeps its own colocated `src/**/*.test.ts`
suites and its own `vitest.config.ts`.

The four `packages/core`, `packages/testing`, `packages/adapter-storage-local`
and `packages/adapter-storage-http` packages are also placeholders with no
source and no test script; they remain `private` (see `odd/tasks/fase8-production-readiness.md`,
D3 and D11).
