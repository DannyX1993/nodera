# @nodera/contracts

The shared, dependency-free vocabulary every Nodera package speaks: identifiers,
results, registry semantics, validation diagnostics and severity.

- `Result<T, E>` with `ok` / `err` — operations return explicit outcomes instead
  of throwing.
- Branded ids — `GraphId`, `NodeId`, `EdgeId`, `PortId`, `ElementId`, built with
  `createGraphId` / `createNodeId` / `createEdgeId` / `createPortId` and guarded
  by `isValidIdShape` (non-empty, no whitespace, never an array index).
- Registry contract — `RegistryEntry`, `DefinitionRegistry`, plus the shared
  `RegistryStore` implementation and the `duplicateIdError` / `notFoundError`
  builders every registry reuses (`RegistryErrorKind` is `duplicate-id` or
  `not-found`, never a silent overwrite).
- Diagnostics — `ValidationIssue` (`code`, `severity`, `message`, optional
  `elementId`, `propertyPath`, `metadata`), `createValidationIssue`,
  `ValidationSeverity` / `VALIDATION_SEVERITIES` / `isValidationSeverity`.
- Versions — `isValidSemver` for the semver strings documents, definitions and
  plugins all use.

It has no runtime dependencies and imports nothing from the rest of the
monorepo, so it sits at the bottom of the dependency graph.
