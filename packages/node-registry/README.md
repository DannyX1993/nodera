# @nodera/node-registry

Declarative node definitions and the registry that owns them.

- `NodeDefinition` — the reusable type (`vendor.qualified` id, `name`, category,
  `version`, description, `ports`, `properties`, `NodeConnectionPolicy`
  `{ incoming, outgoing }`, `validationRuleIds`, `NodeVisual`). Everything is
  serializable data; renderers, visuals and validation rules are referenced by
  stable id, never embedded as functions or components.
- `NodeRegistry` — `register`, explicit `replace`, `unregister`, `get`,
  `require` (returns a `Result`), `has`, `all`, `byCategory`, `categories` and
  `size`. Registering a used id is a `duplicate-id` conflict, never a silent
  overwrite; unknown ids are an explicit `not-found`.
- `validateNodeDefinition` — extension-level validation of a definition's own
  completeness and consistency (qualified id, name, semver version, port and
  property declarations) as `ValidationIssue[]`.

A definition is not an instance: `Node` in
[`@nodera/graph-model`](../graph-model/README.md) references a definition id.
