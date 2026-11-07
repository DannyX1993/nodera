# Fase 2 — Document Foundation

**Branch:** feature/fase2-document-foundation (from feature/fase1-domain-foundation)
**Scope:** only Phase 2 of docs/ROADMAP.md. No Phase 3+ work.

## Specs

Quotes are verbatim from the user's request and the referenced docs.

- S1: "La definición de modulos de esta fase está en @docs/FASE2-DEFINITION.md" — implement responsibilities: Serialización, Deserialización, Validación, Versionado, Migraciones, Importación, Exportación, Normalización, Gestión de extensiones desconocidas (docs/FASE2-DEFINITION.md responsibilities list).
- S2: "debes respetar la arquitectura global presente en @docs/GLOBAL-ARCHITECTURE.md" — serialization belongs to Infrastructure Adapters; the portable document contract must not know React, React Flow, DOM, hooks, class instances, functions (docs/FASE2-DEFINITION.md "El documento exportado no debe contener").
- S3: "Recuerda que debes usar TDD estricto" — one RED test per rule before implementing; round-trip as the core verification.
- S4: "reutilizar todo lo que sea necesario con tal de no hacer reimplementaciones (DRY)" — reuse contracts/validation from phase 1: ValidationIssue, ValidationReport, Result/ok/err, Node/Edge/Port/Graph entities, existing registries; JSON and YAML must share one parse-to-entity pipeline and differ only in text format.
- S5: GGD canonical format follows the structural example in docs/FASE2-DEFINITION.md: top-level `format` ("ggd"), `version`, `metadata` (with `id`), `extensions` (id+version references, never executable), `graph.nodes` with `id`, `type` (= Node.definitionId), `version`, `position`, `properties`, `metadata`; `graph.edges`; `graph.groups`. The contract "es orientativo y deberá evolucionar mediante una especificación formal": consumer-facing names keep the example (`type`, `metadata.id`); domain names keep `definitionId`.
- S6: "Resultado: el core puede generar documentos portables y reconstruir grafos a partir de ellos" — export a domain Graph to a GraphDocument and rebuild an equivalent Graph from it (round-trip preserves meaning; positions, ports (instance shape with declarationId), properties, metadata, edge labels/connection definitions).
- S7: Unknown Node Preservation — unknown extension references, unknown properties values, unknown groups, and unknown fields must be preserved through a round-trip, not dropped silently (docs/ROADMAP.md Fase 2; AGENTS.md §6). Where the domain cannot represent an element (e.g. groups, no grouping model in phase 1), the document layer preserves it verbatim.
- S8: Document validation is a fourth level: add `document` to ValidationLevel and `document.*` code namespace; distinguish structural document validity from semantic/configuration validity; incompatible versions produce explicit diagnostics, never silent rewriting or dropping (AGENTS.md §6, §13).
- S9: Versioning distinguishes document-format version from node-definition versions present in instances (AGENTS.md §6); migrations between format versions are explicit and registered; unknown/future format versions fail with a clear diagnostic and preserve the data.
- S10: Import/Export are public, framework-agnostic functions: serialize/parse produce either a document or structured diagnostics (Result convention), never throw for data problems.
- S11: No serializable document field may hold functions, class instances, DOM or React references (validated by tests mirroring AGENTS.md §14 checks).
- S12: New packages must match the existing workspace conventions (type module, tsc --noEmit build/typecheck, vitest run --passWithNoTests, colocated src/*.test.ts) per explorer evidence of packages/graph-model/package.json.

## Non-goals

- Persistence adapters, plugin loading, execution, UI (Phases 3+).
- Adding group semantics to the domain model.
- Changing phase-1 public contracts incompatibly.

## Tasks

| ID | Specs | Route | Commit |
| --- | --- | --- | --- |
| T1 | S5,S11,S12,S3,S4 | inline RED→GREEN `packages/document` GGD types + unknown-field preservation | f2-a |
| T2 | S6,S7,S3,S4 | inline RED→GREEN graph↔document mapping + round-trip | f2-a |
| T3 | S10,S3,S4 | writer `packages/serialization-json` | f2-b |
| T4 | S10,S3,S4 | writer `packages/serialization-yaml` (new `yaml` dep; DRY justification: no hand-written YAML parser) | f2-b |
| T5 | S8,S3,S4 | writer document validation (document level + codes, reuses ValidationIssue/Report/Result) | f2-c |
| T6 | S9,S8,S3 | writer versioning + explicit migration registry/pipeline | f2-c |
| T7 | S7,S6,S3,S4 | inline end-to-end unknown preservation round-trip tests | f2-d |
| T8 | S6,S10 | inline examples/phase2-demo + docs + affected typecheck/lint/test/build | f2-d |

## Log

- L1 (verbatim): "Vamos a hacer ahora solo la Fase 2 especificada en @docs/ROADMAP.md . La definición de modulos de esta fase está en @docs/FASE2-DEFINITION.md y debes respetar la arquitectura global presente en @docs/GLOBAL-ARCHITECTURE.md. Además debes tener en cuenta lo que se ha hecho en la fase 1 definida en el documento @docs/FASE1-DEFINITION.md . Recuerda que debes usar TDD estricto."
- L1b (verbatim): "Recuerda tambien que debes reutilizar todo lo que sea necesario con tal de no hacer reimplementaciones (DRY)"
- L2: Explorer evidence mw5q143b-2-etcd — frictions adopted: `type` in document ↔ `Node.definitionId`; `metadata.id` ↔ `Graph.id`; PortInstance docs keep `{id, direction, declarationId?}`; groups preserved verbatim (no domain model yet); `ValidationLevel` gains `document`; `yaml` dependency added to serialization-yaml only.

## Verification

- Per-task: vitest RED→GREEN in-package.
- Final: `pnpm turbo run typecheck lint test build` for affected packages; round-trip and unknown-preservation tests as acceptance.

## Coverage

(to fill per S# at close)

## Commits

(to fill)
