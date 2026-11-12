# @nodera/validation

Representation-independent graph validation: structural and domain levels,
normalized issues and a registry of extension validators.

- `ValidationContext` — the graph plus the node, edge and validator registries a
  check runs against; `ValidationLevel` is
  `structural` | `domain` | `document` | `extension`.
- `structuralValidator` — re-checks duplicate node/edge ids, missing nodes,
  unknown definitions, missing ports and inconsistent references from data, so
  imported documents are guarded by the same rules as mutated graphs.
- `domainValidator` — node-type connection policy, port cardinality and type
  compatibility, required properties, per-definition rules and property rules.
  A structurally valid graph can still be misconfigured; the two are reported
  apart.
- `validateGraph(context, { levels })` → `ValidationReport` with `issues`,
  `structurallyValid`, `configurationValid` and `isValid`; it runs
  `BUILT_IN_VALIDATORS` plus every registered `GraphValidator`.
- `ValidatorRegistry` — registers graph-level validators plus the `NodeRule`,
  `ConnectionCondition`, `PropertyCondition` and `PropertyRule` ids that
  definitions reference, with the standard `duplicate-id` / `not-found`
  semantics.

Issues are plain `ValidationIssue` values from `@nodera/contracts`: they say
what is wrong and where, never how to render it.
