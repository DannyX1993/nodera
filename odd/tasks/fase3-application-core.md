# Fase 3 — Application Core

**Branch:** feature/fase3-application-core (from master)
**Scope:** only Phase 3 of docs/ROADMAP.md (Use Cases, Commands, Events, History, Undo/Redo, Selection Model, Clipboard, Validation Pipeline). No Phase 4+ work (no React, no canvas).

## Specs

Quotes are verbatim from the user's request and the referenced docs.

- S1: "Vamos a hacer ahora solo la Fase 3 especificada en @docs/ROADMAP.md" — scope is exactly: "Use Cases, Commands, Events, History, Undo/Redo, Selection Model, Clipboard, Validation Pipeline"; result "motor de edición independiente del framework visual" (docs/ROADMAP.md Fase 3).
- S2: Application use cases per docs/FASE3-DEFINITION.md "Application Use Cases Module": Graph (CreateGraph, LoadGraph, ClearGraph, DeleteGraph, UpdateGraphMetadata), Nodes (AddNode, RemoveNode, DuplicateNode, MoveNode, UpdateNodeProperties, UpdateNodeMetadata, GroupNodes, UngroupNodes), Edges (CreateEdge, RemoveEdge, UpdateEdge, ReconnectEdge), Selection (SelectNode, SelectEdge, SelectMultiple, ClearSelection), Clipboard (CopySelection, CutSelection, PasteSelection), History (Undo, Redo), Validation (ValidateGraph, ValidateNode, ValidateConnection), Documents (ImportDocument, ExportDocument, MigrateDocument). "Cada acción debe ser un caso de uso independiente."
- S3: History & Command module per docs/FASE3-DEFINITION.md: undo, redo, agrupación de operaciones, historial de cambios, transacciones, restauración de estados; "Command Pattern con operaciones reversibles"; "Eliminar un nodo deberá contemplar la restauración de sus conexiones si se ejecuta un undo"; "El historial será independiente de la persistencia y de cualquier mecanismo de ejecución."
- S4: Events per docs/FASE3-DEFINITION.md: graph.created, graph.loaded, graph.changed, graph.saved, graph.exported, node.created, node.deleted, node.updated, node.selected, edge.created, edge.deleted, edge.updated, property.changed, validation.completed, plugin.registered, plugin.error. "Los eventos deben ser agnósticos respecto al framework visual." Host can subscribe to synchronize data or update UI.
- S5: "debes respetar la arquitectura global presente en @docs/GLOBAL-ARCHITECTURE.md" — Application Core coordinates domain services through Commands/Queries/Events; use cases never receive React Flow objects; history belongs to the Application Layer ("Gestionar el historial de cambios"); no framework imports in packages/application or packages/history.
- S6: "Recuerda que debes usar TDD estricto" — one RED test per rule before implementing; observed RED→GREEN per task.
- S7: DRY — reuse phase 1/2 assets: `Result/ok/err`, branded ids, `ValidationIssue/ValidationReport`, `Graph/Node/Edge/Port` entities, `NoderaDomain` (registries + createNode + validate), `graphToDocument/documentToGraph/normalizeGraphDocument/migrate`, serializers, `GraphError` kinds. No reimplementations of validation, mapping, or id logic.
- S8: Editor state is separate from the document and from canvas state (AGENTS.md §5.3): selection, clipboard buffer, and history live in the application layer and are never serialized into the portable document; clipboard payloads are portable data (document-model fragments), not object references.
- S9: Architecture of the two new packages (evidence: both are empty placeholders; history must not depend on domain): `@nodera/history` = framework-agnostic reversible-command engine (Command contract, stack, undo/redo, transactions/grouping, listeners) with zero domain imports; `@nodera/application` = graph commands + use cases + events + editor state, depending on domain/graph-model/validation/document/contracts/history.
- S10: Mutating use cases are transactional: each executes its command, pushes it to history as one undo unit, and emits the corresponding events (one logical operation = one history entry + its documented events, no duplicate events for one operation, AGENTS.md §12). Failed operations return structured `Result` errors, mutate nothing, push nothing, emit nothing.
- S11: Domain gaps required by S2 that phase 1 did not implement are added to `graph-model` minimally and with TDD: node repositioning, `Graph.clear()`, metadata update, edge update (label/metadata), node duplication inputs; cross-element orchestration (e.g. reconnect, duplicate with edges) stays in the application layer.
- S12: GroupNodes/UngroupNodes (S2) are deferred with logged rationale: the domain has no grouping model and fase 2 kept groups document-layer-only (fase2 L9a/L10); adding group semantics to the domain is a phase-4+ decision. The use cases are not invented ad hoc.
- S13: Validation pipeline use cases reuse `NoderaDomain.validate`/`validateGraph` (structural+domain) and emit `validation.completed` with the `ValidationReport`; ValidateNode/ValidateConnection validate through the same context, not with ad-hoc logic.
- S14: Document use cases wrap fase-2 assets: ImportDocument (parse→normalize→migrate→documentToGraph→LoadGraph), ExportDocument (graphToDocument→serialize), MigrateDocument (documentVersionMigrator); emit graph.loaded/graph.exported; parse/serialization failures return structured diagnostics, never throw for data problems.
- S15: `plugin.registered`/`plugin.error` event types are declared in the event contract with typed payloads (plugin era is Fases 6-7) but nothing fires them in this phase.
- S16: New code matches workspace conventions (type module, tsc --noEmit, vitest colocated src/*.test.ts, NodeNext, strict + exactOptionalPropertyTypes) per explorer evidence.

## Non-goals

- Persistence adapters, plugin loading/manager, SDK facade (Phases 6-7).
- React/canvas adapters (Phase 4).
- Group semantics in the domain model (deferred, S12).
- Changing phase-1/2 public contracts incompatibly.

## Tasks

| ID | Specs | Route | Commit |
| --- | --- | --- | --- |
| T1 | S3,S9,S16,S6 | inline RED→GREEN `packages/history`: Command contract, undo/redo stack, transactions/grouping, listeners, history independence | f3-a |
| T2 | S4,S15,S9,S16,S6 | inline RED→GREEN `packages/application` events: typed event names/payloads, EventBus (subscribe/unsubscribe/emit) | f3-b |
| T3 | S8,S9,S10,S16,S6 | inline RED→GREEN editor engine: holds graph+domain services+selection+clipboard+history, wires events | f3-b |
| T4 | S11,S2,S10,S6 | inline RED→GREEN graph-model gap methods (S11 list) | f3-c |
| T5 | S2,S10,S6 | inline node use cases + commands (Add, Remove, Duplicate, Move, UpdateProperties, UpdateMetadata) | f3-c |
| T6 | S2,S10,S6 | inline graph + edge use cases + commands (Create/Load/Clear/Delete/UpdateGraphMetadata; Create/Remove/Update/ReconnectEdge) | f3-d |
| T7 | S2,S8,S6 | inline selection use cases (SelectNode, SelectEdge, SelectMultiple, ClearSelection) + events | f3-e |
| T8 | S2,S8,S7,S6 | inline clipboard use cases (Copy/Cut/Paste) over portable payloads | f3-e |
| T9 | S13,S4,S6 | inline validation pipeline use cases + validation.completed | f3-f |
| T10 | S14,S4,S6 | inline document use cases (Import/Export/Migrate) + loaded/saved/exported events | f3-f |
| T11 | S2,S3,S6 | inline history use cases (Undo/Redo) + end-to-end integration tests (delete node → undo restores connections, transaction grouping, event order) | f3-g |
| T12 | S1,S16 | inline docs (README/phase notes), full gate for affected packages, coverage check | f3-g |

## Log

- L1 (verbatim): "Vamos a hacer ahora solo la Fase 3 especificada en @docs/ROADMAP.md . La definición de modulos de esta fase está en @docs/FASE3-DEFINITION.md y debes respetar la arquitectura global presente en @docs/GLOBAL-ARCHITECTURE.md. Además debes tener en cuenta lo que se ha hecho en la fase 1 definida en el documento @docs/FASE1-DEFINITION.md y en la fase 2 definida en @docs/FASE2-DEFINITION.md . Recuerda que debes usar TDD estricto. Haz una investigacion profunda para hacer la planificacion de tareas tambien."
- L2: Explorer evidence mw5utgeh-1-85h2 — packages/history and packages/application are empty placeholders; nothing of phase 3 exists. Graph is a mutable aggregate; removeNode already returns attached edges (undo-friendly). No lint implementation exists repo-wide (lint passes vacuously). Vitest 3.0.5, colocated tests, turbo tasks typecheck/test/build with dependsOn ^build.
- L3: S12 defers GroupNodes/UngroupNodes (no domain grouping model; consistent with fase 2 L9a).

## Verification

- Per-task: vitest RED→GREEN in-package.
- Final: `pnpm turbo run typecheck test build` for affected packages; end-to-end undo/redo and event tests as acceptance.

## Coverage

(filled at close)

## Commits

(filled at close)
