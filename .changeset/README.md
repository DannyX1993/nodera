# Changesets

Every PR that changes a published package adds a changeset (`pnpm changeset`), which records the
package, the bump (`patch`/`minor`/`major`) and a CHANGELOG entry. `pnpm run version` applies the
pending changesets to the workspace versions and CHANGELOGs; it never publishes. Publishing is a
single human-run step (`pnpm release`) that requires npm credentials — CI only verifies the build
(typecheck, test, lint, architecture) and never publishes (see `odd/tasks/fase8-production-readiness.md`, S4).
