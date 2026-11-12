# @nodera/edge-registry

Edge definitions: how a connection is presented, kept separate from what the
relation means.

- `EdgeDefinition` — a reusable connection type with a qualified id, name,
  version, `EdgeVisual`, optional `EdgeContextualAction`s, the semantic
  `connectionTypes` it models, allowed source/target node definition ids and a
  custom `conditionId` resolved by validators.
- `EdgeVisual` — renderer hints only: `EdgeLineStyle`
  (`solid`/`dashed`/`dotted`), `EdgeGeometry` (`straight`/`bezier`/`step`/
  `smooth`), `EdgeAnimation` (`none`/`flow`/`dash`/`pulse`), arrows, colour,
  width, state indicator ids and free metadata. None of it is document state.
- `EdgeRegistry` — the standard registry semantics: `duplicate-id` on an id in
  use, `not-found` for an unknown id, explicit `replace`.
- `validateEdgeDefinition` — checks the definition itself (qualified id, name,
  semver version, visual consistency) and returns `ValidationIssue[]`.

The semantics of a connection stay in the edge instance
(`@nodera/graph-model`); this package only describes how an edge type looks.
