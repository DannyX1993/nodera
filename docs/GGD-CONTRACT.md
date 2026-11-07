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
| `id` | string | Required. Identifies the graph; must be a valid graph id on import. |
| `name`, `description` | string | Optional descriptive metadata. |
| `tags` | string[] | Optional. |
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
| `type` | string | Optional edge definition id. |
| `source`, `target` | `{ nodeId, portId, direction? }` | Required references, resolved at import time. |
| `label` | string | Optional. |
| `metadata` | object | Optional. |

## Diagnostics

All failures are structural `document.*` codes (`document.invalid-format`, `document.invalid-version`, `document.missing-metadata-id`, `document.missing-graph-nodes`, `document.invalid-node`, `document.invalid-node-version`, `document.invalid-position`, `document.invalid-port`, `document.invalid-extension`, `document.invalid-edge`, `document.invalid-settings`, `document.non-portable-value`, `document.malformed-document`, …) plus text-level `parse.invalid-json` / `parse.invalid-yaml` and `serialize.non-portable-value`. Version moves use `document.unsupported-version` / `document.migration-failed`. Nothing is dropped silently: unknown fields are preserved, and incompatible versions are refused with diagnostics while the source data stays intact.

## API surface (as of this phase)

- `@nodera/document`: `normalizeGraphDocument`, `findDocumentIssues`, `validateGraphDocument`, `graphToDocument`, `documentToGraph`, `documentVersionMigrator`, types (`GraphDocument`, …), `GGD_FORMAT`.
- `@nodera/serialization-json`: `serializeJson`, `parseJsonDocument`.
- `@nodera/serialization-yaml`: `serializeYaml`, `parseYamlDocument`.

Both serializers produce and consume **exactly the same logical model**; they differ only in text format.
