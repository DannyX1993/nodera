# Generic Graph Document (GGD) — implemented contract, version 1.0.0

This document describes the portable document format **as implemented** by `@nodera/document` and the `@nodera/serialization-json` / `@nodera/serialization-yaml` packages. The conceptual proposal lives in `FASE2-DEFINITION.md`; this is the concrete contract that code, validation and round-trip tests pin down.

## Top level

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `format` | literal `"ggd"` | yes | Format marker. Any other value is rejected. |
| `version` | semver string | yes | Version of the document **format** itself, not of definitions. |
| `metadata` | object | yes | See below. |
| `extensions` | array | no (defaults `[]`) | References only: `{ id, version }` with semver version. Never executable. |
| Unknown top-level fields | any | — | Preserved verbatim through parse/serialize round-trips. |

## `metadata`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Required, must be a valid graph id on import; uniqueness is enforced at import (duplicates are diagnostics, not exceptions). |
| `name`, `description` | string | Optional; type-checked on import (strings). |
| `tags` | string[] | Optional; type-checked on import (array of strings). |
| `extra` | object | Domain metadata carried separately so vendor fields never collide with it. |
| Unknown fields | any | Preserved verbatim. |

## `graph`

| Field | Type | Notes |
| --- | --- | --- |
| `nodes` | array | Required; the graph's node instances. |
| `edges` | array | Optional; defaults `[]`. |
| `groups` | array | Optional; defaults `[]`. Groups have no domain model yet: they are preserved verbatim. |
| `settings` | object | Optional. `{ selfLoops, multiEdges, cycles }`, each `"allow" \| "forbid"`. Explicit so structural rules survive round-trips; import defaults to `"allow"` when absent. |
| Unknown fields | any | Preserved verbatim. |

## Node instances (`graph.nodes[]`)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Required, unique. |
| `type` | string | Required. References the node **definition** id (`Node.definitionId`). |
| `version` | semver string | Optional. Version of the definition this instance was created against. |
| `position` | `{ x, y }` | Optional, numeric, presentation data. |
| `properties` | object | Optional; values must be JSON-serializable data. |
| `metadata` | object | Optional instance metadata. |
| `ports` | array | Optional. Each entry: `{ id, direction, declarationId? }` with `direction` one of `input`, `output`, `bidirectional`. Instances never embed the definition. |
| Unknown fields | any | Preserved verbatim. |

## Edge instances (`graph.edges[]`)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Required, unique. |
| `type` | string | Optional edge definition id (string when present). |
| `source`, `target` | `{ nodeId, portId, direction? }` | Required references, resolved at import time; `direction` may only be `input`, `output` or `bidirectional`. |
| `label` | string | Optional (string when present). |
| `metadata` | object | Optional; values must be JSON-serializable data (validated). |

## Carried document data (graph-boundary preservation)

The domain `Graph` cannot represent every document-level structure. To keep the document↔domain boundary lossless, `@nodera/document` provides an explicit side channel:

- `extractCarriedDocumentData(document)` captures what the domain cannot model: `extensions`, `graph.groups` and the document `version`.
- `documentToGraph(document)` builds the domain graph.
- `graphToDocument(graph, { carried })` re-emits the captured data verbatim (an explicit `formatVersion` option takes precedence over `carried.formatVersion`).

Arbitrary unknown vendor fields (document-, node- or metadata-level) are preserved by the document layer itself and are intentionally not replicated into the domain graph: the carried channel covers contract-declared structures, not arbitrary extensions.

## Diagnostics

Text and serialization level: `parse.invalid-json`, `parse.invalid-yaml`, `serialize.non-portable-value`.

Structural document level: `document.malformed-document`, `document.invalid-format`, `document.invalid-version`, `document.missing-metadata-id`, `document.invalid-metadata`, `document.invalid-metadata-extra`, `document.invalid-extensions`, `document.invalid-extension`, `document.missing-graph-nodes`, `document.invalid-settings`, `document.invalid-node`, `document.invalid-node-version`, `document.invalid-node-id`, `document.invalid-node-properties`, `document.invalid-node-metadata`, `document.invalid-position`, `document.invalid-ports`, `document.invalid-port`, `document.non-portable-value` (also covers edge metadata), `document.invalid-edges`, `document.invalid-edge`, `document.invalid-edge-metadata`, `document.invalid-endpoint-direction`, `document.invalid-groups`, `document.invalid-group`.

Import level (`documentToGraph`): `document.duplicate-node-id`, `document.duplicate-edge-id`, `document.duplicate-port-id`, `document.edge-references-unknown-node`, `document.edge-references-unknown-port`, plus the graph-policy refusals `document.self-loop-forbidden`, `document.multi-edge-forbidden`, `document.cycle-forbidden` when settings forbid them.

Versioning level: `document.unsupported-version`, `document.migration-failed`. Nothing is dropped silently: unknown fields are preserved, and incompatible versions are refused with diagnostics while the source data stays intact. Uniqueness of node/edge ids is enforced at import time (duplicate ids are diagnostics, never exceptions); conflicting migration tables (two migrations from one version, or a migration that does not change the version) are programming errors rejected when the migrator is built.

## API surface (as of this phase)

- `@nodera/document`: `normalizeGraphDocument`, `findDocumentIssues`, `validateGraphDocument`, `graphToDocument`, `documentToGraph`, `documentVersionMigrator`, types (`GraphDocument`, …), `GGD_FORMAT`.
- `@nodera/serialization-json`: `serializeJson`, `parseJsonDocument`.
- `@nodera/serialization-yaml`: `serializeYaml`, `parseYamlDocument`.

Both serializers produce and consume **exactly the same logical model**; they differ only in text format.
