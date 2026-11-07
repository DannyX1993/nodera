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
- L4 (audit, user: "revisa en profundidad a ver si ya hemos hecho todo lo de fase 3"): inline deep audit (runtime refused the external verifier; inline per rule). Findings: (1) real defect in `removeEdge` — it removed the edge before pushing, so the command's own `apply` re-added it and the edge was never removed; RED test proved it, fixed with capture-first pattern like `removeNode` (tests in remove-edge.test.ts). (2) Real defect in `pasteSelection` — a failure after some nodes were already created leaked them (non-atomic); RED test proved it, fixed by removing created nodes on the failure path (paste-leak.test.ts). (3) Gap: `undo`/`redo` use cases were not exported from the package index — fixed. (4) Gap: `updateEdge`/`reconnectEdge` had no dedicated tests — added pinning tests (7 passing, behavior already correct).
- L5 (audit): event completeness — 14 of 16 documented events are emitted by use cases today. `plugin.registered`/`plugin.error` are declared with typed payloads but nothing fires them (S15 deferral, plugin era Fases 6-7). `graph.saved` is declared but no save operation exists in the phase-3 use case list (FASE3-DEFINITION has no SaveGraph use case; persistence adapters come later): declared-only until a save use case is defined.
- L6 (audit): architecture verified — `packages/history` imports nothing from `@nodera/*` (grep-verified, zero matches); application use cases receive no framework objects; selection/clipboard never reach the portable document (clipboard payloads are plain data; graphToDocument takes only the graph).

## Verification

- Per-task: vitest RED→GREEN in-package (observed RED before each implementation).
- Final: `pnpm turbo run typecheck test build` → 36/36 tasks successful for the whole monorepo; no regressions in phases 1-2 suites (document 58, validation 16, domain 12, serializers 17, graph-model 24+2).
- End-to-end acceptance in `integration.test.ts`: delete-node undo restores connections, document round-trip, single logical operation = single events, history reset on target change.

## Coverage

- S1: all eight phase-3 modules implemented across `packages/history` and `packages/application` (plus minimal graph-model primitives per S11).
- S2: Graph (create/load/clear/delete/updateMetadata), Nodes (add/remove/duplicate/move/updateProperties/updateMetadata), Edges (create/remove/update/reconnect), Selection (node/edge/multiple/clear), Clipboard (copy/cut/paste), History (undo/redo), Validation (graph/node/connection), Documents (import/export/migrate). GroupNodes/UngroupNodes deferred per S12.
- S3: Command Pattern with reversible operations in `@nodera/history`: undo/redo stack, transactions (one undo unit), grouping, history-limit, dispose; history independent of persistence and execution (zero domain imports, typecheck-enforced). Node removal restores its connections on undo (integration test).
- S4: 16 event names with typed payloads + EventBus; `plugin.registered`/`plugin.error` declared but never fired (S15).
- S5: application/history import no framework; use cases are plain functions over `EditorEngine`; `graph.changed` emitted once per logical operation (S10).
- S6: every task observed RED first.
- S7: reuse of Result/ids/ValidationIssue, Graph/Node/Edge, NoderaDomain (createNode/validate), document mapping/versioning, both serializers.
- S8: selection/clipboard live in editor state, never in history; clipboard stores portable plain-data payloads; selection never creates history units (test).
- S9: two new packages match workspace conventions; `@nodera/history` has zero `@nodera/*` dependencies.
- S10: failed operations return structured Result errors, mutate nothing, push nothing, emit nothing (tests per use case).
- S11: graph-model gained setPosition/setMetadata (Node, Edge, Graph), Graph.clear/setMetadata — minimal, TDD, contract signatures untouched (verified via `Node`/`Edge` constructor order preservation and consumers' suites).
- S12: GroupNodes/UngroupNodes deferred with rationale (no domain grouping model; fase-2 kept groups document-layer-only).
- S13: validation use cases run through `NoderaDomain.validate`; validateConnection is non-persisting probe; `validation.completed` emitted once.
- S14: Import = parse→normalize→migrate→documentToGraph→load (history reset, graph.loaded); Export = graphToDocument→serialize (graph.exported); Migrate = documentVersionMigrator; unsupported formats/versions → structured issues.
- S15: plugin.* event types declared with typed payloads; nothing fires them.
- S16: conventions matched (type module, tsc --noEmit, vitest colocated, strict + exactOptionalPropertyTypes clean).

## Commits

- f3-a: 6abdc6a feat(history): framework-agnostic reversible command engine with undo/redo, transactions and listeners (T1)
- f3-b: e4f7156 feat(application): typed framework-agnostic editor events and event bus (T2)
- f3-b: 78a94f9 feat(application): editor engine composing domain, history, events, selection and clipboard state (T3)
- f3-c: b9f3ba9 feat(graph-model): minimal mutation primitives for editing (T4)
- f3-d: a06c2e8 feat(application): node and edge use cases with reversible commands and events (T5, T6)
- f3-e: 5c249fe feat(application): graph use cases (create, load, clear, delete, metadata) (T6)
- f3-f: c2f522b feat(application): selection, clipboard, validation and document use cases (T7, T8, T9, T10)
- f3-g: 729710f feat(application): undo/redo use cases and end-to-end integration tests (T11)
- f3-h: (this commit) audit fixes: removeEdge capture-first, paste atomicity, history exports, edge pinning tests
